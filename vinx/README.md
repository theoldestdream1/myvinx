# Vinx

Capture anything worth remembering (text, voice, screenshots, shared links), get reminded at the right
time, and find it later by describing it the way you remember it.

**Stack:** Vite + React + TypeScript + shadcn/ui, Supabase (Postgres + pgvector, Storage, Edge Functions, pg_cron), Web Push.

## How it works

| Piece | Where |
|---|---|
| **Capture** (text, voice, screenshots) | `src/hooks/useCaptureMemory.ts` |
| **Share to Vinx** from other apps | `public/manifest.webmanifest` (`share_target`) -> `public/sw.js` -> `src/pages/Share.tsx` |
| **AI processing** (extract, OCR, embed, detect intents) | `supabase/functions/process-memory` |
| **Recall** (hybrid vector + keyword search, cited answers, recent-memories safety net) | `supabase/functions/query-memories`, SQL `match_memories` |
| **Screenshot understanding** (a dedicated vision step writes a searchable description) | `process-memory` |
| **Search health + repair** | `search-status`, `reindex-memories`, `src/lib/searchRepair.ts`, `SearchHealthCard.tsx` |
| **Reminders** (cron every minute -> Web Push with Done / Snooze buttons) | `send-reminders`, `intent-action`, SQL `claim_due_intents` |
| **Daily brief** (due today, coming up, a memory from your past) | `daily-brief`, SQL `build_brief` / `claim_due_briefs`, `DailyBrief.tsx` |
| **Installable PWA** | `public/sw.js`, `public/manifest.webmanifest`, `InstallCard.tsx` |

The daily brief uses **no AI calls** (plain SQL), so it costs nothing per user per day.

## Setup

### 1. Rotate old keys
An earlier `.env` committed OpenRouter, Gemini and Supabase keys. They remain in git history: **revoke and regenerate all of them**.

### 2. Confirm your Supabase project
`.env` and `supabase/config.toml` should reference the same project ref. (They disagreed in an earlier version of this repo; `docs/ANDROID_INGEST_API.md` may still show the old one, so update it if so.)

### 3. Generate Web Push keys
```sh
node scripts/generate-vapid.mjs
```
Put `VITE_VAPID_PUBLIC_KEY` in your frontend env, and the three `VAPID_*` values in Edge Function secrets.

### 4. Edge Function secrets (Supabase -> Edge Functions -> Secrets)
| Secret | Used for |
|---|---|
| `LOVABLE_API_KEY` | chat, vision, transcription |
| `GEMINI_API_KEY` | *Optional.* Fallback for embeddings. Search by meaning now works through `LOVABLE_API_KEY` alone |
| `AI_CHAT_MODEL`, `AI_FAST_MODEL`, `AI_EMBED_MODEL` | *Optional.* Override model names without code changes (Lovable marks the Gemini 2.5 chat models as deprecated; set these when you want to move on) |
| `WORKER_SECRET` | authenticates cron calls and signs notification Done/Snooze links |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push (`VAPID_SUBJECT` like `mailto:you@yourdomain.com`) |

### 5. Run the migrations, then store two Vault secrets for cron
Apply everything in `supabase/migrations/`, then once in the SQL editor:
```sql
select vault.create_secret('https://<your-project-ref>.supabase.co', 'project_url');
select vault.create_secret('<same value as WORKER_SECRET>',            'worker_secret');
```
This schedules three jobs: `process-ingestion-queue` (every minute), `send-reminders` (every minute), `daily-brief` (every 15 minutes).
If the secrets are missing, the jobs log a warning instead of failing silently. Check with
`select * from cron.job_run_details order by start_time desc limit 20;`.

### 6. Deploy the functions
`process-memory`, `query-memories`, `voice-to-text`, `process-ingestion-queue`, `reindex-memories`, `search-status`,
`delete-account`, `send-reminders`, `daily-brief`, `intent-action` (plus `functions/_shared/`).

### 7. First run
Sign in -> Settings -> **Search health**. It checks the AI connection, whether search by meaning works, whether screenshot storage exists, and whether any memories failed. Tap **Repair search** once: it re-reads memories that failed or were stranded, re-reads older screenshots that were saved without a proper description, and (re)indexes everything. Then **Enable notifications on this device** and **Send test notification**.

## When recall comes back empty
Open **Settings -> Search health**; it names the cause. The Ask page also shows a yellow notice with a **Fix it** button when search was degraded (embeddings down, or memories that failed to process).

Memories are also repaired automatically: the cron worker retries anything stranded or failed (up to 4 attempts, with pauses), so closing the share window mid-save never loses a memory.

## Platform notes
- **Android (Chrome/Edge) & desktop Chromium:** full support, including *Share -> Vinx* from other apps (text, links, screenshots, voice notes). Sharing saves **immediately with no extra tap**, then shows "Saved" with an Undo button. A web app can't receive a share without opening its own window, so a brief Vinx screen appears; it tries to close itself after ~2 seconds (browsers only allow that for some launches, otherwise just switch back).
- **iPhone:** push notifications work only after "Add to Home Screen" (iOS 16.4+). iOS does **not** support Web Share Target, so sharing *into* Vinx isn't available there; use the Capture page or paste.
- The service worker only registers in production builds (not `npm run dev`, not editor preview iframes).

## Local development
```sh
npm i
npm run dev
```

## Layout
- `src/pages/Share.tsx`: share-target landing page
- `src/components/settings/`: install + notification settings
- `supabase/functions/_shared/`: auth, CORS, embeddings, Web Push, action tokens, brief composer
- `tests/`: edge-function and Share-page tests (see `tests/README.md`)
- `docs/ANDROID_INGEST_API.md`: device ingestion API
- `_archive/`: earlier Android/Java/Python experiments, not part of the app


## V, the floating assistant

A humanoid assistant floats bottom-right once you are signed in. On the first visit it pops up and introduces itself (skippable); afterwards it greets you once a day with what is actually due, confirms saves, says "thinking" while searching, reads out the first sentence of an answer, and reacts when you tick off a reminder.

- **Voice is opt-in.** Browsers block audio until the person interacts, so V starts silent with captions and lip-sync. "Hear me out loud" (or the menu / Settings) turns the voice on. Lip-sync is timed from the text, not from the audio, so it is a close match, not frame-exact.
- **Speed.** Lazy-loaded (about 11 KB gzipped, after the page is idle), SVG drawn by direct attribute updates, about 30 fps when idle, paused when the tab is hidden or V is minimized, and it honours `prefers-reduced-motion`.
- **Talking to V from code.** `import { vAgent } from '@/lib/avatar/bus'` then `vAgent.say('Done', 'happy')`, `vAgent.thinking()`, `vAgent.listening()`, `vAgent.idle()`, `vAgent.emote('surprised')`. Nothing else imports the avatar, so it can be removed without touching features.
- **Using your own character.** Replace `figureMarkup()` / `FigureRenderer.apply()` in `src/lib/avatar/figure.ts`. The rest (expressions, lip-sync, timing, UI) drives plain numbers (`FaceParams`), so new art only needs to map those numbers to its parts. Colours are a `Palette` object.
- Hidden on `/`, `/auth`, `/share`; users can minimize or hide V, and re-enable it in Settings.


## Telegram (capture channel)

Linked people can send V anything from Telegram: notes, screenshots, voice notes, forwarded messages. It is saved silently ("Saved ✓" with an Undo button) and processed exactly like a web capture. They can ask for things back (`/ask the girl sketch`, or just type a question) and the original screenshot is sent back. Reminders (with Done / 1 hour / Tomorrow buttons) and the daily brief arrive there too. Passwords, card numbers, one-time codes and API keys are never saved (`supabase/functions/_shared/redact.ts`).

One-time setup (the bot token is never stored in the repo):

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy its token.
2. In your terminal:
   ```bash
   export TELEGRAM_BOT_TOKEN='123456:ABC...'
   export TELEGRAM_WEBHOOK_SECRET="$(openssl rand -hex 24)"
   export SUPABASE_URL='https://<your-project-ref>.supabase.co'
   supabase secrets set TELEGRAM_BOT_TOKEN="$TELEGRAM_BOT_TOKEN" TELEGRAM_WEBHOOK_SECRET="$TELEGRAM_WEBHOOK_SECRET"
   supabase db push
   supabase functions deploy telegram-webhook channel-link send-reminders daily-brief query-memories voice-to-text
   bash scripts/telegram-setup.sh      # registers the webhook, command menu and bot description
   ```
3. In the app: **Settings → Telegram → Connect**. It opens Telegram; tap **Start**. The card turns green by itself.

If something is off, the Settings card says what (secrets missing, webhook not registered, last error reported by Telegram). Only private chats are used; group messages are ignored. Limits: images 10 MB, voice notes 10 minutes / 20 MB, 60 captures per person per hour.

If a token is ever exposed (pasted in a chat, committed by mistake), revoke it in @BotFather (`/revoke`), run `supabase secrets set TELEGRAM_BOT_TOKEN=...` with the new one, and re-run the setup script.

## Email (capture channel)
Every person gets a private address such as `k3x9...@in.yourdomain.com` (Settings -> "Email to V"). Anything they send to it **from their account
email, or from up to five addresses they approve**, becomes a memory: subject and body, HTML mail converted to text, the first attached image
read like a screenshot. Mail from anyone else is dropped silently, and so is mail that fails SPF *and* DKIM, so a forged From line cannot write to someone's memory.

You need an inbound-email provider; the function is written for **Postmark inbound** (JSON). Other providers need a small mapper to the same shape.
1. Postmark: create a server, then *Inbound* and set the inbound domain/MX (e.g. `in.yourdomain.com` -> `inbound.postmarkapp.com`).
2. Set the inbound webhook URL to `https://vinx:YOUR_SECRET@<project>.supabase.co/functions/v1/email-inbound`.
3. Secrets: `supabase secrets set INBOUND_EMAIL_DOMAIN=in.yourdomain.com EMAIL_WEBHOOK_SECRET=YOUR_SECRET`.
4. `supabase db push`, deploy `email-inbound` and `channel-link`.

The webhook returns 200 for mail it deliberately drops (so the provider doesn't retry) and 500 for real failures (so it does).
**Not tested against a live provider** from this codebase: the automated tests use Postmark-shaped fixtures.

## Calendar feed
Settings -> "Calendar" gives a private subscription link (`webcal://...`) that shows reminders in Apple, Google or Outlook calendar with an alert at the
right time. Rotating the link kills the old one. Deploy `calendar-feed` (it is public by design: the secret link is the credential).
Calendar apps decide how often they refresh (Google can take many hours).

## Browser extension
`extension/` is a Manifest V3 extension for Chrome, Edge, Brave and Arc. See `extension/README.md`. It posts to the capture API with a device key.

## Capture from anywhere in the web app
`Ctrl/Cmd+Shift+M` opens a quick-note box on any page; pasting a screenshot outside a text field saves it, and pasted text opens the box pre-filled.
If the connection is down, notes are kept on the device (IndexedDB) and sent automatically when it returns, and a retry can never create a duplicate.

## Capture API
`docs/CAPTURE_API.md` documents the one endpoint behind Siri/Shortcuts, the extension, Zapier/Make and scripts.
