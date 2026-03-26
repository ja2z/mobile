#!/usr/bin/env bash
# Backfill applets.deep_link_slug after running applet-deep-link-migration.sql (part 1).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/lambdas/auth-handler"
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi
export PGSSLMODE="${PGSSLMODE:-require}"
npm install
npm run build
node dist/shared/backfill-applets-deep-link-slugs.js
