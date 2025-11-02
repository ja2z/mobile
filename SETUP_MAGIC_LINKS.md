# Magic Link Setup for Expo Go Testing

## Quick Setup

To test magic links with Expo Go (instead of TestFlight), you need to configure the app to use direct custom scheme links.

### Step 1: Create `.env.local` file

Create a file named `.env.local` in the project root (same directory as `package.json`):

```bash
# From the project root
touch .env.local
```

### Step 2: Add the configuration

Open `.env.local` and add this line:

```
EXPO_PUBLIC_AUTH_LINK_TYPE=direct
```

### Step 3: Restart Expo

After creating/modifying `.env.local`, you **must** restart the Expo dev server:

1. Stop the current Expo server (Ctrl+C or Cmd+C)
2. Start it again: `npm start` or `expo start`
3. Reload the app in Expo Go

### Step 4: Test

1. Request a magic link from the login screen
2. Check your email
3. The link should be in format: `bigbuys://auth?token=...`
4. Clicking it should open Expo Go directly

## How It Works

- **With `.env.local` containing `EXPO_PUBLIC_AUTH_LINK_TYPE=direct`**:
  - Magic links use the custom scheme: `bigbuys://auth?token=xxx`
  - Works directly with Expo Go
  - No redirect server needed

- **Without `.env.local` (or with `EXPO_PUBLIC_AUTH_LINK_TYPE=universal`)**:
  - Magic links use universal links: `https://mobile.bigbuys.io/auth/verify?token=xxx`
  - Requires redirect server
  - Works with TestFlight/production builds

## Important Notes

1. **`.env.local` is already in `.gitignore`** - it won't be committed to git
2. **Each developer can have their own `.env.local`** - perfect for individual testing
3. **For production builds**: Make sure `.env.local` doesn't exist (or set it to `universal`) when running `npx expo prebuild`

## Production Builds

When building for TestFlight/production:

**Option 1** (Recommended): Delete or rename `.env.local` before building:
```bash
mv .env.local .env.local.backup
npx expo prebuild --platform ios --clean
# Build in Xcode...
mv .env.local.backup .env.local  # Restore for local dev
```

**Option 2**: Explicitly set the env var during build:
```bash
EXPO_PUBLIC_AUTH_LINK_TYPE=universal npx expo prebuild --platform ios --clean
```

The app defaults to `universal` if no env var is set, so production builds will work correctly.

## Troubleshooting

### Magic link still uses HTTPS URL
- Make sure `.env.local` exists and has `EXPO_PUBLIC_AUTH_LINK_TYPE=direct`
- Restart Expo dev server after creating/modifying `.env.local`
- Check that the file is in the project root (same folder as `package.json`)

### Magic link doesn't open Expo Go
- Make sure Expo Go is installed and running
- Try manually opening: `bigbuys://auth` (should open Expo Go)
- Check that `app.json` has `"scheme": "bigbuys"` configured

### Build includes `.env.local` values
- `.env.local` is read at build time if it exists
- For production builds, either remove it or explicitly override with `EXPO_PUBLIC_AUTH_LINK_TYPE=universal`

