// app.js — главная логика Telegram Mini App «Тело помнит»
// Навигация, обработчики экранов, интеграция с Telegram WebApp SDK.

// ─── Telegram WebApp SDK ──────────────────────────────────────────────────
const tg = window.Telegram?.WebApp || null;

if (tg) {
  tg.ready();
  tg.expand();
  // Применяем цвета темы из Telegram
  applyTgTheme();
}

function applyTgTheme() {
  const r = document.documentElement;
  // Фирменные цвета как на лендинге — крем, зелёный, тёмный текст
  r.style.setProperty('--tg-theme-bg-color',           '#f7f4ef');
  r.style.setProperty('--tg-theme-secondary-bg-color', '#ffffff');
  r.style.setProperty('--tg-theme-text-color',         '#1a110a');
  r.style.setProperty('--tg-theme-hint-color',         '#8a7a6a');
  r.style.setProperty('--tg-theme-link-color',         '#2a4a38');
  r.style.setProperty('--tg-theme-button-color',       '#2a4a38');
  r.style.setProperty('--tg-theme-button-text-color',  '#ffffff');
  r.style.setProperty('--tg-theme-header-bg-color',    '#f7f4ef');
}

function haptic(type = 'light') {
  tg?.HapticFeedback?.impactOccurred?.(type);
}
function hapticNotify(type = 'success') {
  tg?.HapticFeedback?.notificationOccurred?.(type);
}

// ─── Роутер экранов ───────────────────────────────────────────────────────
// Стек навигации: от первого к текущему
const screenStack = [];
let currentScreen = 'splash';

/**
 * Перейти на экран screenId.
 * back=true — анимация «назад» (возврат).
 */
function goTo(screenId, back = false) {
  const prev = document.getElementById('screen-' + currentScreen);
  const next = document.getElementById('screen-' + screenId);
  if (!next || screenId === currentScreen) return;

  // Убираем предыдущий
  if (prev) {
    prev.classList.remove('screen--active');
    prev.classList.add(back ? 'screen--exit-back' : 'screen--exit');
    setTimeout(() => prev.classList.remove('screen--exit', 'screen--exit-back'), 300);
  }

  // Показываем следующий
  next.classList.remove('screen--exit', 'screen--exit-back');
  next.classList.add('screen--active', back ? 'screen--enter-back' : 'screen--enter');
  setTimeout(() => next.classList.remove('screen--enter', 'screen--enter-back'), 300);

  if (!back) screenStack.push(currentScreen);
  currentScreen = screenId;
  updateBackBtn();
}

function goBack() {
  if (!screenStack.length) return;
  const prev = screenStack.pop();
  goTo(prev, true);
}

function updateBackBtn() {
  if (!tg?.BackButton) return;
  if (screenStack.length > 0) {
    tg.BackButton.show();
  } else {
    tg.BackButton.hide();
  }
}

if (tg?.BackButton) {
  tg.BackButton.onClick(goBack);
}

// ─── Состояние текущей записи дневника ───────────────────────────────────
const draft = {
  zone:       null,  // id зоны
  sensations: [],    // массив id ощущений
  note:       ''
};

// ─── Состояние диагностики ────────────────────────────────────────────────
const diag = {
  answers:  [],   // массив { pattern }
  current:  0     // индекс текущего вопроса
};

// ─── Текущая активная вкладка ─────────────────────────────────────────────
let activeTab = 'diary';

// ─────────────────────────────────────────────────────────────────────────
// ИНИЦИАЛИЗАЦИЯ
// ─────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initBodyMap();
  initSensations();
  initNote();
  initSaved();
  // initDiagnostic — вопросы рендерятся динамически, отдельного init не нужно
  initProfile();
  initHistory();

  // Запускаем сплэш → онбординг (первый раз) или сразу главный
  setTimeout(() => {
    renderDiaryTab();
    renderMyPathTab();
    renderProfileTab();

    if (!Storage.isOnboardingDone()) {
      initOnboarding();
      goTo('onboarding');
    } else {
      goTo('home');
      if (!Storage.isOfferSeen()) {
        setTimeout(showOfferModal, 400);
      }
    }
  }, 1600);
});

// ─── Нижняя навигация ─────────────────────────────────────────────────────
function initNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
      haptic('light');
    });
  });
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('tab-pane--active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('nav-btn--active'));
  document.getElementById('tab-' + tab)?.classList.add('tab-pane--active');
  document.querySelector(`.nav-btn[data-tab="${tab}"]`)?.classList.add('nav-btn--active');

  // Обновляем содержимое при переключении
  if (tab === 'diary')   renderDiaryTab();
  if (tab === 'diag')    renderMyPathTab();
  if (tab === 'profile') renderProfileTab();
}

// ─────────────────────────────────────────────────────────────────────────
// ВКЛАДКА: ДНЕВНИК
// ─────────────────────────────────────────────────────────────────────────
function renderDiaryTab() {
  renderStreak();
  renderTodayCard();
  renderRecentEntries();
}

function renderStreak() {
  const n = Storage.getStreak();
  const el = document.getElementById('streak-num');
  if (el) el.textContent = n;
  const sub = document.getElementById('streak-days-sub');
  if (sub) sub.textContent = pluralDays(n);
}

function pluralDays(n) {
  if (n % 10 === 1 && n % 100 !== 11) return 'день подряд';
  if ([2,3,4].includes(n%10) && ![12,13,14].includes(n%100)) return 'дня подряд';
  return 'дней подряд';
}

function renderTodayCard() {
  const container = document.getElementById('today-card');
  if (!container) return;

  const today = new Date().toDateString();
  const todayEntries = Storage.getDiaryEntries()
    .filter(e => new Date(e.date).toDateString() === today);

  if (!todayEntries.length) {
    container.className = 'today-card';
    container.innerHTML = `
      <div class="today-empty">
        <div class="today-empty-icon">🫀</div>
        <div class="today-empty-title">Как ваше тело сегодня?</div>
        <div class="today-empty-sub">Отметьте зону напряжения и ощущение</div>
        <button class="btn btn--primary mt-8" id="start-entry-btn" style="width:100%">
          Сделать запись
        </button>
      </div>`;
    document.getElementById('start-entry-btn')?.addEventListener('click', startDiaryEntry);
  } else {
    container.className = 'today-card today-card--done';
    const chips = todayEntries.map(e => {
      const zone = DATA.zones.find(z => z.id === e.zone);
      const time = new Date(e.date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      const sLabels = (e.sensations || [])
        .map(id => DATA.sensations.find(s => s.id === id))
        .filter(Boolean)
        .map(s => `<span class="entry-sens-chip">${s.emoji} ${s.label}</span>`)
        .join('');
      return `<div class="today-entry-row">
        <div class="today-entry-meta">
          <span class="today-entry-zone">${zone?.label || '—'}</span>
          <span class="today-entry-time">${time}</span>
        </div>
        <div class="entry-sens">${sLabels}</div>
        ${e.note ? `<div class="entry-note">${e.note}</div>` : ''}
      </div>`;
    }).join('<div class="today-divider"></div>');

    container.innerHTML = `
      <div class="today-multi">
        ${chips}
        <button class="btn btn--ghost mt-12" id="add-entry-btn" style="width:100%">
          + Добавить ещё запись
        </button>
      </div>`;
    document.getElementById('add-entry-btn')?.addEventListener('click', startDiaryEntry);
  }
}

function renderRecentEntries() {
  const container = document.getElementById('recent-entries');
  if (!container) return;
  const entries = Storage.getRecentEntries(10);
  if (!entries.length) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = entries.map(e => entryCardHTML(e)).join('');
}

function entryCardHTML(entry) {
  const zone = DATA.zones.find(z => z.id === entry.zone);
  const sLabels = (entry.sensations || [])
    .map(id => DATA.sensations.find(s => s.id === id))
    .filter(Boolean)
    .map(s => `<span class="entry-sens-chip">${s.emoji} ${s.label}</span>`)
    .join('');
  const date = new Date(entry.date);
  const dateStr = date.toLocaleDateString('ru-RU', { day:'numeric', month:'short' });
  return `
    <div class="entry-card">
      <div class="entry-card-header">
        <span class="entry-zone">${zone?.label || '—'}</span>
        <span class="entry-date">${dateStr}</span>
      </div>
      <div class="entry-sens">${sLabels}</div>
      ${entry.note ? `<div class="entry-note">${entry.note}</div>` : ''}
    </div>`;
}

function startDiaryEntry() {
  draft.zone = null;
  draft.sensations = [];
  draft.note = '';
  haptic('medium');
  renderBodyMap();
  goTo('body-map');
}

// Кнопка «История»
document.addEventListener('click', e => {
  if (e.target.id === 'diary-history-btn') {
    renderHistory();
    goTo('history');
    haptic();
  }
});

// ─────────────────────────────────────────────────────────────────────────
// ЭКРАН: КАРТА ТЕЛА
// ─────────────────────────────────────────────────────────────────────────
function initBodyMap() {
  const btn = document.getElementById('zone-continue-btn');
  btn?.addEventListener('click', () => {
    if (!draft.zone) return;
    haptic('medium');
    renderSensations();
    goTo('sensations');
  });
}

function renderBodyMap() {
  // Сбрасываем зоны на изображении
  document.querySelectorAll('.zone-area').forEach(a => a.classList.remove('zone-area--active'));
  // Сбрасываем кнопки
  document.querySelectorAll('.zone-btn').forEach(b => b.classList.remove('zone-btn--active'));
  // Скрываем инфо-карточку
  document.getElementById('zone-info-card')?.classList.add('hidden');
  // Блокируем кнопку
  const btn = document.getElementById('zone-continue-btn');
  if (btn) btn.disabled = true;
}

// Клик по кнопке зоны или по зоне на изображении
document.addEventListener('click', e => {
  const btn  = e.target.closest('.zone-btn');
  const area = e.target.closest('.zone-area');
  const zoneId = btn?.dataset.zone || area?.dataset.zone;
  if (!zoneId) return;
  selectZone(zoneId);
  haptic('light');
});

function selectZone(zoneId) {
  draft.zone = zoneId;
  const zone = DATA.zones.find(z => z.id === zoneId);
  if (!zone) return;

  // Подсвечиваем кнопку
  document.querySelectorAll('.zone-btn').forEach(b => b.classList.remove('zone-btn--active'));
  document.querySelector(`.zone-btn[data-zone="${zoneId}"]`)?.classList.add('zone-btn--active');

  // Подсвечиваем зону на изображении
  document.querySelectorAll('.zone-area').forEach(a => a.classList.remove('zone-area--active'));
  document.querySelector(`.zone-area[data-zone="${zoneId}"]`)?.classList.add('zone-area--active');

  // Показываем инфо-карточку
  const card = document.getElementById('zone-info-card');
  if (card) {
    card.classList.remove('hidden');
    document.getElementById('zone-info-name').textContent = zone.label;
    document.getElementById('zone-info-desc').textContent = zone.detail;
  }

  // Активируем кнопку продолжить
  const btn = document.getElementById('zone-continue-btn');
  if (btn) btn.disabled = false;
}

// ─────────────────────────────────────────────────────────────────────────
// ЭКРАН: ОЩУЩЕНИЯ
// ─────────────────────────────────────────────────────────────────────────
function initSensations() {
  const btn = document.getElementById('sensations-continue-btn');
  btn?.addEventListener('click', () => {
    if (!draft.sensations.length) return;
    haptic('medium');
    goTo('note');
  });
}

function renderSensations() {
  // Показываем выбранную зону
  const zone = DATA.zones.find(z => z.id === draft.zone);
  const label = document.getElementById('sensations-zone-label');
  if (label) label.textContent = zone?.label || '';

  // Сбрасываем выбор
  draft.sensations = [];
  const btn = document.getElementById('sensations-continue-btn');
  if (btn) btn.disabled = true;

  // Рендерим кнопки
  const grid = document.getElementById('sensations-grid');
  if (!grid) return;
  grid.innerHTML = DATA.sensations.map(s => `
    <button class="sensation-btn" data-sensation="${s.id}">
      <span class="sensation-emoji">${s.emoji}</span>
      <span class="sensation-label">${s.label}</span>
    </button>
  `).join('');

  // Обработчики клика на ощущения
  grid.querySelectorAll('.sensation-btn').forEach(b => {
    b.addEventListener('click', () => {
      const id = b.dataset.sensation;
      haptic('light');
      if (draft.sensations.includes(id)) {
        draft.sensations = draft.sensations.filter(s => s !== id);
        b.classList.remove('sensation-btn--active');
      } else {
        draft.sensations.push(id);
        b.classList.add('sensation-btn--active');
      }
      const continueBtn = document.getElementById('sensations-continue-btn');
      if (continueBtn) continueBtn.disabled = draft.sensations.length === 0;
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────
// ЭКРАН: ЗАМЕТКА
// ─────────────────────────────────────────────────────────────────────────
function initNote() {
  document.getElementById('note-save-btn')?.addEventListener('click', () => {
    draft.note = document.getElementById('note-textarea')?.value?.trim() || '';
    saveEntry();
  });
  document.getElementById('note-skip-btn')?.addEventListener('click', () => {
    draft.note = '';
    saveEntry();
  });

  // Обновляем badge зоны/ощущений в заголовке
  const textarea = document.getElementById('note-textarea');
  if (textarea) {
    // Разрешаем выделение текста в этом поле
    textarea.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
  }
}

function saveEntry() {
  const entry = {
    date:       new Date().toISOString(),
    zone:       draft.zone,
    sensations: [...draft.sensations],
    note:       draft.note
  };
  Storage.saveDiaryEntry(entry);
  hapticNotify('success');
  renderSavedScreen();
  goTo('saved');
}

// Обновляем badge зоны в шапке заметки
function updateNoteHeader() {
  const zone = DATA.zones.find(z => z.id === draft.zone);
  const sCount = draft.sensations.length;
  const header = document.getElementById('note-header-zone');
  if (header) header.textContent = zone?.label || '';
  const sHeader = document.getElementById('note-header-sens');
  if (sHeader) sHeader.textContent = sCount ? `${sCount} ощущ.` : '';
}

// ─────────────────────────────────────────────────────────────────────────
// ЭКРАН: СОХРАНЕНО
// ─────────────────────────────────────────────────────────────────────────
function initSaved() {
  document.getElementById('saved-home-btn')?.addEventListener('click', () => {
    // Возвращаемся на главный экран (очищаем стек до home)
    while (screenStack.length && screenStack[screenStack.length-1] !== 'home') {
      screenStack.pop();
    }
    if (screenStack[screenStack.length-1] === 'home') screenStack.pop();
    goTo('home', true);
    switchTab('diary');
    renderDiaryTab();
    haptic('light');
  });
}

function renderSavedScreen() {
  const streak = Storage.getStreak();
  const el = document.getElementById('saved-streak-num');
  if (el) el.textContent = streak;
  const sub = document.getElementById('saved-streak-label');
  if (sub) sub.textContent = pluralDays(streak);
}

// ─────────────────────────────────────────────────────────────────────────
// ЭКРАН: ИСТОРИЯ
// ─────────────────────────────────────────────────────────────────────────
function initHistory() {}

function renderHistory() {
  const container = document.getElementById('history-list');
  if (!container) return;
  const entries = Storage.getDiaryEntries();

  if (!entries.length) {
    container.innerHTML = `
      <div class="history-empty">
        <div class="history-empty-icon">📖</div>
        <div>Записей пока нет.<br>Сделайте первую запись!</div>
      </div>`;
    return;
  }

  // Группируем по дате
  const groups = {};
  entries.forEach(e => {
    const d = new Date(e.date);
    const key = d.toLocaleDateString('ru-RU', { day:'numeric', month:'long', year:'numeric' });
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  });

  container.innerHTML = Object.entries(groups).map(([date, items]) => `
    <div class="history-date-group">
      <div class="history-date-label">${date}</div>
      ${items.map(e => entryCardHTML(e)).join('')}
    </div>
  `).join('');
}

// ─────────────────────────────────────────────────────────────────────────
// ВКЛАДКА: МОЙ ПУТЬ
// ─────────────────────────────────────────────────────────────────────────

// Недели программы (для тепловой карты)
const PROGRAM_WEEKS = [
  { label: 'Н1', start: new Date('2026-03-19'), end: new Date('2026-03-25T23:59:59') },
  { label: 'Н2', start: new Date('2026-03-26'), end: new Date('2026-04-01T23:59:59') },
  { label: 'Н3', start: new Date('2026-04-02'), end: new Date('2026-04-08T23:59:59') },
  { label: 'Н4', start: new Date('2026-04-09'), end: new Date('2026-04-15T23:59:59') },
  { label: 'Н5', start: new Date('2026-04-16'), end: new Date('2026-04-30T23:59:59') },
];

function renderMyPathTab() {
  const container = document.getElementById('diag-tab-content');
  if (!container) return;

  const entries = Storage.getDiaryEntries();

  if (!entries.length) {
    container.innerHTML = `
      <div class="mypath-empty">
        <div class="mypath-empty-icon">🌱</div>
        <div class="mypath-empty-title">Путь только начинается</div>
        <div class="mypath-empty-sub">Делай запись в дневник каждый день — и здесь появится карта твоего тела за все недели потока</div>
      </div>`;
    return;
  }

  container.innerHTML =
    renderMirrorCard(entries) +
    renderHeatmap(entries) +
    renderTopSensations(entries) +
    renderPathStats(entries);
}

// ─── Зеркало ──────────────────────────────────────────────────────────────
function renderMirrorCard(entries) {
  const week7ago = new Date();
  week7ago.setDate(week7ago.getDate() - 7);
  const recent = entries.filter(e => new Date(e.date) >= week7ago);

  if (!recent.length) {
    return `<div class="mirror-card mirror-card--empty">
      <div class="mirror-label">Зеркало недели</div>
      <div class="mirror-text">Нет записей за последние 7 дней — загляни в дневник сегодня</div>
    </div>`;
  }

  // Самая частая зона
  const zoneCounts = {};
  recent.forEach(e => { zoneCounts[e.zone] = (zoneCounts[e.zone] || 0) + 1; });
  const topZoneId = Object.entries(zoneCounts).sort((a,b) => b[1]-a[1])[0][0];
  const topZone   = DATA.zones.find(z => z.id === topZoneId);

  // Самое частое ощущение
  const sensCounts = {};
  recent.forEach(e => (e.sensations||[]).forEach(s => {
    sensCounts[s] = (sensCounts[s] || 0) + 1;
  }));
  const topSensId = Object.keys(sensCounts).sort((a,b) => sensCounts[b]-sensCounts[a])[0];
  const topSens   = DATA.sensations.find(s => s.id === topSensId);

  const phrase = topSens
    ? `На этой неделе тело чаще всего замечало <em>${topSens.label.toLowerCase()}</em> в области <em>«${topZone?.label.toLowerCase() || topZoneId}»</em>`
    : `На этой неделе тело чаще всего обращалось к зоне <em>«${topZone?.label || topZoneId}»</em>`;

  return `<div class="mirror-card">
    <div class="mirror-label">Зеркало недели</div>
    <div class="mirror-text">${phrase}</div>
    <div class="mirror-count">${recent.length} ${pluralDays(recent.length)} с записями</div>
  </div>`;
}

// ─── Тепловая карта — силуэт тела ──────────────────────────────────────────
function renderHeatmap(entries) {
  // Подсчёт по зонам за весь поток
  const counts = {};
  DATA.zones.forEach(z => { counts[z.id] = 0; });
  entries.forEach(e => { if (counts[e.zone] !== undefined) counts[e.zone]++; });
  const maxCount = Math.max(...Object.values(counts), 1);

  // Цвет зоны: от прозрачного к тёмно-зелёному
  function heatFill(zoneId) {
    const c = counts[zoneId] || 0;
    if (c === 0) return 'rgba(42,74,56,0.06)';
    const t = c / maxCount;
    // 3 градации: светло → средне → насыщенно
    if (t < 0.35) return 'rgba(42,74,56,0.25)';
    if (t < 0.65) return 'rgba(42,74,56,0.52)';
    return 'rgba(42,74,56,0.82)';
  }
  function heatStroke(zoneId) {
    const c = counts[zoneId] || 0;
    return c > 0 ? 'rgba(42,74,56,0.9)' : 'rgba(42,74,56,0.15)';
  }

  // Оверлей: те же координаты, что и на экране выбора зоны (viewBox 0 0 100 162)
  const heatSvg = `<svg viewBox="0 0 100 162" xmlns="http://www.w3.org/2000/svg" class="hmap-zones-svg">
    <!-- Глаза -->
    <ellipse cx="50" cy="12" rx="14" ry="8"
      fill="${heatFill('eyes')}" stroke="${heatStroke('eyes')}" stroke-width="0.6"/>
    <!-- Челюсть -->
    <ellipse cx="50" cy="24" rx="12" ry="7"
      fill="${heatFill('jaw')}" stroke="${heatStroke('jaw')}" stroke-width="0.6"/>
    <!-- Горло -->
    <rect x="39" y="31" width="22" height="10" rx="5"
      fill="${heatFill('throat')}" stroke="${heatStroke('throat')}" stroke-width="0.6"/>
    <!-- Грудь -->
    <rect x="26" y="42" width="48" height="18" rx="4"
      fill="${heatFill('chest')}" stroke="${heatStroke('chest')}" stroke-width="0.6"/>
    <!-- Диафрагма -->
    <rect x="26" y="60" width="48" height="14" rx="4"
      fill="${heatFill('diaphragm')}" stroke="${heatStroke('diaphragm')}" stroke-width="0.6"/>
    <!-- Живот -->
    <rect x="26" y="74" width="48" height="14" rx="4"
      fill="${heatFill('belly')}" stroke="${heatStroke('belly')}" stroke-width="0.6"/>
    <!-- Таз -->
    <rect x="24" y="88" width="52" height="16" rx="6"
      fill="${heatFill('pelvis')}" stroke="${heatStroke('pelvis')}" stroke-width="0.6"/>
  </svg>`;

  const imgCol = `<div class="hmap-img-wrap">
    <img src="img/body-glow.png" alt="" class="hmap-glow-img">
    ${heatSvg}
  </div>`;

  // Список зон с барами справа
  const labels = DATA.zones.map(z => {
    const c = counts[z.id];
    const barW = Math.round((c / maxCount) * 100);
    return `<div class="hmap-row">
      <div class="hmap-zone-name">${z.label}</div>
      <div class="hmap-bar-wrap">
        <div class="hmap-bar" style="width:${barW}%"></div>
      </div>
      <div class="hmap-count ${c > 0 ? 'hmap-count--active' : ''}">${c || '—'}</div>
    </div>`;
  }).join('');

  return `<div class="section-label mt-16 mb-8">Карта напряжений за поток</div>
    <div class="hmap-wrap">
      <div class="hmap-svg-col">${imgCol}</div>
      <div class="hmap-labels-col">${labels}</div>
    </div>`;
}

// ─── Топ ощущений ──────────────────────────────────────────────────────────
function renderTopSensations(entries) {
  const counts = {};
  entries.forEach(e => (e.sensations||[]).forEach(s => {
    counts[s] = (counts[s] || 0) + 1;
  }));

  const top = Object.entries(counts)
    .sort((a,b) => b[1]-a[1])
    .slice(0, 3)
    .map(([id, count]) => {
      const s = DATA.sensations.find(x => x.id === id);
      return s ? { ...s, count } : null;
    }).filter(Boolean);

  if (!top.length) return '';

  const total = entries.reduce((n, e) => n + (e.sensations||[]).length, 0) || 1;

  const items = top.map((s, i) => {
    const pct = Math.round((s.count / total) * 100);
    return `<div class="tops-item">
      <div class="tops-rank">${i+1}</div>
      <div class="tops-emoji">${s.emoji}</div>
      <div class="tops-info">
        <div class="tops-label">${s.label}</div>
        <div class="tops-bar-wrap">
          <div class="tops-bar" style="width:${pct}%"></div>
        </div>
      </div>
      <div class="tops-count">${s.count}</div>
    </div>`;
  }).join('');

  return `<div class="section-label mt-16 mb-8">Топ ощущений за поток</div>
    <div class="tops-list">${items}</div>`;
}

// ─── Статистика пути ───────────────────────────────────────────────────────
function renderPathStats(entries) {
  const uniqueDays    = new Set(entries.map(e => new Date(e.date).toDateString())).size;
  const attendedCount = Storage.getAttended().length;
  const totalMeetings = DATA.program.schedule.length;

  return `<div class="section-label mt-16 mb-8">Статистика потока</div>
    <div class="path-stats">
      <div class="path-stat">
        <div class="path-stat-num">${uniqueDays}</div>
        <div class="path-stat-label">дней в дневнике</div>
      </div>
      <div class="path-stat">
        <div class="path-stat-num">${attendedCount}<span class="path-stat-of">/${totalMeetings}</span></div>
        <div class="path-stat-label">встреч посещено</div>
      </div>
      <div class="path-stat">
        <div class="path-stat-num">${Storage.getStreak()}</div>
        <div class="path-stat-label">дней подряд</div>
      </div>
    </div>`;
}

// ─── Утилита: склонение ────────────────────────────────────────────────────
function pluralDays(n) {
  const mod = n % 100;
  if (mod >= 11 && mod <= 14) return 'дней';
  const m = n % 10;
  if (m === 1) return 'день';
  if (m >= 2 && m <= 4) return 'дня';
  return 'дней';
}

// ─────────────────────────────────────────────────────────────────────────
// ДИАГНОСТИКА: ВОПРОСЫ
// ─────────────────────────────────────────────────────────────────────────
function startDiagnostic() {
  diag.answers = [];
  diag.current = 0;
  haptic('medium');
  renderQuestion();
  goTo('question');
}

function renderQuestion() {
  const q = DATA.diagnosticQuestions[diag.current];
  if (!q) return;

  const total = DATA.diagnosticQuestions.length;
  const progress = ((diag.current) / total) * 100;

  document.getElementById('diag-progress-fill').style.width = progress + '%';
  document.getElementById('diag-counter').textContent =
    `Вопрос ${diag.current + 1} из ${total}`;
  document.getElementById('question-text').textContent = q.q;

  const list = document.getElementById('options-list');
  list.innerHTML = q.options.map((opt, i) => `
    <button class="option-btn" data-index="${i}" data-pattern="${opt.pattern}">
      ${opt.text}
    </button>
  `).join('');

  list.querySelectorAll('.option-btn').forEach(btn => {
    btn.addEventListener('click', () => selectAnswer(btn));
  });
}

function selectAnswer(btn) {
  // Визуально выделяем выбранный ответ
  document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('option-btn--selected'));
  btn.classList.add('option-btn--selected');
  haptic('light');

  diag.answers.push({ pattern: btn.dataset.pattern });

  // Авто-переход через 350ms
  setTimeout(() => {
    diag.current++;
    if (diag.current < DATA.diagnosticQuestions.length) {
      renderQuestion();
    } else {
      finishDiagnostic();
    }
  }, 380);
}

function finishDiagnostic() {
  // Подсчёт очков
  const scores = { freeze: 0, fawn: 0, fight: 0, flight: 0 };
  diag.answers.forEach(a => { if (scores[a.pattern] !== undefined) scores[a.pattern]++; });

  // Определяем доминирующий паттерн
  const patternId = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])[0][0];

  const result = { patternId, scores, date: new Date().toISOString() };
  Storage.saveDiagResult(result);
  hapticNotify('success');

  renderResultScreen(patternId);
  goTo('result');
}

// ─────────────────────────────────────────────────────────────────────────
// ЭКРАН: РЕЗУЛЬТАТ ДИАГНОСТИКИ
// ─────────────────────────────────────────────────────────────────────────
function renderResultScreen(patternId) {
  const p = DATA.patterns[patternId];
  if (!p) return;

  document.getElementById('result-hero').style.background = p.colorLight;
  document.getElementById('result-hero').style.borderLeft = `4px solid ${p.color}`;
  document.getElementById('result-emoji').textContent    = p.emoji;
  document.getElementById('result-name').textContent     = p.name;
  document.getElementById('result-name').style.color     = p.color;
  document.getElementById('result-subtitle').textContent = p.subtitle;
  document.getElementById('result-desc').textContent     = p.desc;
  document.getElementById('result-body-text').textContent    = p.body;
  document.getElementById('result-program-text').textContent = p.program;

  // Кнопки
  document.getElementById('result-cta-btn').onclick = () => {
    tg?.openLink?.(DATA.program.landingUrl) || window.open(DATA.program.landingUrl, '_blank');
    haptic('medium');
  };
  document.getElementById('result-home-btn').onclick = () => {
    while (screenStack.length && screenStack[screenStack.length-1] !== 'home') {
      screenStack.pop();
    }
    if (screenStack[screenStack.length-1] === 'home') screenStack.pop();
    goTo('home', true);
    switchTab('diary');
    renderDiaryTab();
    haptic();
  };
}

// ─────────────────────────────────────────────────────────────────────────
// ОНБОРДИНГ
// ─────────────────────────────────────────────────────────────────────────
function initOnboarding() {
  // Обращение по имени из Telegram
  const user = tg?.initDataUnsafe?.user;
  const firstName = user?.first_name || '';
  const helloEl = document.getElementById('onboarding-hello');
  if (helloEl) {
    helloEl.textContent = firstName ? `Привет, ${firstName}!` : 'Привет!';
  }

  document.getElementById('onboarding-start-btn')?.addEventListener('click', () => {
    Storage.setOnboardingDone();
    Storage.setOfferSeen(); // не показывать оффер-модал отдельно
    hapticNotify('success');
    goTo('home');
  });
}

// ─────────────────────────────────────────────────────────────────────────
// ВКЛАДКА: ПРОФИЛЬ
// ─────────────────────────────────────────────────────────────────────────
function initProfile() {}

function renderProfileTab() {
  renderUserCard();
  renderStats();
  renderNextMeeting();
  renderZoomBtn();
  renderSchedule();
  renderHosts();
}

function renderNextMeeting() {
  const container = document.getElementById('next-meeting-card');
  if (!container) return;

  const now = new Date();
  const next = DATA.program.schedule.find(m => {
    const [y, mo, d] = m.date.split('-').map(Number);
    const [h, min] = m.time.split(':').map(Number);
    return new Date(y, mo - 1, d, h, min) > now;
  });

  if (!next) {
    container.innerHTML = `<div class="next-meeting-card next-meeting-card--done">
      <div class="next-meeting-label">Программа завершена</div>
      <div class="next-meeting-title">Спасибо за работу 🌿</div>
    </div>`;
    return;
  }

  const weekTopic = DATA.program.weekTopics.find(w => w.num === next.week);
  const dateObj = new Date(next.date + 'T' + next.time);
  const dayNames = ['вс','пн','вт','ср','чт','пт','сб'];
  const monthNames = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const dayName = dayNames[dateObj.getDay()];
  const dateStr = `${dateObj.getDate()} ${monthNames[dateObj.getMonth()]}`;

  container.innerHTML = `
    <div class="next-meeting-card">
      <div class="next-meeting-label">Следующая встреча</div>
      <div class="next-meeting-title">${next.type}</div>
      <div class="next-meeting-date">📅 ${dayName}, ${dateStr} · ${next.time}</div>
      ${weekTopic ? `<div class="next-meeting-week">Неделя ${next.week} — ${weekTopic.title}</div>` : ''}
    </div>`;
}

function renderZoomBtn() {
  const container = document.getElementById('zoom-btn-wrap');
  if (!container) return;

  const zoomUrl = DATA.program.zoomUrl;
  if (zoomUrl) {
    container.innerHTML = `<button class="btn btn--outline btn--full mb-16" data-ext-link="${zoomUrl}">
      🎥 Войти в Zoom
    </button>`;
  } else {
    container.innerHTML = `<div class="zoom-pending mb-16">
      🎥 Ссылка на Zoom появится перед встречей
    </div>`;
  }
}

function renderSchedule() {
  const container = document.getElementById('schedule-section');
  if (!container) return;

  const now = new Date();
  const monthNames = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];

  const items = DATA.program.schedule.map(m => {
    const [y, mo, d] = m.date.split('-').map(Number);
    const [h, min]   = m.time.split(':').map(Number);
    const isPast     = new Date(y, mo - 1, d, h, min) < now;
    const isAttended = Storage.isAttended(m.id);
    const dateStr    = `${d} ${monthNames[mo - 1]}`;

    const attendBtn = isPast ? `
      <button class="attend-btn ${isAttended ? 'attend-btn--on' : ''}"
        onclick="toggleAttend(event,${m.id})">${isAttended ? '✓' : '+'}</button>` : '';

    return `<div class="schedule-item-wrap">
      <button class="schedule-item ${isPast ? 'schedule-item--past' : ''} ${isAttended ? 'schedule-item--attended' : ''}"
        onclick="showMeetingDetail(${m.id})">
        <div class="schedule-item-left">
          <div class="schedule-item-date">${dateStr} · ${m.time}</div>
          <div class="schedule-item-type">${m.type}</div>
          ${m.practice ? `<div class="schedule-item-practice">${m.practice}</div>` : ''}
        </div>
        <svg class="schedule-item-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
      </button>${attendBtn}
    </div>`;
  }).join('');

  container.innerHTML = `
    <div class="section-label mt-16 mb-4">Расписание встреч</div>
    <div class="attend-hint">Нажми + после встречи, чтобы отметить присутствие</div>
    <div class="schedule-list">${items}</div>`;
}

function toggleAttend(event, meetingId) {
  event.stopPropagation();
  const wasAdded = Storage.toggleAttended(meetingId);
  haptic(wasAdded ? 'medium' : 'light');
  if (wasAdded) hapticNotify('success');
  renderSchedule();
  if (activeTab === 'diag') renderMyPathTab();
}

function showMeetingDetail(id) {
  const m = DATA.program.schedule.find(s => s.id === id);
  if (!m) return;
  haptic('light');

  const monthNames = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const dayNames = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];
  const dateObj = new Date(m.date + 'T' + m.time);
  const dateStr = `${dayNames[dateObj.getDay()]}, ${dateObj.getDate()} ${monthNames[dateObj.getMonth()]}`;
  const weekTopic = DATA.program.weekTopics.find(w => w.num === m.week);

  document.getElementById('meeting-detail-type').textContent    = m.type;
  document.getElementById('meeting-detail-date').textContent    = `${dateStr} · ${m.time}`;
  document.getElementById('meeting-detail-week').textContent    = weekTopic ? `Неделя ${m.week} — ${weekTopic.title}` : '';
  const practiceEl = document.getElementById('meeting-detail-practice');
  practiceEl.textContent    = m.practice || '';
  practiceEl.style.display  = m.practice ? 'block' : 'none';
  document.getElementById('meeting-detail-desc').textContent    = m.desc || '';
  document.getElementById('meeting-detail-prepare').textContent = m.prepare || '';

  document.getElementById('meeting-detail-sheet').classList.add('active');
  document.getElementById('meeting-detail-overlay').classList.add('active');
}

function hideMeetingDetail() {
  document.getElementById('meeting-detail-sheet').classList.remove('active');
  document.getElementById('meeting-detail-overlay').classList.remove('active');
}

function renderHosts() {
  const container = document.getElementById('hosts-list');
  if (!container) return;

  container.innerHTML = DATA.program.hosts.map(h => `
    <div class="host-card-mini">
      <div class="host-avatar-mini">${h.initial}</div>
      <div>
        <div class="host-name-mini">${h.name}</div>
        <div class="host-role-mini">${h.role}</div>
      </div>
      <a class="host-tg-link" data-tg-link="${h.tg}">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      </a>
    </div>`).join('');
}

function renderUserCard() {
  const container = document.getElementById('profile-user-card');
  if (!container) return;

  const user = tg?.initDataUnsafe?.user;
  const name = user
    ? [user.first_name, user.last_name].filter(Boolean).join(' ')
    : 'Участница';
  const initial = name.charAt(0).toUpperCase();

  container.innerHTML = `
    <div class="profile-avatar">${initial}</div>
    <div>
      <div class="profile-name">${name}</div>
      <div class="profile-meta">Тело помнит</div>
    </div>`;
}

function renderStats() {
  const container = document.getElementById('profile-stats');
  if (!container) return;

  const streak  = Storage.getStreak();
  const total   = Storage.getDiaryEntries().length;
  const hasDiag = !!Storage.getDiagResult();

  container.innerHTML = `
    <div class="stat-box">
      <div class="stat-box-num">${streak}</div>
      <div class="stat-box-label">дней подряд</div>
    </div>
    <div class="stat-box">
      <div class="stat-box-num">${total}</div>
      <div class="stat-box-label">записей</div>
    </div>
    <div class="stat-box">
      <div class="stat-box-num">${hasDiag ? '✓' : '—'}</div>
      <div class="stat-box-label">паттерн</div>
    </div>`;
}

// ─── Ссылки в профиле ─────────────────────────────────────────────────────
document.addEventListener('click', e => {
  const link = e.target.closest('[data-tg-link]');
  if (link) {
    const url = link.dataset.tgLink;
    tg?.openTelegramLink?.(url) || window.open(url, '_blank');
    haptic('light');
  }
  const extLink = e.target.closest('[data-ext-link]');
  if (extLink) {
    const url = extLink.dataset.extLink;
    tg?.openLink?.(url) || window.open(url, '_blank');
    haptic('light');
  }
});

// ─────────────────────────────────────────────────────────────────────────
// МОДАЛКА: ОФФЕР (показывается один раз при первом открытии)
// ─────────────────────────────────────────────────────────────────────────
function showOfferModal() {
  const modal = document.getElementById('offer-modal');
  if (!modal) return;

  modal.hidden = false;

  document.getElementById('offer-subscribe-btn').addEventListener('click', () => {
    Storage.setOfferSeen();
    closeOfferModal();
    const url = DATA.program.chatUrl;
    tg?.openTelegramLink?.(url) || window.open(url, '_blank');
    haptic('medium');
  });

  document.getElementById('offer-skip-btn').addEventListener('click', () => {
    Storage.setOfferSeen();
    closeOfferModal();
    haptic('light');
  });
}

function closeOfferModal() {
  const modal = document.getElementById('offer-modal');
  if (!modal) return;
  modal.style.animation = 'overlayIn 0.2s ease reverse';
  setTimeout(() => { modal.hidden = true; }, 200);
}
