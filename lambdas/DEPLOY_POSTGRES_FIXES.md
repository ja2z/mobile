# Deploy Postgres Fixes to All Lambdas

The Postgres SSL configuration has been fixed in the shared code. All Lambdas that use activity logging need to be rebuilt and redeployed.

## Lambdas That Need Updates

1. ✅ **my-buys-handler** - Already rebuilt and deployed
2. ⏳ **generateSigmaEmbedURL** - Built, needs deployment (requires AWS auth)
3. ⏳ **admin-handler** - Needs rebuild and deployment
4. ⏳ **mobile-auth-handler** - Needs rebuild and deployment

## Steps to Deploy

### 1. Re-authenticate AWS CLI

```bash
export AWS_PROFILE=saml
# Then re-authenticate via Okta/SAML
```

### 2. Deploy generateSigmaEmbedURL

```bash
cd lambdas/generate-url
./deploy-lambda-s3.sh
```

### 3. Rebuild and Deploy Other Lambdas

For each Lambda that uses activity logging:

```bash
# admin-handler
cd lambdas/admin-handler
./build-lambda.sh
./deploy-lambda-s3.sh

# mobile-auth-handler  
cd lambdas/auth-handler
./build-lambda.sh
./deploy-lambda-s3.sh
```

## What Was Fixed

1. **Postgres SSL Configuration**: Updated to always use SSL with `rejectUnauthorized: false` for RDS self-signed certificates
2. **Connection Timeout**: Reduced to 5 seconds to fail faster
3. **TypeScript Build Errors**: Removed unused `@ts-expect-error` directives

## Verification

After deploying, test launching an applet (not My Buys) and check:
1. Applet launches successfully
2. Activity is logged to Postgres (check Activity Log screen in app)
3. No SSL certificate errors in CloudWatch logs

## Quick Deploy Script

```bash
#!/bin/bash
export AWS_PROFILE=saml
export AWS_CA_BUNDLE=""
export PYTHONHTTPSVERIFY=0

# Deploy generate-url
cd lambdas/generate-url && ./deploy-lambda-s3.sh && cd ../..

# Deploy admin-handler
cd lambdas/admin-handler && ./build-lambda.sh && ./deploy-lambda-s3.sh && cd ../..

# Deploy auth-handler
cd lambdas/auth-handler && ./build-lambda.sh && ./deploy-lambda-s3.sh && cd ../..

echo "✅ All Lambdas deployed!"
```

