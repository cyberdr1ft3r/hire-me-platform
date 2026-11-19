#!/usr/bin/env bash
set -euo pipefail

test "${NODE_ENV:-}" = test
: "${TEST_DATABASE_URL:?Provision a disposable test database before browser acceptance}"
export DATABASE_URL="$TEST_DATABASE_URL" DIRECT_URL="$TEST_DATABASE_URL"
pnpm --filter @hire-me/api test:db:check-catalog

export HIREME_BROWSER_WEB=http://127.0.0.1:5198
export HIREME_BROWSER_API=http://127.0.0.1:3118
mkdir -p .tmp-runtime/functional-ui
HIREME_BROWSER_EVIDENCE=$(mktemp -d "$PWD/.tmp-runtime/functional-ui/baseline-XXXXXX")
export HIREME_BROWSER_EVIDENCE

# Use a private upload root and local-only runtime settings for this synthetic database.
(
  cd apps/api
  export API_HOST=127.0.0.1 API_PORT=3118 API_CORS_ORIGIN="$HIREME_BROWSER_WEB"
  export AUTH_ACCESS_TOKEN_SECRET=FunctionalQaOnlyAccessTokenSecretWithEnoughCharacters
  export AUTH_REFRESH_TOKEN_PEPPER=FunctionalQaOnlyRefreshTokenPepperWithEnoughCharacters
  export AUTH_COOKIE_SECURE=false INVOICE_ISSUANCE_ENABLED=false
  export PRIVATE_UPLOAD_STORAGE_ROOT="$HIREME_BROWSER_EVIDENCE/private-uploads"
  exec node --import tsx src/main.ts
) > "$HIREME_BROWSER_EVIDENCE/api.log" 2>&1 &
api_pid=$!
browser_pids=("$api_pid")
trap 'kill "${browser_pids[@]}" 2>/dev/null || true' EXIT
(
  cd apps/web
  export VITE_API_BASE_URL="$HIREME_BROWSER_API"
  exec node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5198 --strictPort
) > "$HIREME_BROWSER_EVIDENCE/web.log" 2>&1 &
web_pid=$!
browser_pids+=("$web_pid")

timeout 60 bash -c 'until curl -fsS --max-time 2 "$HIREME_BROWSER_API/health" >/dev/null &&
  curl -fsS --max-time 2 "$HIREME_BROWSER_WEB" >/dev/null; do sleep 1; done'
kill -0 "$api_pid" "$web_pid"
node .github/scripts/baseline-browser-smoke.mjs
