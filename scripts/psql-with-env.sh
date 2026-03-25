#!/usr/bin/env bash
# Load repo-root .env, then run psql. Homebrew's libpq is keg-only, so we resolve psql explicitly.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi
PSQL_BIN=""
if command -v psql >/dev/null 2>&1; then
  PSQL_BIN="$(command -v psql)"
else
  for p in /opt/homebrew/opt/libpq/bin/psql /usr/local/opt/libpq/bin/psql; do
    if [[ -x "$p" ]]; then PSQL_BIN="$p"; break; fi
  done
fi
if [[ -z "${PSQL_BIN}" ]]; then
  echo "psql not found. Install: brew install libpq" >&2
  exit 1
fi
exec "$PSQL_BIN" "$@"
