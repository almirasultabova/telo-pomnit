#!/bin/bash
# Health check: проверяет, что бэкенд отвечает на запросы Mini App с vercel-домена
# Запускается из cron раз в час. При сбое шлёт сообщение в Telegram админам.
set -u

ENV_FILE=/var/www/telo-pomnit/backend/.env
LOG=/var/log/telo-health.log

# Читаем .env (BOT_TOKEN и ADMIN_TELEGRAM_IDS)
BOT_TOKEN=$(grep ^BOT_TOKEN= $ENV_FILE | cut -d= -f2- | tr -d '"' | tr -d "'")
ADMIN_IDS=$(grep ^ADMIN_TELEGRAM_IDS= $ENV_FILE | cut -d= -f2- | tr -d '"' | tr -d "'")

now() { date -Iseconds; }

notify() {
  local msg="$1"
  echo "[$(now)] ALERT: $msg" >> $LOG
  IFS=',' read -ra IDS <<< "$ADMIN_IDS"
  for id in "${IDS[@]}"; do
    curl -s -m 10 -o /dev/null       "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage"       --data-urlencode "chat_id=${id}"       --data-urlencode "text=⚠️ Тело помнит — проблема\n\n$msg"
  done
}

# 1) Backend жив?
HEALTH=$(curl -s -o /dev/null -w '%{http_code}' -m 10 https://api.telo-pomnit.ru/health)
if [ "$HEALTH" != "200" ]; then
  notify "GET /health вернул $HEALTH (ожидался 200). Бэкенд недоступен."
  exit 1
fi

# 2) CORS preflight для AI-чата с vercel-домена
HEADERS=$(curl -s -D - -o /dev/null -m 10 -X OPTIONS https://api.telo-pomnit.ru/ai/chat   -H 'Origin: https://tg-app-telo-pomnit.vercel.app'   -H 'Access-Control-Request-Method: POST'   -H 'Access-Control-Request-Headers: content-type,authorization')

if ! echo "$HEADERS" | grep -qi '^access-control-allow-origin: https://tg-app-telo-pomnit.vercel.app'; then
  notify "CORS preflight на /ai/chat не возвращает Access-Control-Allow-Origin для vercel-домена. AI-чат покажет 'Failed to fetch'/'Load failed'. Проверь /var/www/telo-pomnit/backend/src/index.js."
  exit 1
fi

# 3) PM2 процесс online?
PM2_STATUS=$(pm2 jlist 2>/dev/null | python3 -c 'import sys,json; d=json.load(sys.stdin); p=[x for x in d if x["name"]=="telo-backend"]; print(p[0]["pm2_env"]["status"] if p else "missing")' 2>/dev/null)
if [ "$PM2_STATUS" != "online" ]; then
  notify "PM2 процесс telo-backend в статусе '$PM2_STATUS' (ожидается online)."
  exit 1
fi

echo "[$(now)] OK" >> $LOG
exit 0
