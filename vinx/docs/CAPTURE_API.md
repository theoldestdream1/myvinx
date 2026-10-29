# Capture API

One door for everything that sends something to V: iOS Shortcuts (Siri, Back Tap, Action Button, share sheet),
the browser extension, Zapier / Make / n8n, and your own scripts.

```
POST https://<project>.supabase.co/functions/v1/capture
Authorization: Bearer mm_xxxxxxxx        (or header  X-Vinx-Key: mm_xxxxxxxx)
```

Create a device key in **Settings -> Quick capture**. Keys are stored hashed and can be revoked. A key in the query string is
deliberately *not* accepted (URLs end up in logs).

## What you can send

| Body | How |
|---|---|
| JSON | `{ "text": "...", "url": "...", "title": "...", "source": "browser", "client": "zapier", "client_id": "abc-1", "timestamp": "2026-10-26T09:00:00Z" }` |
| JSON + files | add `image_base64` (PNG/JPEG/WebP/HEIC) or `audio_base64`, and optionally `mime` |
| Form / multipart | the same fields, plus files named `image`, `audio` or `file` |
| Raw body | `Content-Type: image/*` or `audio/*` with the file itself, extras in the query string (`?client=back-tap`) |
| Plain text | `Content-Type: text/plain`, the body is the note |

Aliases accepted for convenience: `content`, `note`, `body` for `text`; `link` for `url`; `subject` for `title`.

`source` is one of `manual, notes, browser, email, calendar` (anything else, or a value that contradicts the content, becomes `manual`).
`client` is a free label (lowercased, spaces become hyphens) so you can tell where a memory came from.

## Answers

| Status | Meaning |
|---|---|
| `201 { ok, id, kind }` | Saved. `kind` is `text`, `image` or `voice`. Understanding happens afterwards. |
| `200 { ok, duplicate: true }` | You already sent this `client_id` (or identical text within a minute). Nothing new was saved. |
| `200 { ok, skipped: "sensitive", message }` | Looked like a one-time code, private key, etc. Deliberately not saved. |
| `400` | Nothing to save, bad base64, empty file. |
| `401` | Missing, wrong or revoked key. |
| `413` | Image over 10 MB, audio over 20 MB, body over 30 MB. |
| `429` | 120 saves per hour per person. |

A card number in the text is masked (`[card number removed]`) and the response carries a `note`.

## Reliable by design
- **Saving never waits for AI.** The memory is written first and answered immediately; transcription, reading screenshots and
  extracting reminders happen afterwards, and a cron sweeper retries anything that fails.
- **Safe to repeat.** Send a `client_id` (any unique string, e.g. a UUID) and retries cannot create duplicates.
- **Offline?** Queue on your side and resend with the same `client_id`.

## Examples
```bash
curl -X POST "$CAPTURE_URL" -H "Authorization: Bearer $MEMO_KEY" -H "Content-Type: application/json" \
  -d '{"text":"Pricing idea: annual plan at $120","client":"curl"}'

curl -X POST "$CAPTURE_URL?client=desktop" -H "Authorization: Bearer $MEMO_KEY" -H "Content-Type: image/png" --data-binary @screenshot.png

curl -X POST "$CAPTURE_URL" -H "Authorization: Bearer $MEMO_KEY" -F "audio=@note.m4a" -F "client=script"
```

### Zapier / Make / n8n
Use the **Webhooks by Zapier -> POST** (or HTTP module): URL = the capture address, Payload Type = JSON,
header `Authorization: Bearer mm_...`, and map fields to `text`, `title`, `url`. Set `client_id` to the trigger's unique id so
a replayed trigger is saved once. Good recipes: new starred email, new Notion/Trello card, new voice memo in a folder, new RSS item.

## Other ways in
- **Email:** forward to your private address (Settings -> Email to V). See the README, "Email".
- **Calendar:** subscribe to your private reminder feed (Settings -> Calendar).
- **Telegram:** the V bot (Settings -> Telegram).
