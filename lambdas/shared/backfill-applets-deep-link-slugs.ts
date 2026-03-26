/**
 * One-off: backfill applets.deep_link_slug for rows where it is null.
 * Run from lambdas/auth-handler after build: node dist/shared/backfill-applets-deep-link-slugs.js
 * Requires PG* env vars (use repo .env + PGSSLMODE=require).
 */
import { backfillMissingDeepLinkSlugs } from './applets-service';

backfillMissingDeepLinkSlugs()
  .then((n) => {
    console.log(`Backfill complete: ${n} row(s) updated`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
