# Тело помнит — описание проекта

_Обновлено: 16 марта 2026_

## Что это за проект

**«Тело помнит»** — онлайн-программа интегративной телесной терапии.

Психосоматика + телесная терапия + внедрение в реальную жизнь.
5 недель, 9 живых встреч, 2 ведущие, Zoom + закрытый Telegram-чат.

**GitHub:** https://github.com/almirasultabova/telo-pomnit
**Лендинг:** https://www.telo-pomnit.ru (Vercel)
**TG Mini App:** https://almirasultabova.github.io/telo-pomnit/tg-app/
**Backend API:** https://api.telo-pomnit.ru
**Telegram Анастасии:** https://t.me/akhoroshavtseva
**Telegram Альмиры:** https://t.me/AlmiraSultanova_AI

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

## Ведущие

| | Роль в методе |
|---|---|
| **Анастасия** | Глубина — психосоматика, телесная терапия, работа с бессознательным |
| **Альмира** | Внедрение — инструменты, новые сценарии, перенос в реальную жизнь |

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
**Деплой бэкенда:** автоматически через SSH-ключ (`c:/tmp/beget_key`) — Claude делает сам

---

## Страницы и файлы

### Лендинг (Vercel)

| Файл | Что это |
|---|---|
| `landing_final.html` | Основной лендинг (маршрут `/`) |
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
| `src/routes/` | Все API маршруты |
| `src/routes/payment.js` | Создание платежа ЮКасса + webhook |
| `src/routes/email.js` | Ручная отправка welcome-письма |
| `src/services/email.js` | Nodemailer через Яндекс SMTP |
| `src/services/auth.js` | Проверка Telegram initData |
| `prisma/schema.prisma` | Схема базы данных |
| `.env` | Секреты (не в git) |

---

## Технический стек

### Frontend (лендинг)
- Vanilla HTML/CSS/JS, без зависимостей
- GitHub → Vercel (авто-деплой)

### Telegram Mini App
- Vanilla JS SPA, localStorage-first с фоновым sync
- GitHub Pages

### Backend
- Node.js 20 + Fastify + Prisma + PostgreSQL
- Grammy (Telegram бот) + node-cron (напоминания)
- JWT авторизация через Telegram initData
- PM2 (процесс-менеджер) + Nginx (reverse proxy)
- Let's Encrypt SSL
- Nodemailer + Яндекс SMTP (welcome-письма)
- ЮКасса API (приём платежей, webhook)

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

---

## Структура файлов

```
telo_pomnit/
├── landing_final.html        # Основной лендинг → Vercel /
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
│   └── .env (не в git)
├── project.md                # Этот файл
├── PLAN.md                   # Статус задач
├── CLAUDE.md                 # Правила для Claude
├── BACKEND-PLAN.md           # Архитектура бэкенда
└── TESTING.md                # Руководство тестировщика
```
