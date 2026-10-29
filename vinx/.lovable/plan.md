## Phase 2 Backend Prep — Native Ingestion Support

### 1. Database schema changes (migration)

**New table: `device_tokens`** — long-lived bearer tokens for external devices.
- `id uuid PK`, `user_id uuid`, `name text` (e.g. "My Pixel 9"), `token_hash text` (sha256, unique), `token_prefix text` (first 8 chars for display), `last_used_at timestamptz`, `revoked_at timestamptz`, `created_at`.
- RLS: users manage their own tokens. Service role validates by hash.
- GRANTs for authenticated + service_role.

**New table: `ingestion_queue`** — buffer for batched android events before processing.
- `id uuid PK`, `user_id uuid`, `source_app text`, `capture_type text`, `raw_content text`, `client_timestamp timestamptz`, `metadata jsonb`, `content_hash text` (for dedup), `status text default 'queued'` (queued | processing | done), `created_at`.
- Index on `(status, created_at)` for the worker.
- Index on `(user_id, content_hash)` for dedup lookups.

**Extend `raw_memories`** with the new metadata columns:
- `platform text` (e.g. "android", "web"), `app_package text` (e.g. "com.youtube"), `capture_type text` (e.g. "screen_ocr", "notification", "voice", "manual").
- Backfill existing rows: `platform='web'`, `capture_type='manual'`.

**Extend `memory_vectors`** (vector DB wrapper) with the same three metadata fields so retrieval can filter — plus an index on `(user_id, platform, app_package, capture_type)`.

**RPC `validate_device_token(token_hash text)`** — security-definer function that returns the `user_id` for a valid, non-revoked token and updates `last_used_at`. Lets the edge function authenticate without exposing the table.

### 2. Edge functions

**`POST /functions/v1/context-ingest`** (deployed as the `/api/v1/context/ingest` route via the supabase functions URL).
- `verify_jwt = false` (we use bearer device tokens instead).
- Accepts JSON: `{ source_app, capture_type, raw_content, timestamp, metadata }` — validated with Zod.
- Also accepts a `batch` array of the same shape for bulk push.
- Reads `Authorization: Bearer <TOKEN>`, hashes it, calls `validate_device_token` RPC → resolves `user_id`.
- Computes `content_hash` = sha256 of normalized `raw_content`. Skips inserting if same hash exists for that user in the last 10 minutes (dedup).
- Inserts into `ingestion_queue` with `status='queued'`. Returns `202 Accepted` immediately so the device doesn't wait on AI.

**`POST /functions/v1/process-ingestion-queue`** (worker).
- `verify_jwt = false`, secured by a `WORKER_SECRET` header (auto-generated, stored as secret).
- Pulls up to N queued rows older than 60s OR batches of M rows, groups by `user_id`, deduplicates content within the batch.
- For each row: inserts a `raw_memories` row carrying `platform / app_package / capture_type / source_app`, then invokes the existing `process-memory` function. Marks queue row `done`.
- Designed to be called by a cron (pg_cron) every 60 seconds. We'll schedule it in the migration.

**Device-token management endpoints (in-app)** — handled client-side using the authenticated session:
- New helper edge function `generate-device-token` (`verify_jwt = true`): generates a 32-byte token, stores only its hash + prefix, returns the plaintext ONCE.
- Revoke is a direct supabase update from the client (RLS-protected).

### 3. Frontend

**Settings page**: new "Device Keys" card.
- "Generate Device Key" button → modal with name input → calls `generate-device-token` → shows the plaintext token once with a copy button and a warning.
- Lists existing keys (name, prefix `mm_xxxxxxxx…`, last used, created). Revoke button per row.

No changes to existing capture / web UI behavior.

### 4. Files touched

| File | Action |
|------|--------|
| `supabase/migrations/<ts>_phase2_ingestion.sql` | new — tables, columns, RPC, cron |
| `supabase/functions/context-ingest/index.ts` | new |
| `supabase/functions/process-ingestion-queue/index.ts` | new |
| `supabase/functions/generate-device-token/index.ts` | new |
| `supabase/config.toml` | register 3 new functions |
| `src/components/settings/DeviceKeys.tsx` | new |
| `src/pages/Settings.tsx` | mount DeviceKeys card |
| `docs/ANDROID_INGEST_API.md` | new — endpoint contract for the native client / GPT-5 |

### Notes

- We use the existing `LOVABLE_API_KEY` for embeddings (no OpenAI bill). The batching still matters: every queue flush = 1 AI call per memory, so dedup + 60s windows cut that materially.
- We use Postgres + a cron-driven worker as the "queue" — no Redis/BullMQ needed in the Supabase environment, and it survives restarts.
- Tokens are hashed at rest; plaintext is only ever returned at creation time.
