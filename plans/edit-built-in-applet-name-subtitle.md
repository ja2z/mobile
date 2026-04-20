# Edit Built-In Applet Name & Subtitle

Extends the admin "Apps" tab editor so an admin can update an applet's **name**,
**subtitle**, and **color** on the same modal. Previously only color was editable.

## Summary of changes

### Backend (Lambda)
- `lambdas/shared/built-in-applets-service.ts`
  - New `updateBuiltInApplet(appletId, { name?, subtitle?, color? })` that does
    a partial SQL update and returns the updated row.
- `lambdas/admin-handler/index.ts`
  - New route: `PUT /v1/admin/applets/built-in/{appletId}` → `handleUpdateBuiltInAppletDetails`
  - Validates `name` (non-empty string, ≤120 chars), `subtitle` (string/null,
    ≤240 chars, empty → null), and `color` (reused normalizer).
  - Logs `built_in_applet_updated` activity.
  - Existing `PUT /v1/admin/applets/built-in/{appletId}/color` route is kept
    for backwards compatibility.

### API Gateway
- New script: `lambdas/admin-handler/add-built-in-applet-update-route.sh`
  - Idempotent. Attaches `PUT` to the existing `{appletId}` resource (created
    by `add-built-in-applet-color-route.sh`) with AWS_PROXY integration and
    Lambda invoke permission, then deploys to the `v1` stage.

### Client
- `services/AdminService.ts`
  - New `AdminService.updateBuiltInApplet(appletId, updates)` wrapper.
- `components/EditBuiltInAppletColorModal.tsx`
  - Adds `TextInput`s for **Name** and **Subtitle**, keeps the color picker.
  - Save performs a single unified `updateBuiltInApplet` call (color always
    included, name/subtitle only when changed).
  - "Reset" button now clears the color only (same behavior as before).
  - `onSaved` now returns the full updated `BuiltInApplet` (was `string | null`).
- `components/AppsList.tsx`
  - `handleSaved` merges the whole updated applet into local state, so the
    row reflects name/subtitle edits immediately.

## Deploy steps

Run these once, in order, from the repo root:

```bash
# 1) Build + deploy admin-handler Lambda (TypeScript → zip → S3 → Lambda update)
cd lambdas/admin-handler
./build-lambda.sh
./deploy-lambda-s3.sh

# 2) Wire the new API Gateway route + deploy to v1 stage
./add-built-in-applet-update-route.sh
```

Auth notes: both deploys assume the SAML profile is current
(`export AWS_PROFILE=saml`). See `.cursor/rules/aws-cli-usage.mdc`.

## Smoke test

With an admin JWT:

```bash
curl -X PUT \
  -H 'Authorization: Bearer <admin-jwt>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"New Name","subtitle":"New subtitle","color":"#A855F7"}' \
  https://qx7x0uioo1.execute-api.us-west-2.amazonaws.com/v1/admin/applets/built-in/<appletId>
```

Expected: `200 { "applet": { ...updated row... } }`.

## In-app test (Expo Go)

1. Log in as an admin.
2. Open the **Apps** admin tab → tap any built-in applet row.
3. Edit **Name** and **Subtitle**, pick a new color, tap **Save**.
4. Modal closes; the row updates in place with the new name/subtitle/swatch.
5. Navigate to the user-facing list screen (e.g. Home / Dashboards) and
   confirm the tile shows the new name/subtitle/color after the
   `listBuiltInApplets` cache is invalidated (this is done automatically on
   save).
