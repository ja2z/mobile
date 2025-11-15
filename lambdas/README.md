# AWS Lambda Functions

This directory contains all AWS Lambda functions for the mobile app.

## Structure

- `admin-handler/` - Admin operations Lambda (user management, whitelist management, activity logs)
- `auth-handler/` - Mobile app authentication Lambda (magic links, token verification, session management)
- `generate-url/` - Lambda function to generate Sigma embed URLs with JWT tokens

## Building and Deploying

Each Lambda function has its own build script. Navigate to the specific Lambda directory and run:

### Admin Handler
```bash
cd lambdas/admin-handler
./build-lambda.sh
./deploy-lambda-s3.sh
```

### Auth Handler
```bash
cd lambdas/auth-handler
./build-lambda.sh
./deploy-lambda-s3.sh
```

### Generate URL
```bash
cd lambdas/generate-url
./build-lambda.sh
./deploy-lambda-s3.sh
```

## Deployment

### Recommended: S3-Based Deployment (Faster for Large Files)

Each Lambda function now has an S3-based deployment script that's faster and more reliable for large zip files:

```bash
# Build the Lambda
./build-lambda.sh

# Deploy via S3 (recommended)
./deploy-lambda-s3.sh
```

**Benefits:**
- ✅ Faster uploads (no timeout issues)
- ✅ More reliable for large files (8MB+)
- ✅ Automatic S3 bucket creation
- ✅ Versioned deployments (timestamped S3 keys)

### Alternative: Direct Upload

You can also deploy directly (may timeout for large files):

```bash
npm run deploy
# or
aws lambda update-function-code --function-name <function-name> --zip-file fileb://<zip-file>
```

Make sure you have AWS CLI configured with appropriate credentials and authentication:
```bash
export AWS_PROFILE=saml
# Then authenticate via Okta/SAML
```

