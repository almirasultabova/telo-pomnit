# CLAUDE.md — Telegram Mini App «Тело помнит»

## Структура файлов

```
tg-app/
├── index.html          # Единственный HTML-файл. Все экраны внутри.
├── css/
│   └── styles.css      # Все стили. CSS-переменные темы, анимации, компоненты.
├── js/
│   ├── data.js         # Весь контент: зоны, ощущения, паттерны, расписание.
│   ├── storage.js      # Обёртка над localStorage. Онбординг, кеш.
│   ├── api.js          # Клиент API (https://api.telo-pomnit.ru).
│   └── app.js          # Вся логика и навигация. Точка входа приложения.
└── CLAUDE.md           # Этот файл.
```

Порядок подключения скриптов в index.html:
1. `telegram-web-app.js` (CDN Telegram)
2. `data.js`
3. `storage.js`
4. `api.js`
5. `app.js`

---

## Экраны и навигация

### Схема переходов

```
screen-splash
    ↓ (авто, 1.6с)
screen-onboarding  (только первый запуск)
    ↓
screen-home  ←──────────────────────────────────────────┐
  [вкладка: дневник]                                     │
    → screen-body-map → screen-sensations → screen-note → screen-saved
    → screen-history                                      │
    → screen-ai-chat (AI-ассистент)                       │
  [вкладка: мой путь]                                    │
    (статистика дневника — всё внутри вкладки)            │
  [вкладка: мой поток]                                   │
    (расписание, ведущие, чат, zoom — внутри вкладки)    │
    → screen-meeting-detail (bottom sheet)  ─────────────┘
```

### Функция навигации

```javascript
goTo('screen-id')        // перейти вперёд
goTo('screen-id', true)  // перейти назад (анимация обратная)
goBack()                 // вернуться на предыдущий экран (из стека)
```

Стек экранов хранится в `screenStack[]`. Кнопка BackButton Telegram вызывает `goBack()`.

---

## Авторизация

При запуске приложение вызывает `Api.auth()` → `POST /auth/telegram`.
Токен JWT сохраняется в `localStorage` под ключом `tp_jwt`.
Доступ к AI-ассистенту проверяется через `GET /me/enrollment/access`.

---

## Где менять данные

### Расписание встреч
Файл: [js/data.js](js/data.js), массив `DATA.program.schedule`

Каждая встреча:
```javascript
{
  id: 1,
  date: '2026-03-26',       // ISO дата
  time: '18:00',            // МСК
  type: 'Психосоматический разбор',
  week: 1,
  practice: null,           // или 'Лёжа: Даосские пульсации'
  desc: 'Описание встречи',
  prepare: 'Как подготовиться'
}
```

### Зоны тела
Файл: [js/data.js](js/data.js), массив `DATA.zones`

### Ощущения (8 типов)
Файл: [js/data.js](js/data.js), массив `DATA.sensations`

### Паттерны выживания (4 штуки)
Файл: [js/data.js](js/data.js), объект `DATA.patterns`

### Информация о программе (даты, ведущие, ссылки)
Файл: [js/data.js](js/data.js), объект `DATA.program`

---

## localStorage

Файл: [js/storage.js](js/storage.js)

| Ключ | Что хранит |
|---|---|
| `tp_onboarding_done` | Флаг `'true'` после онбординга |
| `tp_jwt` | JWT токен авторизации |

> Данные дневника, диагностики и чекинов хранятся на сервере через API.
> Чтобы снова увидеть онбординг: `localStorage.removeItem('tp_onboarding_done')`

---

## Стили и тема

Файл: [css/styles.css](css/styles.css)

### CSS-переменные темы
```css
--tg-bg           /* фон приложения */
--tg-secondary-bg /* фон карточек */
--tg-text         /* основной текст */
--tg-hint         /* вспомогательный текст */
--accent          /* фирменный цвет */
```

Переменные задаются в `applyTgTheme()` (app.js) — фиксированная светлая тема в стиле лендинга (крем + зелёный).

### Добавление нового экрана

1. В `index.html` добавить `<div class="screen" id="screen-новый">...</div>`
2. В `app.js` добавить функцию рендера и вызов `goTo('screen-новый')` в нужном месте
3. Стили — в `styles.css`

---

## Telegram Web App SDK

```javascript
const tg = window.Telegram.WebApp;
tg.ready();    // приложение готово
tg.expand();   // на весь экран
```

Используемые API:
- `tg.initDataUnsafe.user` — данные пользователя
- `tg.initData` — строка для авторизации на бэкенде
- `tg.BackButton` — системная кнопка «назад»
- `tg.HapticFeedback.impactOccurred('light'|'medium'|'heavy')`
- `tg.openTelegramLink(url)` — открыть ссылку внутри Telegram

---

## Деплой

GitHub Pages — авто-деплой после `git push origin main`.
URL: `https://almirasultabova.github.io/telo-pomnit/tg-app/`

Для теста в браузере: открыть `index.html` напрямую — Telegram SDK не сломает приложение (работает в режиме заглушки).
