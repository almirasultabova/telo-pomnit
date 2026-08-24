#!/bin/bash
# backup-db.sh — ежедневный дамп PostgreSQL «Тело помнит»
# Запускается cron'ом на сервере. Хранит дампы бессрочно — намеренно: 2026-08-24
# выяснилось, что при переезде с Supabase на Beget старые данные участниц потерялись
# без возможности восстановления, потому что бэкапов не было вовсе. База небольшая
# (килобайты на дамп), место на диске не проблема — удалять старые дампы не нужно.

set -euo pipefail

APP_DIR="/var/www/telo-pomnit/backend"
BACKUP_DIR="/var/backups/telo-pomnit"
LOG_FILE="/var/log/telo-backup.log"
TIMESTAMP=$(date -u +%Y-%m-%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

DATABASE_URL=$(grep -E '^DATABASE_URL=' "$APP_DIR/.env" | cut -d '=' -f2-)

if [ -z "$DATABASE_URL" ]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%S+00:00)] ERROR: DATABASE_URL не найден в $APP_DIR/.env" >> "$LOG_FILE"
  exit 1
fi

DUMP_FILE="$BACKUP_DIR/telo-pomnit_${TIMESTAMP}.sql.gz"

if pg_dump "$DATABASE_URL" | gzip > "$DUMP_FILE"; then
  SIZE=$(du -h "$DUMP_FILE" | cut -f1)
  echo "[$(date -u +%Y-%m-%dT%H:%M:%S+00:00)] OK: $DUMP_FILE ($SIZE)" >> "$LOG_FILE"
else
  echo "[$(date -u +%Y-%m-%dT%H:%M:%S+00:00)] ERROR: pg_dump завершился с ошибкой" >> "$LOG_FILE"
  rm -f "$DUMP_FILE"
  exit 1
fi
