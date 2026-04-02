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
    (резюме потока, зеркало недели, график чекинов,       │
     карта тела с фильтром по неделям, топ ощущений,      │
     последние заметки, статистика — всё внутри вкладки)  │
  [вкладка: мой поток]                                   │
    (расписание, ведущие, чат, zoom — внутри вкладки)    │
    → screen-meeting-detail (bottom sheet)  ─────────────┘
  [вкладка: профиль]
    → #q-invite-sheet (bottom sheet, 10с после входа)
    → screen-questionnaire (пошаговая анкета, 6 блоков)
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

## Аналитика «Мой путь»

Вкладка `diag` рендерится через `renderMyPathTab()` → набор компонентов:

| Функция | Что делает | Условие показа |
|---|---|---|
| `renderStreamSummary(entries)` | Итоговая карточка с цифрами потока | После 15 мая 2026 |
| `renderMirrorCard(entries)` | Зеркало недели — топ зона + ощущение за 7 дней | Всегда |
| `renderCheckinChart()` | SVG-график «Напряжение» и «Ресурс» по неделям 1–5 | Если ≥ 2 чекина в разных неделях |
| `renderHeatmapSection(entries)` | Карта тела с фильтром по неделям (Все / Н1–Н5) | Всегда |
| `renderTopSensations(entries)` | Топ-3 ощущений за выбранный период | Всегда |
| `renderRecentNotes(entries)` | Последние 3 заметки из дневника | Если ≥ 2 записей с текстом |
| `renderPathStats(entries)` | Дней в дневнике / встреч / стрик | Всегда |

**Фильтр карты по неделям:** `heatmapWeek` (глобальная переменная, 0 = все, 1–5 = неделя).  
**Хелперы:** `getStreamWeek(dateStr)` → номер недели 1–5 или null; `avgOf(arr)` → среднее.

---

## Анкета участницы

Пошаговая анкета (6 блоков, 21 вопрос) заполняется до начала потока.

**Флоу:**
1. После авторизации вызывается `checkAndShowQuestionnaire(streamId)`
2. Проверяется статус на сервере: `GET /questionnaires/:streamId`
3. Если не заполнена — через 10 секунд показывается `#q-invite-sheet` (bottom sheet)
4. Пользователь может закрыть sheet и заполнить позже через баннер в профиле
5. После отправки: `POST /questionnaires/pre` → флаг `tp_questionnaire_done = 'true'`

**Бот-напоминания:**  
Cron в `bot.js` (10:00 МСК) отправляет уведомления на 1-й, 3-й и 5-й день если анкета не заполнена.

**Блоки анкеты:**
| № | Тема |
|---|---|
| 1 | Демография (возраст, деятельность, город) |
| 2 | Как узнали о программе (источник, соцсети) |
| 3 | Запрос к телу (основная проблема, хронические симптомы) |
| 4 | Текущее состояние (стресс, сон, тело) |
| 5 | Ожидания от программы |
| 6 | Предпочтения и технические детали |

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
| `tp_jwt` | JWT токен авторизации |
| `tp_onboarding_done` | Флаг `'true'` после онбординга |
| `tp_offer_seen` | Флаг `'true'` после первого показа оффера |
| `tp_diary_entries` | Кэш записей дневника (до 90 шт) |
| `tp_diag_result` | Результат диагностики паттерна |
| `tp_trigger_entries` | Записи дневника реакций (стоп-реакция) |
| `tp_checkins` | Недельные чекины (трекер изменений) |
| `tp_attended` | Массив id посещённых встреч |
| `tp_questionnaire_done` | Флаг `'true'` после заполнения анкеты |
| `tp_q_sheet_shown` | Флаг `'true'` после первого показа bottom sheet анкеты |
| `tp_consent_given` | Флаг `'true'` после согласия на обработку данных (ФЗ-152) |

> Данные дневника, диагностики и чекинов синхронизируются с сервером через API.
> `tp_consent_given` синхронизируется при каждом логине через `consentGivenAt` из `/auth/telegram`.
> Чтобы снова увидеть онбординг: `localStorage.removeItem('tp_onboarding_done')`
> Чтобы сбросить анкету: `localStorage.removeItem('tp_questionnaire_done')`

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
