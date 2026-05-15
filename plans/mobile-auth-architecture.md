# Mobile Auth Architecture (as built)

This document describes the authentication system **as it actually exists in the repo today**, not the original Cursor spec it grew out of. The original spec lives in [.cursor/rules/architecture.mdc](../.cursor/rules/architecture.mdc) for historical reference; this doc supersedes it.

## Overview

The mobile app ("Big Buys Mobile", React Native + Expo, distributed via TestFlight) embeds Sigma dashboards via signed-JWT iframes. Auth gates access to those embeds and personalizes the embed URL.

Three flows are supported in production today:

1. **Email magic link** — self-service for `@sigmacomputing.com` users and whitelisted external emails.
2. **SMS handoff from desktop** — the desktop "Big Buys" app (already Okta-authenticated) calls the Lambda with an API key to send a magic-link SMS to a phone number.
3. **Backdoor auth** — dev/test path that skips magic links. Two-step hash validation (username hash, optionally password hash). Used for Expo Go development and select test accounts.

All three converge on the same outcome: a 14-day session JWT stored in `expo-secure-store` on device, used to authenticate subsequent API calls and personalize Sigma embed URLs.

## Components as built

### Lambda: `auth-handler`

Source: [lambdas/auth-handler/index.ts](../lambdas/auth-handler/index.ts). Single Lambda dispatches on path. Routes:

| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/auth/request-magic-link` | Email magic link (15-min token) |
| POST | `/v1/auth/send-to-mobile` | Desktop-to-mobile SMS handoff (Telnyx) |
| POST | `/v1/auth/verify-magic-link` | Exchange magic token for 14-day session JWT |
| POST | `/v1/auth/refresh-token` | Refresh JWT if within 7 days of expiry |
| POST | `/v1/auth/authenticate-backdoor` | Dev/test direct auth (two-step hash) |
| GET | `/v1/auth/me` | Fetch user profile (Bearer auth) |
| PATCH | `/v1/auth/me` | Update first/last name (Bearer auth) |
| GET | `/s/{shortId}`, `/v1/s/{shortId}`, `/v1/auth/s/{shortId}` | Resolve short URL to full magic link |

### Environment variables

All have defaults baked into [index.ts](../lambdas/auth-handler/index.ts); production overrides via Lambda configuration:

| Variable | Default |
|---|---|
| `TOKENS_TABLE` | `mobile-auth-tokens` |
| `SHORT_URLS_TABLE` | `mobile-short-urls` |
| `JWT_SECRET_NAME` | `mobile-app/jwt-secret` |
| `API_KEY_SECRET_NAME` | `mobile-app/api-key` |
| `BACKDOOR_SECRET_NAME` | `mobile-app/backdoor-secret` |
| `TELNYX_API_KEY_SECRET_NAME` | `mobile-app/telnyx-api-key` |
| `FROM_EMAIL` | `noreply@sigmacomputing.com` |
| `FROM_NAME` | *(unset)* |
| `APP_DEEP_LINK_SCHEME` | `bigbuys` |
| `REDIRECT_BASE_URL` | `https://mobile.bigbuys.io` |

### DynamoDB tables

- `mobile-auth-tokens` — magic-link tokens (15-min TTL) and session JWTs (14-day, tagged `sourceFlow`: email / sms / backdoor / refresh).
- `mobile-short-urls` — short-id → full magic-link URL, with TTL.

User profiles and approved emails are **not** in DynamoDB — see Postgres below.

### Postgres (RDS)

Primary store for everything user-shaped. Lambda connects via [lambdas/shared/postgres-client.ts](../lambdas/shared/postgres-client.ts), credentials fetched from `mobile-app/postgres-credentials` in Secrets Manager. Tables that auth touches:

- `users` — user profiles (id, email, first/last name, role, phone, phone-verified-at).
- `approved_emails` — whitelist for non-`@sigmacomputing.com` emails.
- `user_activity` — activity log (`app_launch`, `magic_link_sent`, `magic_link_verified`, etc.). Migrated from the deprecated `mobile-user-activity` DynamoDB table.

User profiles are **lazily provisioned** on first successful magic-link verification — they don't exist before that.

### Secrets Manager

- `mobile-app/jwt-secret` — HS256 signing key for session JWTs.
- `mobile-app/api-key` — required for SMS handoff and other server-to-Lambda calls.
- `mobile-app/backdoor-secret` — shared secret for backdoor auth (also distributed via EAS Secrets to the mobile build).
- `mobile-app/telnyx-api-key` — SMS sender.
- `mobile-app/postgres-credentials` — RDS connection credentials.

All secret ARNs in IAM policies must use the `-*` suffix (AWS appends random chars to secret names).

### Outbound integrations

- **AWS SES** — sends magic-link emails. From: `noreply@sigmacomputing.com`. Routed out of the VPC via the NAT Gateway → Internet Gateway path.
- **Telnyx** — `https://api.telnyx.com/v2/messages` over HTTPS. Used for SMS magic links; phone numbers in E.164. Replaces the SNS plan from the original spec.

### Networking (VPC + NAT)

Lambda runs inside a VPC so it can reach RDS. That means internet egress (SES, Telnyx) requires a NAT Gateway with an Elastic IP. Background and the original incident fix:
- [plans/LAMBDA_NETWORKING_EXPLANATION.md](LAMBDA_NETWORKING_EXPLANATION.md) — architecture overview.
- [plans/NAT_GATEWAY_FIX_SUMMARY.md](NAT_GATEWAY_FIX_SUMMARY.md) — original bug (no EIP → SES timeouts) and fix. Current EIP: `54.213.75.202`.

The NAT-Gateway IP change broke Gmail deliverability briefly:
- [plans/SES_SPAM_DIAGNOSIS.md](SES_SPAM_DIAGNOSIS.md) — root cause analysis.
- [plans/GMAIL_SPAM_FIX.md](GMAIL_SPAM_FIX.md) — remediation playbook.

## Flows as built

### Email magic link

```
mobile app  ──POST /v1/auth/request-magic-link──▶  auth-handler
                                                     │
                                                     ├─ check approved_emails (Postgres)
                                                     ├─ write magic token to mobile-auth-tokens (15 min)
                                                     ├─ optionally mint short URL → mobile-short-urls
                                                     └─ SES send email with link

user clicks link  ──▶  https://mobile.bigbuys.io/auth/verify?token=...
                       (S3 + CloudFront redirect; see plans/SETUP_MAGIC_LINKS.md)
                       │
                       └─ universal link / bigbuys:// scheme → app opens

mobile app  ──POST /v1/auth/verify-magic-link──▶  auth-handler
                                                    │
                                                    ├─ check token (mobile-auth-tokens)
                                                    ├─ lazy-create user in Postgres if first time
                                                    ├─ mint 14-day session JWT (HS256, jwt-secret)
                                                    └─ write session token row (sourceFlow=email)
```

### SMS handoff from desktop

```
desktop "Big Buys"  ──POST /v1/auth/send-to-mobile──▶  auth-handler
  (X-API-Key header)                                     │
                                                         ├─ verify API key (mobile-app/api-key)
                                                         ├─ write magic token (15 min)
                                                         ├─ mint short URL
                                                         └─ Telnyx send SMS

(then same verify path as email)
```

### Backdoor auth

For Expo Go development and select test accounts. See [plans/BACKDOOR_SETUP.md](BACKDOOR_SETUP.md).

```
mobile app  ──POST /v1/auth/authenticate-backdoor──▶  auth-handler
  (email + SHA-256 username hash,                       │
   optionally SHA-256 password hash)                    ├─ compare hash to BACKDOOR_HASH (and password hash if two-step)
                                                        ├─ lazy-create user (Postgres)
                                                        └─ mint 14-day JWT (sourceFlow=backdoor, isBackdoor=true)
```

### Session JWT shape

Issued by [lambdas/shared/session-jwt.ts](../lambdas/shared/session-jwt.ts):

```ts
{
  userId: string,
  email: string,
  role: 'basic' | 'admin',
  deviceId: string,
  isBackdoor?: boolean,
  iat: number,
  exp: number,   // 14 days from issue
}
```

JWT can be refreshed via `POST /v1/auth/refresh-token` if the call lands within the last 7 days of the JWT's lifetime.

## Mobile-side integration

- **AuthService** — [services/AuthService.ts](../services/AuthService.ts). Wraps the API: `requestMagicLink`, `verifyMagicLink`, `authenticateBackdoor`, `getMe`, `updateProfileName`, `refreshToken`. Persists `{ token, user }` in `expo-secure-store`. Creates and stores a stable `deviceId` on first launch.
- **Deep-link handler** — [app/_layout.tsx](../app/_layout.tsx) (around lines 864–1170). Parses both `bigbuys://auth?token=…` (custom scheme for Expo Go) and `https://mobile.bigbuys.io/...` (universal/app links for TestFlight). For short URLs (`/s/{shortId}`) it calls Lambda to resolve, then recurses with the full URL. Extracts `app`, `pageId`, `variables` and routes to the right screen: `mybuys:<slug>` → user-applet match; otherwise built-in applets (Conversational AI, Dashboard, Operations).
- **Deep-link config** — [app.json](../app.json). Custom scheme `bigbuys`, iOS `associatedDomains: ["applinks:mobile.bigbuys.io"]`, Android `assetlinks.json` served via S3/CloudFront. Path patterns `/auth/verify*`. Universal-link redirect page is HTML in [lambdas/auth-handler/auth-redirect.html](../lambdas/auth-handler/auth-redirect.html); see [plans/REDIRECT_SETUP.md](../lambdas/auth-handler/REDIRECT_SETUP.md).
- **Link-type toggle** — `EXPO_PUBLIC_AUTH_LINK_TYPE` env var. `direct` = custom scheme `bigbuys://` (dev/Expo Go); `universal` = `https://mobile.bigbuys.io/...` (production). See [plans/SETUP_MAGIC_LINKS.md](SETUP_MAGIC_LINKS.md).
- **Login-instance ID** — a per-login random ID stored in secure storage. Used to drive a one-time phone-verification nudge per login session, dismissible.

## Notable post-spec changes

What the as-built system does differently from the original Cursor spec:

- **Postgres replaces DynamoDB for user data.** Original spec had `mobile-auth` and `approved-emails` DynamoDB tables. The current system uses Postgres for `users`, `approved_emails`, and `user_activity`. DynamoDB is now scoped to short-TTL auth tokens and short URLs only. Migration tooling: [lambdas/shared/migrate-dynamodb-to-postgres.ts](../lambdas/shared/migrate-dynamodb-to-postgres.ts).
- **Telnyx replaces SNS for SMS.** Original spec named SNS; Telnyx was chosen for deliverability and observability.
- **Backdoor auth flow added.** Not in the original spec. Documented in [plans/BACKDOOR_SETUP.md](BACKDOOR_SETUP.md).
- **Short-URL system added.** `mobile-short-urls` table + resolver routes. Lets SMS messages stay under length limits and lets us swap link destinations server-side.
- **VPC + NAT Gateway with EIP.** The networking story is more complex than the original spec implied; deliverability depends on the NAT EIP's reputation. See the networking plan docs above.
- **Universal-link redirect page.** S3-hosted HTML at `mobile.bigbuys.io/auth/verify` bridges universal links → custom-scheme deep link when needed.
- **Login-instance phone-nudge.** UX layer not present in the original spec.

## Open / deferred items

From the original spec's Artifacts 1–10 checklist, these were deliberately skipped or never built out:

- **Rate limiting** — no explicit rate limit on `/request-magic-link` or `/send-to-mobile` beyond what API Gateway provides by default.
- **API-key rotation strategy** — none documented. Manual via Secrets Manager.
- **Revocation flow** — no admin-facing "kill this session" endpoint. Practical revocation is rotating `mobile-app/jwt-secret`, which invalidates every active JWT at once.
- **Production deployment guide** — superseded by the per-Lambda `deploy-lambda-s3.sh` scripts and the global [[lambda-deployment]] skill.

## Related references

- AWS CLI procedures and SAML auth: global skill [[aws-cli-usage]].
- Lambda build/deploy procedures and IAM/secret grants: global skill [[lambda-deployment]].
- RDS/Postgres connection and migrations: project skill [[postgres-connection]].
- Project-wide AWS identifiers (ARNs, account ID, function names): [../CLAUDE.md](../CLAUDE.md).
