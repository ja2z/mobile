# admin-handler

Lambda behind `PUT/GET/POST/DELETE /v1/admin/*` (users, whitelist, activity
logs, applets, built-in applet color). Shares code with other handlers via
`../shared/`.

## Redeploy checklist

Run from the repo root after pulling the latest `main`:

```
1. git pull
2. cd lambdas/admin-handler
3. ./build-lambda.sh                       # auto-installs ../shared deps if missing
4. ./deploy-lambda-s3.sh                   # requires AWS_PROFILE=saml
5. ./add-built-in-applet-color-route.sh    # one-time; idempotent if re-run
6. cd ../.. && eas update --branch <branch>  # publish mobile client update
```

Step 5 only needs to run the first time the admin Apps color route is
deployed to an API Gateway that did not previously have it. The script is
idempotent, so re-running it on an already-configured stage is a no-op.
