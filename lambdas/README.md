# AWS Lambda Functions

This directory contains all AWS Lambda functions for the mobile app.

## Structure

- `auth-handler/` - Mobile app authentication Lambda (magic links, token verification, session management)
- `generate-url/` - Lambda function to generate Sigma embed URLs with JWT tokens

## Building and Deploying

Each Lambda function has its own build script. Navigate to the specific Lambda directory and run:

### Auth Handler
```bash
cd lambdas/auth-handler
./build-lambda.sh
# or
npm run package
```

### Generate URL
```bash
cd lambdas/generate-url
./build-lambda.sh
# or
npm run package
```

## Deployment

After building, upload the generated `.zip` file to AWS Lambda, or use the deploy script:

```bash
npm run deploy
```

Make sure you have AWS CLI configured with appropriate credentials.

