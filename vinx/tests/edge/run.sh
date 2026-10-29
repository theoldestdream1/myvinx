#!/usr/bin/env bash
# Edge-function tests: runs the REAL handlers against a mock AI gateway and an in-memory fake of the
# database client. Requires Deno (https://deno.com). Usage: bash tests/edge/run.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$HERE/../.."
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

cp -r "$ROOT/supabase/functions" "$TMP/fn"
cp "$HERE/fake-auth.ts" "$TMP/fn/_shared/auth.ts"          # swap real auth/db for the fakes
for f in fakedb.ts serve_stub.ts deno.json run.ts embed_test.ts text_test.ts redact_test.ts telegram_test.ts capture_test.ts email_test.ts calendar_test.ts; do cp "$HERE/$f" "$TMP/$f"; done
cd "$TMP"

echo "== text helpers";  deno run --no-lock -A --config deno.json text_test.ts
echo "== embeddings";    deno run --no-lock -A --config deno.json embed_test.ts
echo "== integration";   deno run --no-lock -A --config deno.json run.ts
echo "== redaction";     deno run --no-lock -A --config deno.json redact_test.ts
echo "== telegram";      deno run --no-lock -A --config deno.json telegram_test.ts
echo "== capture api";   deno run --no-lock -A --config deno.json capture_test.ts
echo "== email intake";   deno run --no-lock -A --config deno.json email_test.ts
echo "== calendar feed";   deno run --no-lock -A --config deno.json calendar_test.ts
