# BACKEND-PLAN.md — Бэкенд «Тело помнит»

_Обновлено: 17 марта 2026_

## Статус: ✅ Задеплоен и работает

**Сервер:** Beget VPS `45.11.93.236` (Ubuntu 24.04)
**API URL:** `https://api.telo-pomnit.ru`
**Health check:** `curl https://api.telo-pomnit.ru/health`
**Управление процессом:** `pm2 list` / `pm2 restart telo-backend`
**Код на сервере:** `/var/www/telo-pomnit/backend/`

---

## Технический стек

| Слой | Технология |
|---|---|
| Runtime | Node.js 20 |
| Framework | Fastify |
| База данных | PostgreSQL 16 (Beget VPS, локально) |
| ORM | Prisma |
| Telegram-бот | Grammy |
| Оплата | ЮKassa (прямые HTTPS-запросы) |
| Email | Nodemailer + Яндекс SMTP (`telo.pomnit@yandex.ru`) |
| AI-чат | OpenAI SDK (GPT-4o-mini) |
| Планировщик | node-cron |
| Auth | JWT + Telegram initData |
| Process manager | PM2 |
| Reverse proxy | Nginx + Let's Encrypt SSL |

---

## Структура файлов

```
backend/
├── src/
│   ├── index.js               # точка входа, регистрация роутов
│   ├── bot.js                 # Grammy бот + cron-напоминания
│   ├── db.js                  # Prisma client singleton
│   ├── routes/
│   │   ├── auth.js            # POST /auth/telegram
│   │   ├── me.js              # GET /me, PATCH /me, GET /me/enrollment/access
│   │   ├── diary.js           # /diary
│   │   ├── triggers.js        # /triggers
│   │   ├── checkins.js        # /checkins
│   │   ├── diagnostic.js      # /diagnostic
│   │   ├── questionnaires.js  # /questionnaires
│   │   ├── ai.js              # POST /ai/chat
│   │   ├── payment.js         # POST /create-payment, POST /webhook/yukassa
│   │   ├── admin.js           # /admin/*
│   │   ├── gdpr.js            # /gdpr
│   │   └── email.js           # POST /send-welcome (ручная отправка)
│   └── services/
│       ├── auth.js            # verifyTelegramInitData, JWT, requireAuth, requireAdmin
│       └── email.js           # sendWelcomeEmail через Nodemailer
├── prisma/
│   └── schema.prisma          # схема БД
├── scripts/
│   └── create-stream.js       # создание потока в БД
└── .env                       # секреты (не в git)
```

---

## База данных — таблицы

| Таблица | Что хранит |
|---|---|
| `users` | участницы: telegram_id, имя, username, роль |
| `streams` | потоки: название, даты, zoom/chat ссылки |
| `meetings` | встречи внутри потока: дата, тема, описание |
| `enrollments` | зачисление: user → stream, статус, payment_id |
| `pending_enrollments` | оплатили но ещё не открыли бота: username, email, payment_id |
| `diary_entries` | записи дневника тела |
| `trigger_entries` | стоп-реакции |
| `checkins` | ежедневные чекины |
| `diagnostic_results` | результат диагностики (паттерн) |
| `questionnaires` | анкеты до/после потока |
| `ai_chat_sessions` | история AI-диалогов |

---

## API endpoints

### Авторизация
```
POST /auth/telegram
  body: { initData, consentGiven }
  → { token, user }
```

### Профиль
```
GET   /me                      → { user, enrollment, streak }
PATCH /me                      body: { name?, notificationsTime? }
GET   /me/enrollment/access    → { hasAccess, canWrite }
                               Администраторы (ADMIN_TELEGRAM_IDS) всегда получают canWrite: true
```

### Дневник
```
GET  /diary          → список записей
POST /diary          body: { zone, sensations, note }
GET  /diary/stats    → { streakDays, totalEntries }
```

### Стоп-реакции
```
GET  /triggers       → список
POST /triggers       body: { situation, reactionType, zone, sensations, intensity, note }
```

### Чекины
```
GET  /checkins/today → сегодняшний или null
POST /checkins       body: { bodyScore, tensionZone, mood, note }
```

### Диагностика
```
GET  /diagnostic/result  → последний результат
POST /diagnostic/result  body: { patternId, scores }
```

### AI-чат
```
POST /ai/chat
  body: { message, sessionId? }
  → { reply, sessionId }
  Доступ: активные участницы + администраторы (ADMIN_TELEGRAM_IDS)
```

### Оплата
```
POST /create-payment
  body: { email, telegramUsername }
  → { url }   — ссылка на оплату в ЮКассе

POST /webhook/yukassa
  Webhook от ЮКассы после успешной оплаты:
  1. Отправить welcome-email
  2. Найти пользователя по telegramUsername
  3. Если найден → создать enrollment → отправить сообщение в боте
  4. Если не найден → создать PendingEnrollment
```

### Админ
```
GET  /admin/streams
POST /admin/streams                  body: { name, startDate, endDate, zoomLink, chatLink }
PATCH /admin/streams/:id
POST /admin/streams/:id/complete     → завершить поток (active → completed)
GET  /admin/streams/:id/participants
GET  /admin/participants
GET  /admin/participants/:id
POST /admin/meetings                 body: { streamId, number, date, topic, ... }
PATCH /admin/meetings/:id
POST /admin/enrollments              body: { userId, streamId } — зачислить
PATCH /admin/enrollments/:id        body: { status }
```

### GDPR (152-ФЗ)
```
GET    /gdpr/my-data    → все данные в JSON
DELETE /gdpr/delete-me  → обезличить и удалить через 30 дней
```

---

## Telegram-бот — команды

| Команда | Кто | Что делает |
|---|---|---|
| `/start` | все | приветствие + авто-зачисление если есть pending enrollment |
| `/app` | все | кнопка открыть Mini App |
| `/help` | все | помощь |
| `/activate @username` | ведущие | зачислить участницу вручную |
| `/deactivate @username` | ведущие | отозвать доступ |
| `/participants` | ведущие | список участниц активного потока |

**Cron-задачи:**
- 20:00 МСК ежедневно — напоминание участницам сделать запись в дневник
- каждый час — проверка встреч через 55–65 минут → напоминание с Zoom-ссылкой

---

## Переменные окружения (.env на сервере)

```
DATABASE_URL=postgresql://telo_user:...@127.0.0.1:5432/telo_pomnit
DIRECT_URL=postgresql://telo_user:...@127.0.0.1:5432/telo_pomnit
BOT_TOKEN=...
JWT_SECRET=...
OPENAI_API_KEY=...
YUKASSA_SHOP_ID=1298653
YUKASSA_SECRET_KEY=...
SMTP_USER=telo.pomnit@yandex.ru
SMTP_PASS=...
ADMIN_TELEGRAM_IDS=412942287
APP_URL=https://telo-pomnit.ru
MINI_APP_URL=https://almirasultabova.github.io/telo-pomnit/tg-app/
PORT=3000
NODE_ENV=production
```

> `.env` на сервере: `/var/www/telo-pomnit/backend/.env`

---

## Роли и доступ

| Кто | Что может |
|---|---|
| **Неавторизованный** | — |
| **Участница (активная)** | дневник, чекины, триггеры, диагностика, AI-чат, анкеты |
| **Участница (выпускница)** | только читать свои данные |
| **Ведущая (admin)** | всё + управление потоками, просмотр данных участниц |

Администраторы определяются по `ADMIN_TELEGRAM_IDS` в `.env`.

---

## Соответствие 152-ФЗ

- Серверы в России — Beget VPS
- Согласие при регистрации — сохраняется `consent_given_at` в БД
- Право на получение — `GET /gdpr/my-data`
- Право на удаление — `DELETE /gdpr/delete-me`
- Данные участниц изолированы — каждая видит только своё

---

## Безопасность

- Все запросы проверяются через Telegram initData подпись
- JWT токены 30 дней + `token_version` для немедленного отзыва
- HTTPS через Nginx + Let's Encrypt
- PostgreSQL доступен только локально
- `.env` не в git
