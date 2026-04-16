#!/bin/bash
# Start Expo dev server for development builds (expo-dev-client).
# Usage: ./scripts/start-expo-dev-client.sh  (from repo root or any cwd)

set -e
cd "$(dirname "$0")/.."

# Default Metro port (override with RCT_METRO_PORT or METRO_PORT if you use a different one)
METRO_PORT="${RCT_METRO_PORT:-${METRO_PORT:-8081}}"

# Best-effort LAN IPv4 for physical device / same-network testing (e.g. 192.168.x.x)
local_ipv4() {
  local ip
  case "$(uname -s)" in
    Darwin)
      for iface in en0 en1; do
        ip=$(ipconfig getifaddr "$iface" 2>/dev/null) || true
        if [[ -n "$ip" ]]; then
          echo "$ip"
          return 0
        fi
      done
      ;;
  esac
  if command -v hostname >/dev/null 2>&1; then
    ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    if [[ -n "$ip" ]]; then
      echo "$ip"
      return 0
    fi
  fi
  return 1
}

LOCAL_IP=""
if _ip=$(local_ipv4); then
  LOCAL_IP="$_ip"
fi

print_lan_urls() {
  if [[ -n "${LOCAL_IP:-}" ]]; then
    echo ""
    echo "  Expo (dev client) — connect from a device on the same Wi‑Fi:"
    echo "    exp://${LOCAL_IP}:${METRO_PORT}"
    echo "  Metro (bundler): http://${LOCAL_IP}:${METRO_PORT}"
    echo ""
  else
    echo ""
    echo "  (Could not detect a LAN IP; use Expo output above.)"
    echo ""
  fi
}

# Print after Expo’s startup banner so it stays near the bottom of the log (no scroll-up).
(
  sleep 4
  print_lan_urls
) &
DELAY_PID=$!

cleanup() {
  # If we exit before the delayed print, show the URL once on exit instead.
  if kill -0 "$DELAY_PID" 2>/dev/null; then
    kill "$DELAY_PID" 2>/dev/null || true
    wait "$DELAY_PID" 2>/dev/null || true
    print_lan_urls
  fi
}
trap cleanup EXIT

npx expo start --dev-client --clear
