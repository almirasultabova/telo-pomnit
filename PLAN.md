# PLAN.md — Статус задач «Тело помнит»

_Обновлено: 17 марта 2026_

---

## Готово ✅

### Инфраструктура
- [x] Beget VPS — Node.js 20, PostgreSQL 16, PM2, Nginx, SSL
- [x] Backend задеплоен на `https://api.telo-pomnit.ru`
- [x] Домен `telo-pomnit.ru` — Cloudflare DNS, SSL через Let's Encrypt
- [x] GitHub репозиторий — https://github.com/almirasultabova/telo-pomnit
- [x] Лендинг на Vercel — https://www.telo-pomnit.ru
- [x] TG Mini App на GitHub Pages

### Лендинг
- [x] Финальная версия (`landing_final.html`)
- [x] Публичная оферта — `offer.html`
- [x] Гайд — `gaid-body-stress.html`
- [x] Страница «Спасибо» — `thanks.html`
- [x] Модальное окно оплаты с email + Telegram username
- [x] og:image, og:title, og:description
- [x] Яндекс.Метрика (счётчик 107697458)

### Telegram Mini App
- [x] Дневник тела — карта тела с зонами (PNG спереди/сзади)
- [x] AI-ассистент — с locked-экраном для незачисленных
- [x] Вкладка «Мой путь» — тепловая карта и статистика дневника
- [x] Вкладка «Мой поток» — расписание встреч, ведущие
- [x] Онбординг при первом запуске (актуальный: дневник, AI, поток)
- [x] Авторизация через Telegram initData + JWT
- [x] Расписание обновлено — старт 26 марта, финал 23 апреля

### Backend API
- [x] Auth (`POST /auth/telegram`)
- [x] Профиль (`GET /me`, `PATCH /me`)
- [x] Статус доступа (`GET /me/enrollment/access`) — с bypass для администраторов
- [x] Дневник (`/diary`)
- [x] Стоп-реакции (`/triggers`)
- [x] Чекины (`/checkins`)
- [x] Диагностика (`/diagnostic`)
- [x] Анкеты (`/questionnaires`)
- [x] AI-чат (`/ai/chat`) — только для активных участниц и администраторов
- [x] GDPR (`/gdpr`)
- [x] Админ-роуты (`/admin/*`)
- [x] Оплата (`POST /create-payment`, `POST /webhook/yukassa`)
- [x] Welcome-email после оплаты (Яндекс SMTP)
- [x] Авто-зачисление после оплаты — сразу или через PendingEnrollment

### Telegram-бот
- [x] `/start` — с авто-зачислением при наличии pending enrollment
- [x] `/activate @username` — ручное зачисление ведущими
- [x] `/deactivate @username` — отзыв доступа
- [x] `/participants` — список участниц потока
- [x] `/help`, `/app` команды
- [x] Команды зарегистрированы в меню Telegram
- [x] Ежедневные напоминания (cron 20:00 МСК)
- [x] Напоминание за 1 час до встречи

### База данных
- [x] Поток создан в БД (Поток 4 — Весна 2026, старт 26 марта)
- [x] 9 встреч с актуальными датами
- [x] `ADMIN_TELEGRAM_IDS=412942287` прописан в `.env` на сервере

---

## В очереди 📋

- [ ] **Добавить Zoom-ссылку** — когда появится, обновить в БД через бот `/start` или напрямую в `.env` и `data.js`
- [ ] **Резервное копирование БД** — cron `pg_dump` каждую ночь на сервере
- [ ] **Политика конфиденциальности** — `privacy.html`
- [ ] **Уведомление Роскомнадзора** — ркн.gov.ru → Операторы ПД

---

## Возможно позже

- [ ] Реферальная программа — промокоды за приведённых участниц
- [ ] Библиотека практик в Mini App
- [ ] Страница «Выпускницы» — кейсы и отзывы

---

_Когда задача выполнена — скажи Claude, он обновит этот файл._
