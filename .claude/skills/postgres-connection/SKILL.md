---
name: postgres-connection
description: >-
  Connect to the mobile app's RDS Postgres for migrations and ad-hoc SQL from
  this repo. Use when running migrations, executing one-off SQL, working with
  the `users`, `approved_emails`, `user_activity`, `applets`, `built_in_applets`,
  or `sigma_org_config` tables, or troubleshooting `psql` connectivity to RDS.
---

# Postgres (RDS) — connection and migrations

The mobile app's primary persistence is **Postgres on RDS**. Auth tokens and short URLs live in DynamoDB; everything else (users, approved emails, activity logs, MyApps applets, built-in applets, Sigma org config) lives here.

> **Naming note:** the user-facing feature is now called **MyApps**. It was originally **MyBuys**, and the legacy name lingers in identifiers — Lambda `my-buys-handler`, deprecated DynamoDB table `mobile-my-buys-applets`. Treat "MyBuys" and "MyApps" as the same feature in code/docs.

## Connection

Credentials live in the repo-root `.env` (gitignored). Standard libpq variables:

- `PGHOST`
- `PGPORT`
- `PGUSER`
- `PGPASSWORD`
- `PGDATABASE`

RDS requires TLS from most networks. Always set:

```bash
export PGSSLMODE=require
```

## Run `psql` with `.env` loaded

From the repo root:

```bash
set -a && source .env && set +a
export PGSSLMODE=require
./scripts/psql-with-env.sh
```

One-shot SQL:

```bash
set -a && source .env && set +a
export PGSSLMODE=require
./scripts/psql-with-env.sh -v ON_ERROR_STOP=1 -f path/to/script.sql
```

`scripts/psql-with-env.sh` loads `.env` and invokes Homebrew `psql` if needed.

## Migrations and seeds

Migration tooling lives in `lambdas/shared/`. The patterns are additive and idempotent so they're safe to re-run:

- **`lambdas/shared/run-migration.js`** — creates tables, runs `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for additive changes, seeds idempotently. Pulls Postgres credentials from AWS Secrets Manager (`mobile-app/postgres-credentials`), same path as deployed Lambdas — so you need AWS auth to run it unless you override the credentials via env.
- **`lambdas/shared/seed-built-in-applets.sql`** — reference seed for `sigma_org_config` and `built_in_applets`.
- **`lambdas/shared/patch-add-initial-page-id-to-built-in-applets.sql`** — idempotent column-add patch.
- Other `lambdas/shared/*.sql` files — historical patches kept as a paper trail.

For AWS auth setup before running `run-migration.js`, see the global [[aws-cli-usage]] skill.

## Schema notes

### `built_in_applets.initial_page_id`

Nullable column. Holds the Sigma **page id** used for first paint when opening a built-in applet from the app list (tap-to-open).

The `generate-url` Lambda still receives `page_id` in the **request body**; the mobile app passes it from navigation params sourced from this column when set. If the column is null for a row, the app falls back to the default page id baked into `Config.ts`.

### Tables that live in Postgres (vs DynamoDB)

- `users` — user profiles, lazy-provisioned on first magic-link verification.
- `approved_emails` — whitelist for non-`@sigmacomputing.com` emails.
- `user_activity` — activity logs (migrated from the deprecated `mobile-user-activity` DynamoDB table).
- `applets` — per-user MyApps applet configuration (migrated from the deprecated `mobile-my-buys-applets` DynamoDB table; feature was renamed from MyBuys to MyApps).
- `built_in_applets`, `sigma_org_config` — applet configuration.

Tables that remain in DynamoDB: `mobile-auth-tokens`, `mobile-short-urls`.

## Network caveats

- RDS lives inside the VPC. From a developer laptop, you'll usually need the corporate VPN.
- If `psql` from your laptop can't reach the host, the easy fallback is running the same SQL via the AWS console query editor.
- Deployed Lambdas reach RDS over the VPC routes set up via `lambdas/shared/setup-rds-postgres.sh` and `lambdas/shared/update-lambda-vpc-iam.sh`. See [plans/LAMBDA_NETWORKING_EXPLANATION.md](../../../plans/LAMBDA_NETWORKING_EXPLANATION.md) for the full picture.
