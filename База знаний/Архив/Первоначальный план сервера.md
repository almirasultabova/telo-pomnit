# BACKEND-PLAN.md — Бэкенд «Тело помнит»

_Обновлено: 17 марта 2026_

## Статус: ✅ Задеплоен и работает

> Статус выше относится к существующему backend, не к будущей модели доступа ниже.

## Раздельные права доступа — спецификация от 22 сентября 2026

**Историческая спецификация; основной механизм реализован 22 сентября без изменения схемы БД.** Актуальный статус и исключения — в `project.md` → «Реализация от 22 сентября 2026». Правила находятся в `routes/me.js`, используются из `routes/ai.js`; `services/auth.js` в этой работе не менялся. Описанное ниже исходное состояние относится к моменту до реализации.

Проверенное текущее состояние локального кода: `src/routes/me.js` возвращает `{ hasAccess: true, canWrite: true }` из `/me/enrollment/access`; `src/routes/ai.js` использует только `requireAuth`. Это не реализует согласованное ограничение AI. В `Enrollment` уже есть `status`, `paidAt`, `accessExpires`, связь с `Stream`; в `Stream` — даты начала/конца и встречи. `/me` сейчас выбирает одно зачисление — этого недостаточно для нескольких потоков.

### Требования к серверу

1. Разделить права на бесплатные личные данные, AI-запросы, собственную историю AI, закрытые материалы своего потока и записи встреч. Названия полей API выбрать при реализации; единый `hasAccess/canWrite` не должен закрывать дневник выпускнице.
2. Проверять платное право перед созданием нового AI-сообщения и вызовом OpenAI: подтверждённое участие в нужном потоке, действующий период, неотозванный доступ, лимит. Авторизация и владение сессией остаются обязательными независимо от оплаты. Не доверять переданным клиентом датам, оплате или localStorage.
3. Проверять все подходящие зачисления. Оплата будущего потока не даёт AI до его старта; завершённый старый не должен перекрывать другой действующий. Статус `active` без проверки календаря сам по себе недостаточен. Административный bypass — отдельное осознанное правило, не автоматическое право всех авторизованных.
4. Время проверяет сервер; границы хранить однозначно, показывать по Москве. Доступ в последний день не закрывать до последней встречи. Использовать полуоткрытые интервалы с явно определённым окончанием, а не время устройства. AI закрывается по периоду потока даже при сбое cron.
5. Записи встреч доступны по отдельному сроку: 3 календарных месяца после завершения своего оплаченного потока. Это не дополнительные 3 месяца AI. Не раскрывать закрытые URL посторонним; при реализации проверить также ограничения платформы, где хранятся записи, — спрятанной кнопки недостаточно.
6. Дневник, реакции, чекины и базовая история доступны авторизованному владельцу до/после участия, в том числе без покупки. Окончание потока не удаляет записи и не ограничивает их создание. Привязка записи к потоку может быть метаданными, но не условием чтения собственной истории.
7. Историю AI, если она сохранена, выдавать владельцу для чтения после завершения без нового вызова модели. Новое сообщение отклонять понятной причиной: доступ ещё не начался / завершился / нужна оплаченная программа / исчерпан лимит. При сетевой ошибке не разблокировать платные функции и не объявлять пользователя «не оплатившим» без ответа сервера.
8. Отмена/возврат отзывают соответствующие платные права; данные бесплатной части остаются. При повторной покупке не создавать второй дневник. Не переносить автоматически выпускниц в следующую группу и не рассылать им чужие Zoom-ссылки.

### Участки будущих изменений

- `src/routes/me.js`: раздельные права, свои потоки, безопасный публичный анонс.
- `src/routes/ai.js`, `src/services/auth.js`: отделить авторизацию от платных прав, проверять их на сервере; сохранить проверку владельца сессии.
- `src/routes/diary.js`, `triggers.js`, `checkins.js`: проверить независимость бесплатных инструментов от enrollment.
- `prisma/schema.prisma`, `src/routes/payment.js`, `admin.js`: только после анализа существующих данных определить, как отражать подтверждённую оплату, отдельные сроки и отозванные права; миграции не выполнять в рамках документации.
- `src/bot.js`: учитывать поток и сроки в напоминаниях; завершение потока не запускает удаление аккаунта/дневника.

Порядок дальнейшей работы: сначала тесты на матрицу прав из `TESTING.md`, затем минимальная серверная реализация, затем клиент и проверка на 375/768 px; production менять только после проверки сохранности существующих данных. Численный лимит AI, частичные возвраты и миграция старых доступов требуют отдельного решения владельца. B2B-лицензирование из `APP_MONETIZATION_SALES.md` не является правилом доступа участниц этой программы.

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
