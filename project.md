# Тело помнит — описание проекта

_Обновлено: 8 апреля 2026_

## Что это за проект

**«Тело помнит»** — онлайн-программа интегративной телесной терапии.

Психосоматика + телесная терапия + внедрение в реальную жизнь.
5 недель, 9 живых встреч, Zoom + закрытый Telegram-чат.

**GitHub:** https://github.com/almirasultabova/telo-pomnit
**Лендинг:** https://www.telo-pomnit.ru (Vercel)
**TG Mini App:** https://almirasultabova.github.io/telo-pomnit/tg-app/
**Backend API:** https://api.telo-pomnit.ru
**Разработчик:** Альмира Султанова (SULTANOVA AI)

---

## Для кого проект

Аудитория — люди, которые:
- много работали над собой (терапия, книги, курсы), но паттерны поведения не меняются
- живут в хроническом напряжении, тело реагирует раньше мысли
- понимают всё головой, но продолжают выбирать те же сценарии
- хотят изменений не «в голове», а в реальной жизни

Портрет участницы: женщина 28–45 лет, образованная, психологически грамотная,
уже знакома с терапией, ищет следующий уровень работы.

---

## Ведущая

**Анастасия** — психосоматика, телесная терапия, работа с бессознательным.

---

## Инфраструктура

| Сервис | Где | Детали |
|---|---|---|
| Лендинг (`telo-pomnit.ru`) | Vercel | авто-деплой из `main` |
| TG Mini App | GitHub Pages | авто-деплой из `main` |
| Backend API | Beget VPS `45.11.93.236` | Node.js + PM2, Ubuntu 24.04 |
| База данных | Beget VPS (локально) | PostgreSQL 16 |
| DNS | Cloudflare | домен зарегистрирован на reg.ru |
| SSL | Let's Encrypt | автообновление через Certbot |

**Backend URL:** `https://api.telo-pomnit.ru`
**Деплой бэкенда:** через SSH-ключ (`c:/tmp/beget_key`) — Claude делает сам

---

## Поток 1 — расписание

**Старт:** 16 апреля 2026
**Финал:** 14 мая 2026

| № | Дата | Время (МСК) | Тип |
|---|---|---|---|
| 1 | 16 апреля | 18:00 | Психосоматический разбор |
| 2 | 19 апреля | 11:00 | Телесная практика |
| 3 | 23 апреля | 18:00 | Психосоматический разбор |
| 4 | 26 апреля | 11:00 | Телесная практика |
| 5 | 30 апреля | 18:00 | Психосоматический разбор |
| 6 | 3 мая | 11:00 | Телесная практика |
| 7 | 7 мая | 18:00 | Психосоматический разбор |
| 8 | 10 мая | 11:00 | Телесная практика |
| 9 | 14 мая | 18:00 | Завершающая встреча |

---

## Страницы и файлы

### Лендинг (Vercel)

| Файл | Что это |
|---|---|
| `landing_final.html` | Основной лендинг (маршрут `/`) |
| `thanks.html` | Страница «Спасибо» после оплаты |
| `gaid-body-stress.html` | Гайд (маршрут `/guide`) |
| `offer.html` | Публичная оферта |
| `landing.html` | Лендинг v1 — архив |
| `landing2.html` | Лендинг v2 — архив |

### Telegram Mini App (`tg-app/`)

| Файл | Что это |
|---|---|
| `index.html` | Единственный HTML-файл SPA |
| `js/app.js` | Главная логика экранов и навигации |
| `js/api.js` | Клиент API (URL: `https://api.telo-pomnit.ru`) |
| `js/storage.js` | localStorage обёртка |
| `js/data.js` | Расписание встреч, зоны тела, паттерны |
| `css/styles.css` | Все стили приложения |
| `img/body-front.png` | Изображение тела (вид спереди) |
| `img/body-rear.png` | Изображение тела (вид сзади) |

### Backend (`backend/`)

| Файл | Что это |
|---|---|
| `src/index.js` | Точка входа Fastify |
| `src/bot.js` | Grammy бот + cron-напоминания |
| `src/routes/auth.js` | Авторизация через Telegram initData |
| `src/routes/me.js` | Профиль + статус доступа |
| `src/routes/diary.js` | Дневник тела |
| `src/routes/triggers.js` | Стоп-реакции |
| `src/routes/checkins.js` | Ежедневные чекины |
| `src/routes/ai.js` | AI-ассистент (GPT-4o-mini), сессии привязаны к userId |
| `src/routes/payment.js` | Создание платежа ЮКасса + webhook (IP-фильтр) + авто-зачисление |
| `src/routes/questionnaires.js` | Анкеты участниц (pre/post), сохранение и чтение |
| `src/routes/admin.js` | Управление потоками и участницами |
| `src/services/auth.js` | Проверка Telegram initData + JWT (7d, timing-safe, authDate) |
| `src/services/email.js` | Nodemailer через Яндекс SMTP |
| `prisma/schema.prisma` | Схема базы данных |
| `scripts/create-stream.js` | Скрипт создания потока в БД |
| `.env` | Секреты (не в git) |

---

## Технический стек

### Frontend (лендинг)
- Vanilla HTML/CSS/JS, без зависимостей
- GitHub → Vercel (авто-деплой)

### Telegram Mini App
- Vanilla JS SPA
- Авторизация через Telegram initData + JWT
- API-первый подход (данные на сервере)

### Backend
- Node.js 20 + Fastify + Prisma + PostgreSQL
- Grammy (Telegram бот) + node-cron (напоминания)
- JWT авторизация через Telegram initData
- PM2 (процесс-менеджер) + Nginx (reverse proxy)
- Let's Encrypt SSL
- Nodemailer + Яндекс SMTP (welcome-письма)
- ЮКасса API (приём платежей, webhook)
- OpenAI GPT-4o-mini (AI-ассистент)

---

## Безопасность

| Компонент | Меры защиты |
|---|---|
| CORS | Whitelist: `telo-pomnit.ru`, `almirasultabova.github.io`, `web.telegram.org` |
| Авторизация | HMAC-SHA256 с `timingSafeEqual`, проверка `auth_date` (макс. 24ч), JWT 7 дней |
| Webhook ЮКасса | IP-фильтр по официальным подсетям ЮКасса |
| AI-сессии | Проверка `session.userId === request.user.id` перед доступом |
| Входные данные | `maxLength` на email (254), name (100), telegramUsername (64) |
| Dev-режим | Удалён — `|| 'dev'` fallback убран из `api.js`, `auth.js` |
| База данных | PostgreSQL на Beget VPS, доступ только через backend API |
| Согласие ФЗ-152 | `PATCH /me/consent` сохраняет дату+текст; синхронизируется между устройствами через `consentGivenAt` в ответе `POST /auth/telegram` |
| pending_enrollments | Cron (03:00 МСК) удаляет незавершённые оплаты старше 60 дней |

---

## Дизайн-система

### Лендинг (`landing_final.html`)
| Параметр | Значение |
|---|---|
| Фон | тёплый крем `#f7f4ef` |
| Основной цвет | лесной зелёный `#2a4a38` |
| Акцент | тёплое золото `#c49a3c` |
| Текст | `#1a110a` |
| Заголовки | Georgia, курсив |

### Mini App
- Тема Telegram (адаптируется под светлую/тёмную)
- CSS-переменные: `--tg-bg`, `--tg-text`, `--tg-hint`, `--accent`
- Карта тела: реалистичные PNG изображения (`body-front.png`, `body-rear.png`)
- Зоны тела: голова (лицо, глаза, челюсть), шея, грудь, плечи, руки, живот, таз, ноги, спина
- Ощущения (12 штук): тяжесть, тепло, онемение, дрожь, пустота, сжатие, лёгкость, открытость, боль, давление, покалывание, холод

---

## Структура файлов

```
telo_pomnit/
├── landing_final.html        # Основной лендинг → Vercel /
├── thanks.html               # Страница «Спасибо» → Vercel /thanks
├── gaid-body-stress.html     # Гайд → Vercel /guide
├── offer.html                # Публичная оферта
├── landing.html              # Архив v1
├── landing2.html             # Архив v2
├── vercel.json               # Конфиг Vercel
├── tg-app/                   # Telegram Mini App → GitHub Pages
│   ├── index.html
│   ├── js/ (app.js, api.js, storage.js, data.js)
│   ├── css/styles.css
│   └── img/ (body-front.png, body-rear.png)
├── backend/                  # API сервер → Beget VPS
│   ├── src/
│   ├── prisma/
│   ├── scripts/
│   └── .env (не в git)
├── project.md                # Этот файл
├── PLAN.md                   # Статус задач
├── CLAUDE.md                 # Правила для Claude
├── BACKEND-PLAN.md           # Архитектура бэкенда
└── tg-app/CLAUDE.md          # Правила для Mini App
```
