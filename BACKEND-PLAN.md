# BACKEND-PLAN.md — Бэкенд «Тело помнит»

_Дата: март 2026. Автор архитектуры: Claude_

---

## Цель

Бэкенд, который:
- открывает доступ в Mini App только оплатившим участницам
- хранит все данные участниц на сервере в России (152-ФЗ)
- присылает ежедневные напоминания через Telegram-бот
- даёт ведущим панель управления потоками и участницами
- генерирует PDF-выгрузку личных данных участницы
- поддерживает AI-чат для новых пользователей

---

## Технический стек

| Слой | Технология | Почему |
|---|---|---|
| Runtime | Node.js 20+ | лучший ecosystem для Telegram-ботов |
| Framework | Fastify | быстрее Express, встроенная валидация |
| База данных | PostgreSQL на Beget VPS | данные в России, соответствие 152-ФЗ |
| ORM | Prisma | читаемые схемы, автомиграции |
| Telegram-бот | Grammy | современная библиотека, TypeScript-ready |
| Оплата | ЮKassa Node.js SDK | работает с самозанятыми |
| AI-чат | OpenAI SDK (GPT-4o) | есть API ключ |
| PDF | pdfkit | генерация без браузера |
| Хостинг | Beget VPS (~400–500 ₽/мес) | серверы в России, 152-ФЗ |
| Планировщик | node-cron | ежедневные уведомления |
| Auth | JWT + Telegram initData | стандарт для Mini Apps |
| Process manager | PM2 | автозапуск сервера после перезагрузки |

---

## Архитектура системы

```
┌─────────────────────────────────────────────────────────────┐
│  Участница                  Ведущая (Альмира / Настя)       │
│  Telegram Mini App          Admin Panel (веб-интерфейс)     │
└────────────┬────────────────────────────┬───────────────────┘
             │ HTTPS                       │ HTTPS
             ▼                             ▼
┌─────────────────────────────────────────────────────────────┐
│              Beget VPS (сервер в России)                     │
│                    Fastify API Server                        │
│  /auth   /diary   /triggers   /checkins   /export   /admin  │
│  /payment/webhook   /ai-chat   /questionnaires   /gdpr      │
└────────────┬────────────────────────────┬───────────────────┘
             │                             │
    ┌────────▼────────┐          ┌─────────▼────────┐
    │   PostgreSQL    │          │   Grammy Bot      │
    │  (Beget VPS,    │          │  уведомления      │
    │   Россия)       │          │  команды /start   │
    └─────────────────┘          └──────────┬────────┘
                         ┌──────────────────┼──────────────┐
                    ЮKassa webhook    OpenAI API      node-cron
```

---

## База данных — схема

### Таблица `users` (участницы)
```
id                  UUID, PK
telegram_id         BIGINT, UNIQUE, NOT NULL   -- ID из Telegram
telegram_username   TEXT                        -- @username
name                TEXT                        -- из TG или введённое
photo_url           TEXT                        -- из TG
phone               TEXT                        -- из оплаты ЮKassa
notifications_time  TEXT DEFAULT '20:00'        -- время уведомлений
consent_given_at    TIMESTAMP                   -- 152-ФЗ: когда дала согласие
consent_text        TEXT                        -- версия политики конфиденциальности
deleted_at          TIMESTAMP                   -- мягкое удаление (право на забвение)
created_at          TIMESTAMP
```

### Таблица `streams` (потоки)
```
id           UUID, PK
name         TEXT          -- «Поток март 2026»
start_date   DATE
end_date     DATE
is_active    BOOLEAN
zoom_link    TEXT
chat_link    TEXT          -- ссылка на закрытый TG-чат
created_at   TIMESTAMP
```

### Таблица `meetings` (встречи внутри потока)
```
id           UUID, PK
stream_id    UUID → streams
number       INT           -- встреча №1, №2... №9
date         TIMESTAMP
topic        TEXT
description  TEXT
prepare      TEXT          -- как подготовиться
zoom_link    TEXT          -- может отличаться от общего
```

### Таблица `enrollments` (участие в потоке)
```
id              UUID, PK
user_id         UUID → users
stream_id       UUID → streams
status          ENUM: pending | active | completed | cancelled
payment_id      TEXT        -- ID платежа ЮKassa
paid_at         TIMESTAMP
access_expires  TIMESTAMP   -- NULL = навсегда
created_at      TIMESTAMP
```
> Доступ к данным остаётся навсегда. Запись новых данных блокируется когда `status = completed` и поток завершён.

### Таблица `diary_entries` (дневник тела)
```
id           UUID, PK
user_id      UUID → users
stream_id    UUID → streams, NULLABLE
zone         TEXT          -- id зоны тела
sensations   TEXT[]        -- массив id ощущений
note         TEXT
created_at   TIMESTAMP
```

### Таблица `trigger_entries` (Стоп-реакция)
```
id             UUID, PK
user_id        UUID → users
situation      TEXT          -- что случилось
reaction_type  ENUM: freeze | fight | flight | fawn
zone           TEXT
sensations     TEXT[]
intensity      INT           -- 1-10
note           TEXT
created_at     TIMESTAMP
```

### Таблица `checkins` (Новая реакция — ежедневный чекин)
```
id            UUID, PK
user_id       UUID → users
body_score    INT           -- как тело сейчас 1-10
tension_zone  TEXT          -- где напряжение
mood          TEXT          -- одним словом
note          TEXT
created_at    TIMESTAMP
```

### Таблица `diagnostic_results` (результат диагностики)
```
id          UUID, PK
user_id     UUID → users
pattern_id  TEXT            -- freeze | fight | flight | fawn
scores      JSONB           -- {freeze: 4, fight: 2, ...}
created_at  TIMESTAMP
```

### Таблица `questionnaires` (анкеты)
```
id           UUID, PK
user_id      UUID → users
stream_id    UUID → streams
type         ENUM: pre | post
answers      JSONB           -- {q1: "...", q2: "..."}
submitted_at TIMESTAMP
```

### Таблица `ai_chat_sessions` (сессии AI-чата)
```
id          UUID, PK
session_id  TEXT            -- случайный ID (без привязки к аккаунту)
messages    JSONB           -- [{role, content}, ...]
created_at  TIMESTAMP
```

---

## API endpoints

### Авторизация
```
POST /auth/telegram
  body: { initData: string, consentGiven: boolean }
  → { token: JWT, user: User }

  Логика: проверяем подпись initData → ищем user по telegram_id
  → если новый: проверяем consentGiven (обязательно) → создаём → JWT 30 дней
```

### Профиль
```
GET    /me                → { user, activeEnrollment, streak }
PATCH  /me                body: { name?, notificationsTime? }
DELETE /me                → удалить все данные (право на забвение, 152-ФЗ)
```

### Потоки и доступ
```
GET /streams/active       → текущий активный поток (для покупки)
GET /me/enrollment        → моё участие: статус, поток, встречи
GET /me/enrollment/access → { hasAccess: bool, canWrite: bool }
```

### Дневник
```
GET  /diary               query: { limit, offset, from, to }
POST /diary               body: { zone, sensations, note }
GET  /diary/:id
GET  /diary/stats         → { streakDays, totalEntries, heatmap }
```

### Стоп-реакция
```
GET  /triggers            query: { limit, offset }
POST /triggers            body: { situation, reactionType, zone, sensations, intensity, note }
GET  /triggers/stats      → { byReaction, byZone, byMonth }
```

### Ежедневный чекин
```
GET  /checkins            query: { limit, offset }
POST /checkins            body: { bodyScore, tensionZone, mood, note }
GET  /checkins/today      → сегодняшний чекин или null
```

### Диагностика
```
GET  /diagnostic/result   → последний результат или null
POST /diagnostic/result   body: { patternId, scores }
```

### Анкеты
```
POST /questionnaires/pre   body: { streamId, answers }
POST /questionnaires/post  body: { streamId, answers }
GET  /questionnaires/:streamId → { pre, post }
```

### PDF-выгрузка
```
GET /export/pdf
  → PDF файл со всеми данными участницы:
    - профиль + паттерн
    - записи дневника тела
    - стоп-реакции
    - ежедневные чекины
    - анкеты (до и после)
```

### AI-чат
```
POST /ai-chat
  body: { sessionId: string, message: string }
  → { reply: string, sessionId: string }

  Системный промпт: роль — мягкий проводник в телесное наблюдение,
  язык методологии «Тело помнит», без диагнозов, без советов,
  только вопросы и отражение. После 5 сообщений — CTA на программу.
```

### Оплата
```
POST /payment/create
  body: { streamId, returnUrl }
  → { paymentUrl, paymentId }   -- редирект на ЮKassa

POST /payment/webhook           -- только ЮKassa может вызвать
  body: ЮKassa payload
  Логика: payment.succeeded → создать enrollment → открыть доступ
          → отправить welcome-сообщение через бота
```

### Права субъекта данных (152-ФЗ)
```
GET  /gdpr/my-data        → все данные в JSON (право на получение)
DELETE /gdpr/delete-me    → удалить все данные навсегда (право на забвение)
  Логика: помечаем deleted_at, обезличиваем, через 30 дней чистим физически
```

### Админ-панель (только для ведущих)
```
GET  /admin/streams                    → список всех потоков
POST /admin/streams                    body: { name, startDate, endDate, zoomLink, chatLink }
PATCH /admin/streams/:id
GET  /admin/streams/:id/participants   → участницы + статус + анкеты
GET  /admin/participants               → все участницы (поиск, фильтр)
GET  /admin/participants/:id           → профиль + все данные + анкеты
GET  /admin/meetings
POST /admin/meetings                   body: { streamId, number, date, topic, ... }
PATCH /admin/meetings/:id
```

---

## Роли и доступ

| Кто | Что может |
|---|---|
| **Неавторизованный** | только AI-чат (по sessionId без аккаунта) |
| **Участница (активная)** | читать и писать дневник, чекины, триггеры; анкеты; PDF |
| **Участница (выпускница)** | только читать свои данные; PDF-выгрузка; диагностика |
| **Ведущая (admin)** | всё: управление потоками, просмотр данных участниц |

Правило «данные не удаляются» — выпускница всегда видит свою историю и может скачать PDF.

---

## Telegram-бот — команды и сценарии

### Команды
```
/start      — приветствие, проверка доступа, кнопка открыть Mini App
/checkin    — быстрый ежедневный чекин прямо в боте (альтернатива Mini App)
/myday      — статистика за сегодня
/help       — список команд
```

### Сценарии автоматики

**После оплаты (webhook от ЮKassa):**
1. Создать enrollment в БД
2. Отправить участнице welcome-сообщение с кнопкой «Открыть приложение»
3. Отправить анкету «До потока» (inline-кнопка → Mini App)
4. Уведомить ведущих: «Новая участница: [имя]»

**Ежедневное напоминание (node-cron):**
- Время: выбирает участница (по умолчанию 20:00)
- Сообщение: «Как твоё тело сегодня? [Отметить в приложении]»
- Отправляется только если участница ещё не сделала запись сегодня

**За 30 минут до встречи:**
- «Встреча начинается через 30 минут. [Войти в Zoom]»

**Конец потока:**
- Отправить анкету «После потока»
- Сообщение о том, что доступ к записям сохранён навсегда
- CTA на следующий поток

---

## Соответствие 152-ФЗ

### Что делаем технически
- **Серверы в России** — Beget VPS, дата-центр в Москве или Санкт-Петербурге
- **Согласие при регистрации** — сохраняем `consent_given_at` и версию политики в БД
- **Право на получение данных** — `GET /gdpr/my-data` отдаёт всё в JSON
- **Право на удаление** — `DELETE /gdpr/delete-me` обезличивает и удаляет через 30 дней
- **Минимизация данных** — собираем только то, что нужно для работы приложения

### Что делаем организационно
- **Политика конфиденциальности** — отдельная страница `privacy.html` на сайте
- **Уведомление Роскомнадзора** — подать через сайт РКН (бесплатно, онлайн)
- **Галочка согласия** — при первом открытии Mini App, до сохранения любых данных

### Что считается персональными данными в проекте
- Telegram ID, имя, username, фото
- Номер телефона (из оплаты)
- Записи дневника, чекины, стоп-реакции — данные о **состоянии здоровья** (особая категория, требует явного согласия)

---

## Структура файлов проекта

```
backend/
├── src/
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── diary.ts
│   │   ├── triggers.ts
│   │   ├── checkins.ts
│   │   ├── payment.ts
│   │   ├── questionnaires.ts
│   │   ├── export.ts
│   │   ├── ai-chat.ts
│   │   ├── gdpr.ts
│   │   └── admin.ts
│   ├── bot/
│   │   ├── index.ts           — инициализация Grammy
│   │   ├── commands.ts        — /start, /checkin, /help
│   │   ├── notifications.ts   — ежедневные уведомления
│   │   └── welcome.ts         — сообщение после оплаты
│   ├── services/
│   │   ├── auth.ts            — проверка Telegram initData
│   │   ├── payment.ts         — ЮKassa интеграция
│   │   ├── pdf.ts             — генерация PDF
│   │   └── ai.ts              — OpenAI чат
│   ├── prisma/
│   │   └── schema.prisma      — схема БД
│   └── index.ts               — точка входа
├── .env                       — секреты (в .gitignore)
├── package.json
└── ecosystem.config.js        — PM2 конфиг для Beget
```

---

## Переменные окружения (.env)

```
DATABASE_URL=postgresql://user:pass@localhost:5432/telo_pomnit
BOT_TOKEN=...                          # Telegram Bot Token (@BotFather)
JWT_SECRET=...                         # случайная строка 32+ символа
YUKASSA_SHOP_ID=...                    # ID магазина ЮKassa
YUKASSA_SECRET_KEY=...                 # секретный ключ ЮKassa
OPENAI_API_KEY=...                     # OpenAI API key
ADMIN_TELEGRAM_IDS=12345678,87654321   # Telegram ID ведущих
WEBHOOK_SECRET=...                     # для проверки вебхука ЮKassa
APP_URL=https://telo-pomnit.ru         # URL сервера (домен)
MINI_APP_URL=https://telo-pomnit.ru/app  # URL Mini App
```

---

## Порядок разработки

### Фаза 0 — Подготовка (до начала кода)
- [ ] Зарегистрироваться на Beget, создать VPS (Ubuntu 22.04)
- [ ] Создать бота через @BotFather, получить токен
- [ ] Зарегистрироваться в ЮKassa как самозанятая
- [ ] Подать уведомление в Роскомнадзор (ркн.gov.ru → раздел «Операторы ПД»)
- [ ] Написать и опубликовать Политику конфиденциальности (`privacy.html`)

### Фаза 1 — Фундамент (1–2 недели)
- [ ] Настройка Beget VPS: Node.js, PostgreSQL, PM2, nginx, HTTPS
- [ ] Инициализация проекта: Fastify + Prisma
- [ ] Схема БД, первые миграции
- [ ] Авторизация через Telegram initData + сохранение согласия
- [ ] Эндпоинты профиля `/me`
- [ ] Первый деплой на сервер

### Фаза 2 — Оплата и доступ (1 неделя)
- [ ] `POST /payment/create` — создание платежа ЮKassa
- [ ] `POST /payment/webhook` — обработка успешной оплаты
- [ ] Автоматическое открытие доступа
- [ ] Welcome-сообщение от бота

### Фаза 3 — Данные участниц (1–2 недели)
- [ ] API дневника `/diary`
- [ ] API стоп-реакций `/triggers`
- [ ] API чекинов `/checkins`
- [ ] API диагностики `/diagnostic`
- [ ] API анкет `/questionnaires`
- [ ] Эндпоинты GDPR `/gdpr`
- [ ] Перенос Mini App с localStorage → API

### Фаза 4 — Бот и уведомления (1 неделя)
- [ ] Grammy бот: /start, /checkin, /help
- [ ] Ежедневные напоминания (node-cron)
- [ ] Напоминания за 30 минут до встречи
- [ ] Welcome flow после оплаты

### Фаза 5 — PDF и AI (1 неделя)
- [ ] Генерация PDF (pdfkit)
- [ ] AI-чат на лендинге (OpenAI)
- [ ] Системный промпт в стиле методологии

### Фаза 6 — Админ-панель (1–2 недели)
- [ ] API для ведущих `/admin/*`
- [ ] Простой веб-интерфейс: список участниц, анкеты, управление потоками

---

## Бюджет инфраструктуры

| Сервис | Тариф | Цена |
|---|---|---|
| Beget VPS (сервер + БД) | VPS-1 | ~500 ₽/мес |
| Домен telo-pomnit.ru | Reg.ru / Beget | ~300 ₽/год |
| ЮKassa | Комиссия ~3.5% с оплат | — |
| OpenAI | ~$0.01/сообщение GPT-4o mini | ~100–300 ₽/мес |
| **Итого** | | **~600–800 ₽/мес** |

> Всё дешевле и всё в России. При росте — Beget VPS-2 (~900 ₽/мес).

---

## Безопасность

- Все запросы от Mini App проверяются через Telegram initData подпись
- JWT токены с временем жизни 30 дней
- Вебхук ЮKassa проверяется по HMAC подписи
- Данные участниц изолированы: каждый видит только своё
- Ведущие идентифицируются по Telegram ID (задаётся в .env)
- HTTPS через nginx + Let's Encrypt (бесплатно, автообновление)
- .env файл не попадает в репозиторий
- PostgreSQL доступен только локально на сервере (не наружу)
