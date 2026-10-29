#!/usr/bin/env bash
# One-time setup for the Vinx Telegram bot: registers the webhook, the command menu and the bot's
# description. Run it from your own terminal. The bot token is read from the environment and is never
# written to a file in this repo.
#
#   export TELEGRAM_BOT_TOKEN='123456:ABC...'        # from @BotFather
#   export TELEGRAM_WEBHOOK_SECRET="$(openssl rand -hex 24)"
#   export SUPABASE_URL='https://<your-project-ref>.supabase.co'
#   supabase secrets set TELEGRAM_BOT_TOKEN="$TELEGRAM_BOT_TOKEN" TELEGRAM_WEBHOOK_SECRET="$TELEGRAM_WEBHOOK_SECRET"
#   bash scripts/telegram-setup.sh
set -euo pipefail

: "${TELEGRAM_BOT_TOKEN:?Set TELEGRAM_BOT_TOKEN (from @BotFather)}"
: "${TELEGRAM_WEBHOOK_SECRET:?Set TELEGRAM_WEBHOOK_SECRET (a long random string; it must match the Supabase secret)}"
: "${SUPABASE_URL:?Set SUPABASE_URL, e.g. https://<project-ref>.supabase.co}"

if [[ ! "$TELEGRAM_WEBHOOK_SECRET" =~ ^[A-Za-z0-9_-]{16,256}$ ]]; then
  echo "TELEGRAM_WEBHOOK_SECRET must be 16-256 characters of A-Z a-z 0-9 _ - (try: openssl rand -hex 24)" >&2
  exit 1
fi
URL="${SUPABASE_URL%/}/functions/v1/telegram-webhook"

api() { # api <method> <json>
  curl -fsS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/$1" -H 'content-type: application/json' -d "$2"
  echo
}

echo "Checking the token..."
api getMe '{}'

echo "Registering the webhook at ${URL}"
api setWebhook "{\"url\":\"${URL}\",\"secret_token\":\"${TELEGRAM_WEBHOOK_SECRET}\",\"allowed_updates\":[\"message\",\"callback_query\"],\"drop_pending_updates\":true,\"max_connections\":20}"

echo "Setting the command menu..."
api setMyCommands '{"commands":[
  {"command":"ask","description":"Find something you saved"},
  {"command":"today","description":"What is on your plate today"},
  {"command":"pause","description":"Stop saving for now"},
  {"command":"resume","description":"Start saving again"},
  {"command":"help","description":"What I can do"}]}'
api setMyShortDescription '{"short_description":"Your second brain. Send me anything to remember, then ask for it back."}'
api setMyDescription '{"description":"I am V, your second brain. Forward messages, send screenshots, voice notes or thoughts, and I will remember them. Later, just describe what you are looking for and I will find it. Open Vinx > Settings > Connect Telegram to link this chat."}'

echo "Webhook status:"
api getWebhookInfo '{}'
echo "Done. In Vinx open Settings > Telegram > Connect."
