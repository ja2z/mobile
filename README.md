# Big Buys Mobile

A React Native + Expo reference app showing how to embed [Sigma](https://www.sigmacomputing.com) dashboards in a native mobile experience. It renders signed-JWT Sigma embeds inside a WebView and layers on native mobile capabilities — camera/OCR input, voice-to-text, push-style deep links, and an admin console — to show what a production-grade Sigma mobile integration can look like.

Distributed via TestFlight for internal demos and select prospects; this is a reference architecture, not a public product.

## What it demonstrates

- **Embedded analytics**: Sigma dashboards rendered via signed-JWT iframe embeds inside a native WebView, with dynamic embed-URL generation and auto-refresh.
- **Authentication**: Passwordless email magic-link sign-in, with SMS-based deep links for navigation handoff between devices.
- **Admin console**: Manage the approved-user allowlist, view activity logs, and configure "MyApps" — a curated set of applets end users can launch.
- **Native input modes**: On-device text recognition (camera → OCR) and voice-to-text for hands-free/keyboard-free workflows layered on top of embedded dashboards.
- **Conversational AI**: A native chat surface that can query Sigma workbooks conversationally.

## Tech stack

- **Framework**: React Native + Expo, with [expo-router](https://docs.expo.dev/router/introduction/) for navigation. Native projects (`ios/`, `android/`) are gitignored and regenerated via `expo prebuild`.
- **Language**: TypeScript throughout.
- **Targets**: iOS (primary, via TestFlight), Android (secondary).
- **Key libraries**: `react-native-webview` (dashboard embeds), `expo-dev-client` (custom dev client for native modules), `expo-secure-store` (credential storage), `expo-camera` / `@react-native-ml-kit/text-recognition` (OCR), `expo-speech-recognition` (voice input).
- **Backend**: AWS Lambda functions (Node/TypeScript) behind API Gateway, with Postgres (RDS) for application data and DynamoDB for short-lived tokens/links.

## App structure

```
/app             # screens (expo-router)
  _layout.tsx    # root layout + deep-link handler
  (tabs)/        # main navigation and screens
/components      # reusable UI, incl. the persistent HomeButton and DashboardView (WebView wrapper)
/constants       # app configuration (URLs, etc.)
/services        # API clients, auth service
/hooks
/lambdas         # backend Lambda functions (deployed separately from the app)
/plans           # architecture notes, setup guides, and writeups
```

Every screen includes a persistent `HomeButton` with a minimum 44×44pt hit area, so users can always get back to the home screen.

## Getting started

This app ships through [EAS Build](https://docs.expo.dev/build/introduction/) with a custom dev client — it does not run in the plain Expo Go app because of the native modules involved (camera, OCR, secure storage).

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Build a dev-client IPA**: `./scripts/eas-build.sh development` runs a local EAS build and drops the IPA in `builds/`. Install it on your iOS device (e.g. via Xcode's Devices window).
3. **Start the dev server**
   ```bash
   npm start
   ```
4. **Connect**: open the installed dev client on your device and connect to the Metro server started above.

Production builds (`./scripts/eas-build.sh production`) build and submit straight to TestFlight; `./scripts/eas-build.sh deploy <ipa-path>` submits an existing IPA. If you add a native dependency, re-run `expo prebuild` (or let the next EAS build do it) and ship a new dev-client build — the existing one won't pick up new native code via a JS-only reload.

## Backend

The mobile client talks to a set of AWS Lambda functions for authentication, embed-URL generation, admin operations, and applet data. Each function lives under `lambdas/<name>/` with its own build and deploy scripts. See [plans/mobile-auth-architecture.md](plans/mobile-auth-architecture.md) for the authentication design (magic links, session JWTs, SMS deep links) and [plans/DEVELOPMENT.md](plans/DEVELOPMENT.md) for a broader development guide.

## Further reading

- [plans/DEVELOPMENT.md](plans/DEVELOPMENT.md) — development guide and conventions.
- [plans/mobile-auth-architecture.md](plans/mobile-auth-architecture.md) — authentication system architecture.
- [plans/](plans/) — additional setup guides and design notes for individual features.
