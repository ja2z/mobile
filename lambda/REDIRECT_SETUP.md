# Auth Redirect Page Setup Guide

This guide explains how to host the redirect HTML page at `https://mobile.bigbuys.io/auth/verify` that redirects users to the mobile app deep link.

## Option 1: S3 + CloudFront (Recommended)

This is the simplest and most cost-effective approach for a static HTML page.

### Step 1: Create S3 Bucket

```bash
# Create bucket (must be globally unique)
BUCKET_NAME="mobile-bigbuys-redirect"
aws s3 mb s3://${BUCKET_NAME} --region us-west-2

# Enable static website hosting
aws s3 website s3://${BUCKET_NAME} \
  --index-document auth-redirect.html
```

### Step 2: Upload Redirect Page

The redirect page needs to be dynamic (it reads the token from URL params), but for simplicity, we'll create a single HTML file that uses JavaScript to extract the token.

```bash
# Copy the redirect HTML to a directory
mkdir -p redirect-site
cp auth-redirect.html redirect-site/index.html

# Upload to S3
aws s3 sync redirect-site/ s3://${BUCKET_NAME}/auth/verify/ \
  --delete \
  --content-type "text/html"
```

**Note:** S3 static hosting won't handle `/auth/verify` as a path - you'll need to either:
- Upload as `/auth/verify/index.html`, OR
- Use CloudFront with custom error pages to route requests

### Step 3: Set Up CloudFront Distribution

```bash
# Create CloudFront distribution
# This requires manual setup via AWS Console or CloudFormation
# See: https://docs.aws.amazon.com/cloudfront/latest/DeveloperGuide/distribution-web-creating.html
```

**CloudFront Setup Steps:**
1. Go to AWS Console → CloudFront → Create Distribution
2. Origin Domain: Select your S3 bucket
3. Origin Path: `/auth/verify`
4. Default Root Object: `index.html`
5. Viewer Protocol Policy: Redirect HTTP to HTTPS
6. Price Class: Use All Edge Locations (or cheapest if you want)
7. Create Distribution

### Step 4: Configure DNS

```bash
# Get CloudFront domain name
# Example: d1234567890.cloudfront.net

# Add CNAME record in your DNS:
# mobile.bigbuys.io → d1234567890.cloudfront.net
```

### Step 5: Update Lambda Environment Variable

```bash
# Update Lambda function with redirect base URL
aws lambda update-function-configuration \
  --function-name mobile-auth-handler \
  --environment Variables="{
    TOKENS_TABLE=mobile-auth-tokens,
    APPROVED_EMAILS_TABLE=mobile-approved-emails,
    JWT_SECRET_NAME=mobile-app/jwt-secret,
    API_KEY_SECRET_NAME=mobile-app/api-key,
    FROM_EMAIL=noreply@sigmacomputing.com,
    APP_DEEP_LINK_SCHEME=bigbuys,
    REDIRECT_BASE_URL=https://mobile.bigbuys.io
  }"
```

---

## Option 2: Use Existing Web Infrastructure

If you already have a web server/domain hosting `mobile.bigbuys.io`, simply:

1. Upload `auth-redirect.html` to `/auth/verify/index.html` (or configure your web server to serve it at that path)
2. Ensure the server can handle query parameters (most do by default)
3. Update Lambda environment variable as shown in Step 5 above

---

## Option 3: API Gateway + Lambda (For Dynamic Generation)

If you want more control or need server-side token validation:

1. Create a new Lambda function for redirect handling
2. Create API Gateway resource at `/auth/verify` 
3. Lambda generates the HTML page with token embedded
4. More complex but more secure (can validate token server-side)

---

## Testing the Redirect

Once set up, test with:

```bash
# Should redirect to: bigbuys://auth?token=test123
curl -I "https://mobile.bigbuys.io/auth/verify?token=test123"
```

Or open in a browser - it should immediately redirect to the app or show a fallback button.

---

## iOS Universal Links Setup

For iOS universal links to work automatically, you need an `apple-app-site-association` file hosted at:

`https://mobile.bigbuys.io/.well-known/apple-app-site-association`

### Create apple-app-site-association file

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAM_ID.com.sigmacomputing.bigbuys",
        "paths": ["/auth/verify*"]
      }
    ]
  }
}
```

Replace `TEAM_ID` with your Apple Developer Team ID.

### Upload to S3/Web Server

```bash
# Upload to root of your site
aws s3 cp apple-app-site-association.json s3://${BUCKET_NAME}/.well-known/apple-app-site-association \
  --content-type "application/json"
```

**Important:** 
- Must be at `/.well-known/apple-app-site-association` (no file extension)
- Must be served with `Content-Type: application/json`
- Must be accessible via HTTPS

---

## Android App Links Setup

For Android, create `assetlinks.json` at:

`https://mobile.bigbuys.io/.well-known/assetlinks.json`

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.sigmacomputing.bigbuys",
      "sha256_cert_fingerprints": [
        "YOUR_SHA256_FINGERPRINT_HERE"
      ]
    }
  }
]
```

Get your SHA256 fingerprint from:
```bash
# For debug keystore
keytool -list -v -keystore android/app/debug.keystore -alias androiddebugkey -storepass android -keypass android | grep SHA256

# For release keystore (when you have one)
keytool -list -v -keystore your-release-key.keystore -alias your-key-alias
```

Upload to S3:
```bash
aws s3 cp assetlinks.json s3://${BUCKET_NAME}/.well-known/assetlinks.json \
  --content-type "application/json"
```

---

## Quick Start (Minimal S3 Setup)

If you just want to get it working quickly:

```bash
# 1. Create bucket
aws s3 mb s3://mobile-bigbuys-redirect

# 2. Copy redirect HTML
mkdir -p redirect-site
cp auth-redirect.html redirect-site/index.html

# 3. Upload to S3 (this creates /auth/verify/index.html path)
aws s3 sync redirect-site/ s3://mobile-bigbuys-redirect/auth/verify/ \
  --content-type "text/html"

# 4. Enable public read access (for testing)
aws s3 cp s3://mobile-bigbuys-redirect/auth/verify/index.html \
  s3://mobile-bigbuys-redirect/auth/verify/index.html \
  --acl public-read

# 5. Get S3 website endpoint URL
# It will be: http://mobile-bigbuys-redirect.s3-website-us-west-2.amazonaws.com/auth/verify/
# Test with: http://mobile-bigbuys-redirect.s3-website-us-west-2.amazonaws.com/auth/verify/?token=test123

# 6. Set up CloudFront or use S3 website endpoint directly
# (S3 website endpoints don't support HTTPS, so CloudFront is recommended)
```

---

## Cost Estimate

- **S3:** ~$0.01/month (free tier covers 5GB storage)
- **CloudFront:** ~$0.01-0.50/month (depending on traffic)
- **Total:** ~$0.50/month for low traffic internal tool

---

## Troubleshooting

### Redirect not working
- Check browser console for JavaScript errors
- Verify token is in URL query params
- Test deep link manually: `bigbuys://auth?token=test123`

### iOS Universal Links not working
- Verify `apple-app-site-association` file is accessible
- Check file has no extension and correct content-type
- Verify app has correct `associatedDomains` in `app.json`
- Test with: `https://mobile.bigbuys.io/auth/verify?token=test` (must be HTTPS)

### Android App Links not working
- Verify `assetlinks.json` is accessible
- Check SHA256 fingerprint matches your keystore
- Verify `app.json` has correct intent filters
- Test with: `adb shell am start -a android.intent.action.VIEW -d "https://mobile.bigbuys.io/auth/verify?token=test"`

