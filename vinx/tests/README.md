# Tests

Not part of the app build. These exist so recall and sharing can't silently regress.

| Folder | What it covers | Run |
|---|---|---|
| `tests/edge/` | The real edge-function handlers (`process-memory`, `query-memories`, `reindex-memories`, `search-status`, the cron worker) against a mock AI gateway and an in-memory fake of the database client: screenshot understanding, embeddings fallbacks, "AI is down" scenarios, stuck-memory retries, auth. Also unit tests for the embeddings module, text helpers, the sensitive-content filter (`redact_test.ts`) and the whole Telegram channel (`telegram_test.ts`: linking, saving, photos, voice, undo, asking, reminders, daily brief, and that the bot token never reaches a log). | `bash tests/edge/run.sh` (needs [Deno](https://deno.com)) |
| `tests/web/` | The Share page state machine (saves instantly, once, undo, failures, voice notes, signed-out). | `npm i -D vitest jsdom @testing-library/react @testing-library/dom`, copy `share.flow.test.tsx` into `src/pages/`, `npx vitest run src/pages/share.flow.test.tsx` |

| `tests/web/telegram.card.test.tsx` | The Settings > Telegram card (one-tap connect, detects the link, pause/disconnect, setup problems shown). | same as above |
| `tests/web/avatar.*` | V, the floating assistant: lip-sync timeline, mouth geometry, smoothing, blink/expression rig, speech fallbacks (blocked voice, no speech API), event bus, prefs with blocked storage, and the mounted component (intro, captions, priorities, menu, cleanup). | `npm i --no-save vitest@^3 jsdom @testing-library/react @testing-library/dom fake-indexeddb`, add a `vitest.config.ts` with `resolve.alias {'@': 'src'}` and `include: ['tests/web/**/*.test.{ts,tsx}']`, then `npx vitest run` |
| `tests/edge/email_test.ts`, `calendar_test.ts` | Email capture (address, sender + SPF/DKIM rules, attachments, retries, limits, reminder email fallback) and the calendar feed (iCalendar escaping/folding, secret link, rotation). | `bash tests/edge/run.sh` |
| `tests/web/outbox.test.ts`, `capture.offline.test.tsx`, `extension.test.ts`, `email/calendar.card.test.tsx`, `ios.install.test.tsx` | Offline outbox, hotkey and paste-anywhere, the browser extension logic (mock chrome API), settings cards, iPhone install guide. | same as `avatar.*` above |

SQL-level behavior (search ranking, cascades, claim functions) was verified against a real Postgres + pgvector during development; the migrations in `supabase/migrations/` are the source of truth.
