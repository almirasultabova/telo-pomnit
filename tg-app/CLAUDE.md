# CLAUDE.md — Telegram Mini App «Тело помнит»

## Структура файлов

```
tg-app/
├── index.html          # Единственный HTML-файл. Все 9 экранов внутри.
├── css/
│   └── styles.css      # Все стили. CSS-переменные темы, анимации, компоненты.
├── js/
│   ├── data.js         # Весь контент: зоны, ощущения, вопросы, паттерны, программа.
│   ├── storage.js      # Обёртка над localStorage. Дневник, диагностика, онбординг.
│   └── app.js          # Вся логика и навигация. Точка входа приложения.
└── CLAUDE.md           # Этот файл.
```

Порядок подключения скриптов в index.html:
1. `telegram-web-app.js` (CDN Telegram)
2. `data.js`
3. `storage.js`
4. `app.js`

---

## Экраны и навигация

### Схема переходов

```
screen-splash
    ↓ (авто, 1.6с)
screen-home  ←──────────────────────────────────────────┐
  [вкладка: дневник]                                     │
    → screen-body-map → screen-sensations → screen-note → screen-saved
    → screen-history                                      │
  [вкладка: диагностика]                                 │
    → screen-question (×10) → screen-result ─────────────┘
  [вкладка: профиль]
    (всё внутри вкладки, без отдельных экранов)
```

### Функция навигации

```javascript
goTo('screen-id')        // перейти вперёд
goTo('screen-id', true)  // перейти назад (анимация обратная)
goBack()                 // вернуться на предыдущий экран (из стека)
```

Стек экранов хранится в `screenStack[]`. Кнопка BackButton Telegram вызывает `goBack()`.

---

## Где менять данные

### Зоны тела (7 поясов Райха)
Файл: [js/data.js](js/data.js), массив `DATA.zones`

Каждая зона:
```javascript
{
  id: 'eyes',              // идентификатор (используется везде)
  label: 'Глаза',          // название на кнопке
  sublabel: 'Область глаз и лба',
  svgCy: 16,               // позиция маркера на SVG (% от высоты viewBox 270)
  desc: 'Краткое описание', // показывается в карточке при выборе
  detail: 'Подробное...'   // расширенное описание
}
```

### Ощущения (8 типов)
Файл: [js/data.js](js/data.js), массив `DATA.sensations`

```javascript
{ id: 'tension', label: 'Зажатость', emoji: '✊' }
```

### Вопросы диагностики (10 штук)
Файл: [js/data.js](js/data.js), массив `DATA.diagnosticQuestions`

Каждый вопрос содержит 4 варианта ответа, каждый со свойством `pattern`:
`'freeze'` | `'fawn'` | `'fight'` | `'flight'`

### Паттерны выживания (4 штуки)
Файл: [js/data.js](js/data.js), объект `DATA.patterns`

```javascript
DATA.patterns.freeze = {
  id, name, subtitle, emoji,
  color,       // основной цвет (#hex)
  colorLight,  // полупрозрачный фон (rgba)
  desc,        // описание паттерна
  body,        // телесные проявления
  program      // что происходит на группе
}
```

### Информация о программе
Файл: [js/data.js](js/data.js), объект `DATA.program`

Здесь: дата старта, цена, ссылка на лендинг, данные ведущих (имя, роль, TG).

---

## Хранение данных (localStorage)

Файл: [js/storage.js](js/storage.js)

| Ключ | Что хранит |
|---|---|
| `tp_diary_entries` | Массив записей дневника (макс. 90) |
| `tp_diag_result` | Результат диагностики `{patternId, date, scores}` |
| `tp_onboarding_done` | Флаг `'true'` после онбординга |

Формат записи дневника:
```javascript
{
  id: Date.now(),         // уникальный ID
  date: new Date().toISOString(),
  zone: 'chest',          // id зоны
  sensations: ['tension', 'heaviness'],  // массив id ощущений
  note: 'Текст заметки'  // может быть пустым
}
```

---

## Стили и тема

Файл: [css/styles.css](css/styles.css)

### CSS-переменные темы Telegram
Переменные `--tg-*` задаются из Telegram SDK в `applyTgTheme()` (app.js).
Фолбеки — светлая тема.

```css
--tg-bg           /* фон приложения */
--tg-secondary-bg /* фон карточек */
--tg-text         /* основной текст */
--tg-hint         /* вспомогательный текст */
--accent: #2AABEE /* фирменный синий Telegram */
```

### Добавление нового экрана

1. В `index.html` добавить `<div class="screen" id="screen-новый">...</div>`
2. В `app.js` добавить функцию рендера и вызов `goTo('screen-новый')` в нужном месте
3. Стили — в `styles.css`

---

## Telegram Web App SDK

Инициализация в app.js:
```javascript
const tg = window.Telegram.WebApp;
tg.ready();    // сообщаем TG, что приложение готово
tg.expand();   // разворачиваем на весь экран
```

Используемые API:
- `tg.initDataUnsafe.user` — имя и аватар пользователя
- `tg.BackButton` — системная кнопка «назад»
- `tg.HapticFeedback.impactOccurred('light'|'medium'|'heavy')` — вибрация
- `tg.HapticFeedback.notificationOccurred('success'|'error'|'warning')`
- `tg.openTelegramLink(url)` — открыть ссылку внутри Telegram

---

## Тестирование

Приложение можно открыть в браузере напрямую (без Telegram).
В этом случае `window.Telegram.WebApp` будет заглушкой — SDK не сломает приложение.

Для полноценного теста:
1. Создать бота через @BotFather
2. Включить Inline Mode или создать Menu Button
3. Указать URL приложения (нужен HTTPS — GitHub Pages или Vercel)
4. Открыть через бота на телефоне

---

## Деплой

Приложение хостится на GitHub Pages вместе с лендингом:
`https://almirasultabova.github.io/telo-pomnit/tg-app/`

После `git push origin main` — деплой автоматический.
