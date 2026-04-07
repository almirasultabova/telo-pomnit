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

let bodyMapView = 'front';

// ─── Состояние диагностики ────────────────────────────────────────────────
const diag = {
  answers:  [],   // массив { pattern }
  current:  0     // индекс текущего вопроса
};

// ─── Текущая активная вкладка ─────────────────────────────────────────────
let activeTab = 'diary';

// ─── Фильтр карты тела по неделям (0 = все) ───────────────────────────────
let heatmapWeek = 0;

// ─── Хелпер: номер недели потока (1–5) по дате записи ─────────────────────
function getStreamWeek(dateStr) {
  const start = new Date('2026-04-16');
  const d = new Date(dateStr);
  const diff = Math.floor((d - start) / (7 * 24 * 60 * 60 * 1000));
  if (diff < 0 || diff >= 5) return null;
  return diff + 1;
}

function avgOf(arr) {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
}

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
  initAiChat();
  initTrigger();
  initCheckin();

  function startApp() {
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
  }

  // Авторизация + загрузка данных; минимальное время сплэша — 1600мс
  const minSplash = new Promise(resolve => setTimeout(resolve, 1600));

  let accessDenied = false;

  const authFlow = Api.auth()
    .then(async () => {
      await Storage.initFromApi(); // ждём загрузки данных с сервера
      try {
        const [access, me] = await Promise.allSettled([
          Api.getAccess(),
          Api.getMe()
        ]);
        if (access.status === 'fulfilled') {
          aiAccessGranted = !!access.value?.canWrite;
        }
        if (me.status === 'fulfilled' && me.value?.enrollment?.stream?.id) {
          checkAndShowQuestionnaire(me.value.enrollment.stream.id);
        }
      } catch {
        /* нет связи — работаем локально */
      }
    })
    .catch(err => {
      if (err?.status === 403) {
        accessDenied = true;
      }
      // иначе — нет связи, работаем локально
    });

  // Переходим с экрана сплэша только после обоих условий
  Promise.all([minSplash, authFlow]).then(() => {
    if (accessDenied) {
      showAccessDenied();
    } else {
      startApp();
    }
  });
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
  bodyMapView = 'front';
  haptic('medium');
  renderBodyMap();
  goTo('body-map');
}

// Кнопки «История» и «Ассистент»
document.addEventListener('click', e => {
  if (e.target.closest('#ai-chat-btn')) {
    renderAiChat();
    goTo('ai-chat');
    haptic();
    return;
  }
  if (e.target.closest('#export-pdf-btn')) {
    exportDiaryPdf();
    return;
  }
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
  const svgEl = document.getElementById('body-figure-svg');
  if (!svgEl) return;

  const zones = DATA.zones.filter(z => z.view === bodyMapView);

  const imgSrc = bodyMapView === 'front' ? 'img/body-front.png' : 'img/body-rear.png';
  const imgBg = `<image href="${imgSrc}" x="0" y="0" width="100" height="162" preserveAspectRatio="xMidYMid meet"/>`;

  const paths = zones.map(z => {
    const isDecor = z.selectable === false;
    const cls = `zone-path${isDecor ? ' zone-path--decor' : ''}`;
    const attr = isDecor ? '' : `data-zone="${z.id}"`;
    return `<path class="${cls}" ${attr} d="${z.path}"/>`;
  }).join('');

  svgEl.innerHTML = `
    ${imgBg}
    <g transform="matrix(0.429,0,0,0.543,3,0)">${paths}</g>`;

  // Reset selection state
  draft.zone = null;
  document.getElementById('zone-info-card')?.classList.add('hidden');
  const continueBtn = document.getElementById('zone-continue-btn');
  if (continueBtn) continueBtn.disabled = true;

  // Sync toggle buttons
  document.getElementById('view-front-btn')?.classList.toggle('view-toggle-btn--active', bodyMapView === 'front');
  document.getElementById('view-back-btn')?.classList.toggle('view-toggle-btn--active', bodyMapView === 'back');
}

function setBodyView(v) {
  bodyMapView = v;
  haptic('light');
  renderBodyMap();
}

// Клики: переключатель вид + выбор зоны на SVG
document.addEventListener('click', e => {
  // Front/back toggle
  if (e.target.closest('#view-front-btn')) { setBodyView('front'); return; }
  if (e.target.closest('#view-back-btn'))  { setBodyView('back');  return; }

  // Zone selection (tap on SVG path or zone button)
  const path = e.target.closest('.zone-path:not(.zone-path--decor)');
  const btn  = e.target.closest('.zone-btn');
  const zoneId = path?.dataset.zone || btn?.dataset.zone;
  if (!zoneId) return;
  selectZone(zoneId);
  haptic('light');
});

function selectZone(zoneId) {
  draft.zone = zoneId;
  const zone = DATA.zones.find(z => z.id === zoneId);
  if (!zone) return;

  document.querySelectorAll('.zone-path').forEach(p => p.classList.remove('zone-path--active'));
  document.querySelector(`.zone-path[data-zone="${zoneId}"]`)?.classList.add('zone-path--active');

  const card = document.getElementById('zone-info-card');
  if (card) {
    card.classList.remove('hidden');
    document.getElementById('zone-info-name').textContent = zone.label;
    document.getElementById('zone-info-desc').textContent = zone.desc || '';
  }

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
    renderStreamSummary(entries) +
    renderMirrorCard(entries) +
    renderCheckinChart() +
    renderHeatmapSection(entries) +
    renderTopSensations(entries) +
    renderRecentNotes(entries) +
    renderPathStats(entries);

  // Бинд фильтра недель карты тела
  container.querySelectorAll('.hmap-week-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      heatmapWeek = Number(btn.dataset.week);
      renderMyPathTab();
    });
  });
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
function renderHeatmapSection(entries) {
  const filtered = heatmapWeek === 0
    ? entries
    : entries.filter(e => getStreamWeek(e.date) === heatmapWeek);

  const weekBtns = [0, 1, 2, 3, 4, 5].map(w => {
    const active = heatmapWeek === w ? ' hmap-week-btn--active' : '';
    const label  = w === 0 ? 'Все' : `Н${w}`;
    return `<button class="hmap-week-btn${active}" data-week="${w}">${label}</button>`;
  }).join('');

  return `<div class="section-label mt-16 mb-4">Карта напряжений</div>
    <div class="hmap-week-filter">${weekBtns}</div>
    ${renderHeatmapBody(filtered)}`;
}

function renderHeatmapBody(entries) {
  // Подсчёт по всем выбираемым зонам за весь поток
  const counts = {};
  DATA.zones.filter(z => z.selectable !== false).forEach(z => { counts[z.id] = 0; });
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

  // Оверлей: все передние выбираемые зоны с transform-матрицей
  const frontZones = DATA.zones.filter(z => z.view === 'front' && z.selectable !== false);
  const heatPaths = frontZones.map(z => {
    const fill = heatFill(z.id);
    const stroke = heatStroke(z.id);
    return `<path d="${z.path}" fill="${fill}" stroke="${stroke}" stroke-width="0.6"/>`;
  }).join('');

  const heatSvg = `<svg viewBox="0 0 100 162" xmlns="http://www.w3.org/2000/svg" class="hmap-zones-svg">
    <g transform="matrix(0.429,0,0,0.543,3,0)">${heatPaths}</g>
  </svg>`;

  const imgCol = `<div class="hmap-img-wrap">
    <img src="img/body-glow.png" alt="" class="hmap-glow-img">
    ${heatSvg}
  </div>`;

  // Список всех выбираемых зон с барами, отсортированных по количеству
  const allSelectableZones = DATA.zones.filter(z => z.selectable !== false);
  const labels = allSelectableZones
    .map(z => ({ zone: z, count: counts[z.id] || 0 }))
    .sort((a, b) => b.count - a.count)
    .map(({ zone: z, count: c }) => {
      const barW = Math.round((c / maxCount) * 100);
      return `<div class="hmap-row">
        <div class="hmap-zone-name">${z.label}</div>
        <div class="hmap-bar-wrap"><div class="hmap-bar" style="width:${barW}%"></div></div>
        <div class="hmap-count ${c > 0 ? 'hmap-count--active' : ''}">${c || '—'}</div>
      </div>`;
    }).join('');

  return `<div class="hmap-wrap">
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

// ─── 1. График чекинов по неделям потока ─────────────────────────────────
function renderCheckinChart() {
  const checkins = Storage.getCheckins();
  if (checkins.length < 2) return '';

  // Группируем по неделям потока
  const weekPoints = [1, 2, 3, 4, 5].map(w => {
    const wc = checkins.filter(c => getStreamWeek(c.date) === w);
    if (!wc.length) return null;
    return {
      week: w,
      stress:   avgOf(wc.map(c => ((c.tension || 5) + (c.anxiety || 5)) / 2)),
      resource: avgOf(wc.map(c => ((c.energy || 5) + (c.safety || 5) + (c.bodyContact || 5)) / 3))
    };
  }).filter(Boolean);

  if (weekPoints.length < 2) return '';

  const W = 260, H = 110, pL = 22, pR = 8, pT = 8, pB = 22;
  const pw = W - pL - pR, ph = H - pT - pB;
  const xp = w => pL + ((w - 1) / 4) * pw;
  const yp = v => pT + ph - ((v - 1) / 9) * ph;

  const gridLines = [2, 4, 6, 8, 10].map(v =>
    `<line x1="${pL}" y1="${yp(v)}" x2="${W - pR}" y2="${yp(v)}" stroke="rgba(0,0,0,0.06)" stroke-width="1"/>
     <text x="${pL - 3}" y="${yp(v) + 3.5}" text-anchor="end" font-size="7.5" fill="rgba(0,0,0,0.3)">${v}</text>`
  ).join('');

  const weekLabels = [1, 2, 3, 4, 5].map(w =>
    `<text x="${xp(w)}" y="${H - 5}" text-anchor="middle" font-size="8" fill="rgba(0,0,0,0.4)">Н${w}</text>`
  ).join('');

  const stressPath = 'M' + weekPoints.map(p => `${xp(p.week).toFixed(1)},${yp(p.stress).toFixed(1)}`).join(' L');
  const resPath    = 'M' + weekPoints.map(p => `${xp(p.week).toFixed(1)},${yp(p.resource).toFixed(1)}`).join(' L');

  const stressDots = weekPoints.map(p =>
    `<circle cx="${xp(p.week).toFixed(1)}" cy="${yp(p.stress).toFixed(1)}" r="3" fill="#D4706A"/>`
  ).join('');
  const resDots = weekPoints.map(p =>
    `<circle cx="${xp(p.week).toFixed(1)}" cy="${yp(p.resource).toFixed(1)}" r="3" fill="#2a4a38"/>`
  ).join('');

  const svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="checkin-chart-svg">
    ${gridLines}${weekLabels}
    <path d="${stressPath}" fill="none" stroke="#D4706A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${resPath}"    fill="none" stroke="#2a4a38" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    ${stressDots}${resDots}
  </svg>`;

  return `<div class="section-label mt-16 mb-8">Динамика состояния</div>
    <div class="checkin-chart-wrap">${svg}
      <div class="checkin-chart-legend">
        <span class="cchart-leg"><span class="cchart-dot" style="background:#D4706A"></span>Напряжение</span>
        <span class="cchart-leg"><span class="cchart-dot" style="background:#2a4a38"></span>Ресурс</span>
      </div>
    </div>`;
}

// ─── 3. Итоговое резюме потока (после 14 мая) ─────────────────────────────
function renderStreamSummary(entries) {
  const streamEnd = new Date('2026-05-15'); // показываем начиная со следующего дня
  if (new Date() < streamEnd) return '';

  const uniqueDays    = new Set(entries.map(e => new Date(e.date).toDateString())).size;
  const attendedCount = Storage.getAttended().length;
  const totalMeetings = DATA.program.schedule.length;

  const zoneCounts = {};
  entries.forEach(e => { zoneCounts[e.zone] = (zoneCounts[e.zone] || 0) + 1; });
  const topZoneId = Object.entries(zoneCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const topZone   = DATA.zones.find(z => z.id === topZoneId);

  const sensCounts = {};
  entries.forEach(e => (e.sensations || []).forEach(s => { sensCounts[s] = (sensCounts[s] || 0) + 1; }));
  const topSensId = Object.keys(sensCounts).sort((a, b) => sensCounts[b] - sensCounts[a])[0];
  const topSens   = DATA.sensations.find(s => s.id === topSensId);

  return `<div class="stream-summary">
    <div class="stream-summary-title">Поток завершён</div>
    <div class="stream-summary-sub">Ваши итоги за 5 недель</div>
    <div class="stream-summary-stats">
      <div class="stream-summary-stat">
        <div class="stream-summary-num">${uniqueDays}</div>
        <div class="stream-summary-label">дней<br>в дневнике</div>
      </div>
      <div class="stream-summary-stat">
        <div class="stream-summary-num">${attendedCount}/${totalMeetings}</div>
        <div class="stream-summary-label">встреч<br>посещено</div>
      </div>
      <div class="stream-summary-stat">
        <div class="stream-summary-num">${Storage.getStreak()}</div>
        <div class="stream-summary-label">дней<br>подряд</div>
      </div>
    </div>
    ${topZone ? `<div class="stream-summary-insight">Главная зона потока — <em>${topZone.label}</em>${topSens ? `, ощущение — <em>${topSens.label.toLowerCase()}</em>` : ''}</div>` : ''}
  </div>`;
}

// ─── 4. Последние заметки в «Мой путь» ───────────────────────────────────
function renderRecentNotes(entries) {
  const withNotes = entries.filter(e => e.note && e.note.trim());
  if (withNotes.length < 2) return '';

  const recent = withNotes.slice(0, 3);
  const fmt = d => new Date(d).toLocaleDateString('ru', { day: 'numeric', month: 'short' });

  const items = recent.map(e => `
    <div class="rnote-item">
      <div class="rnote-date">${fmt(e.date)}</div>
      <div class="rnote-text">${e.note}</div>
    </div>`).join('');

  return `<div class="section-label mt-16 mb-8">Последние заметки</div>
    <div class="rnotes-list">${items}</div>`;
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

  const cb  = document.getElementById('consent-cb');
  const btn = document.getElementById('onboarding-start-btn');

  cb?.addEventListener('change', () => {
    if (btn) btn.disabled = !cb.checked;
  });

  btn?.addEventListener('click', () => {
    if (!cb?.checked) return;
    Storage.setOnboardingDone();
    Storage.setOfferSeen();
    Storage.setConsentGiven();
    hapticNotify('success');
    Api.giveConsent().catch(() => {}); // фон — не блокируем UI
    goTo('home');
  });
}

// ─────────────────────────────────────────────────────────────────────────
// ВКЛАДКА: ПРОФИЛЬ
// ─────────────────────────────────────────────────────────────────────────
function initProfile() {}

function renderProfileTab() {
  renderConsentBanner();
  renderQuestionnaireBanner();
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
    <div class="attend-hint">После встречи появится кнопка + — отметь присутствие</div>
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
      <div class="host-avatar-mini">
        ${h.photo
          ? `<img src="${h.photo}" alt="${h.name}" class="host-avatar-img" onerror="this.parentElement.innerHTML='${h.initial}'">`
          : h.initial}
      </div>
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
// ЭКРАН: НЕТ ДОСТУПА
// ─────────────────────────────────────────────────────────────────────────
function showAccessDenied() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('screen--active'));
  const el = document.getElementById('screen-splash');
  if (el) {
    el.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:40px;text-align:center;gap:20px;">
        <div style="font-size:48px;">🌿</div>
        <div style="font-family:Georgia,serif;font-size:22px;color:#1a110a;">Тело помнит</div>
        <div style="font-size:15px;color:#8a7a6a;line-height:1.6;">У вас нет доступа к приложению.<br>Если вы участница программы,<br>напишите<br><a href="https://t.me/Almira_Sultanova" style="color:#2a4a38;">@Almira_Sultanova</a></div>
      </div>`;
    el.classList.add('screen--active');
  }
}

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

// ─────────────────────────────────────────────────────────────────────────
// PDF ЭКСПОРТ
// ─────────────────────────────────────────────────────────────────────────

function exportDiaryPdf() {
  haptic('light');
  const entries = Storage.getDiaryEntries();
  if (!entries.length) {
    alert('Записей пока нет.');
    return;
  }

  const user = tg?.initDataUnsafe?.user;
  const name = user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : 'Участница';

  const rows = entries.map(e => {
    const zone = DATA.zones.find(z => z.id === e.zone);
    const zoneLabel = zone?.label || e.zone;
    const sens = (e.sensations || []).map(id => {
      const s = DATA.sensations.find(x => x.id === id);
      return s ? `${s.emoji} ${s.label}` : id;
    }).join(', ');
    const date = new Date(e.date).toLocaleDateString('ru-RU', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
    return `<tr>
      <td>${date}</td>
      <td>${zoneLabel}</td>
      <td>${sens}</td>
      <td>${e.note ? e.note.replace(/</g,'&lt;') : ''}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>Дневник тела — Тело помнит</title>
<style>
  body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; margin: 40px; color: #1a110a; }
  h1 { color: #2a4a38; margin-bottom: 4px; font-size: 22px; }
  .sub { color: #8a7a6a; margin-bottom: 24px; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { background: #2a4a38; color: #fff; padding: 8px 12px; text-align: left; }
  td { padding: 8px 12px; border-bottom: 1px solid #e8e2d8; vertical-align: top; }
  tr:nth-child(even) td { background: #faf8f4; }
  @media print { body { margin: 20px; } }
</style>
</head>
<body>
<h1>Дневник тела</h1>
<div class="sub">«Тело помнит» — ${name} · Экспорт ${new Date().toLocaleDateString('ru-RU')}</div>
<table>
  <thead>
    <tr><th>Дата</th><th>Зона</th><th>Ощущения</th><th>Заметка</th></tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
</body>
</html>`;

  // Скачиваем как HTML-файл (window.open заблокирован в Telegram)
  try {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `dnevnik-tela-${new Date().toISOString().slice(0,10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    // Fallback для Telegram — открываем через data URI
    const encoded = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
    tg ? tg.openLink(encoded) : window.open(encoded, '_blank');
  }
}

// ─────────────────────────────────────────────────────────────────────────
// AI ЧАТ
// ─────────────────────────────────────────────────────────────────────────

let aiSessionId = null;
let aiMessages = [];
let aiAccessGranted = null; // null = неизвестно, true = есть, false = нет

function initAiChat() {
  document.getElementById('ai-send-btn')?.addEventListener('click', sendAiMessage);

  const input = document.getElementById('ai-input');
  if (input) {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendAiMessage();
      }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 100) + 'px';
    });
  }
}

function renderAiChat() {
  const container = document.getElementById('ai-messages');
  const inputBar  = document.getElementById('ai-input-bar');
  if (!container) return;

  if (aiAccessGranted === false) {
    container.innerHTML = `
      <div class="ai-locked">
        <div class="ai-locked-icon">🌿</div>
        <div class="ai-locked-title">Доступ к ассистенту</div>
        <div class="ai-locked-text">AI-ассистент доступен участницам программы.<br><br>Ссылка придёт после зачисления в поток.</div>
      </div>`;
    if (inputBar) inputBar.style.display = 'none';
    return;
  }

  if (inputBar) inputBar.style.display = '';

  if (!aiMessages.length) {
    container.innerHTML = `
      <div class="ai-welcome">
        <div class="ai-welcome-icon">🌿</div>
        <div class="ai-welcome-text">Привет. Я здесь, чтобы помочь вам наблюдать за телом между встречами.<br><br>Что вы замечаете в себе прямо сейчас?</div>
      </div>`;
  } else {
    renderAiMessages();
  }
}

function renderAiMessages() {
  const container = document.getElementById('ai-messages');
  if (!container) return;
  container.innerHTML = aiMessages.map(m => `
    <div class="ai-msg ai-msg--${m.role}">
      <div class="ai-msg-text">${m.content.replace(/</g,'&lt;')}</div>
    </div>`).join('');
  container.scrollTop = container.scrollHeight;
}

async function sendAiMessage() {
  const input = document.getElementById('ai-input');
  const message = input?.value?.trim();
  if (!message) return;

  // Если токена нет — пробуем авторизоваться ещё раз (сервер мог перезапускаться)
  if (!Api.isAuthed()) {
    try {
      await Api.auth();
    } catch (e) {
      // auth failed — продолжаем, ошибка придёт от самого запроса
    }
  }

  input.value = '';
  input.style.height = 'auto';

  aiMessages.push({ role: 'user', content: message });
  renderAiMessages();
  haptic('light');

  // Индикатор загрузки
  const container = document.getElementById('ai-messages');
  const typing = document.createElement('div');
  typing.className = 'ai-msg ai-msg--assistant';
  typing.innerHTML = '<div class="ai-msg-text ai-typing"><span></span><span></span><span></span></div>';
  container?.appendChild(typing);
  container.scrollTop = container.scrollHeight;

  try {
    const res = await Api.aiChat(message, aiSessionId);
    aiSessionId = res.sessionId;
    typing.remove();
    aiMessages.push({ role: 'assistant', content: res.reply });
    renderAiMessages();
    hapticNotify('success');
  } catch (e) {
    typing.remove();
    const errEl = document.createElement('div');
    errEl.className = 'ai-msg ai-msg--assistant';
    errEl.innerHTML = '<div class="ai-msg-text" style="color:var(--danger)">' + (e.message || 'Ошибка') + '</div>';
    container?.appendChild(errEl);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// СТОП-РЕАКЦИЯ — дневник триггеров
// ─────────────────────────────────────────────────────────────────────────

const triggerDraft = {
  situation:    '',
  reactionType: null,
  intensity:    5,
  zone:         null,
  sensations:   [],
  note:         ''
};

function initTrigger() {
  // Кнопка из вкладки Дневник
  document.getElementById('stop-reaction-btn')?.addEventListener('click', () => {
    resetTriggerForm();
    goTo('trigger');
    haptic('light');
  });

  // История → в экране trigger
  document.getElementById('trigger-history-btn')?.addEventListener('click', () => {
    renderTriggerHistory();
    goTo('trigger-history');
    haptic('light');
  });

  // Новая запись из экрана истории
  document.getElementById('new-trigger-btn')?.addEventListener('click', () => {
    resetTriggerForm();
    goTo('trigger');
    haptic('light');
  });

  // Слайдер интенсивности
  const slider = document.getElementById('trigger-intensity');
  if (slider) {
    slider.addEventListener('input', () => {
      triggerDraft.intensity = Number(slider.value);
      const val = document.getElementById('intensity-value');
      if (val) val.textContent = slider.value;
    });
  }

  // Кнопка сохранить
  document.getElementById('trigger-save-btn')?.addEventListener('click', saveTriggerEntry);

  // Ситуация — разблокировать кнопку
  document.getElementById('trigger-situation')?.addEventListener('input', updateTriggerSaveBtn);

  // Рендерим статические части формы
  renderReactionGrid();
  renderTriggerZoneChips();
  renderTriggerSensationChips();
}

function resetTriggerForm() {
  triggerDraft.situation    = '';
  triggerDraft.reactionType = null;
  triggerDraft.intensity    = 5;
  triggerDraft.zone         = null;
  triggerDraft.sensations   = [];
  triggerDraft.note         = '';

  const sit = document.getElementById('trigger-situation');
  if (sit) sit.value = '';
  const note = document.getElementById('trigger-note');
  if (note) note.value = '';
  const slider = document.getElementById('trigger-intensity');
  if (slider) slider.value = 5;
  const val = document.getElementById('intensity-value');
  if (val) val.textContent = '5';

  // Снять выделение с реакций, зон, ощущений
  document.querySelectorAll('.reaction-card--selected').forEach(el => el.classList.remove('reaction-card--selected'));
  document.querySelectorAll('.zone-chip--selected').forEach(el => el.classList.remove('zone-chip--selected'));
  document.querySelectorAll('#trigger-sensations-grid .sensation-chip--selected').forEach(el => el.classList.remove('sensation-chip--selected'));

  updateTriggerSaveBtn();
}

function updateTriggerSaveBtn() {
  const situation = document.getElementById('trigger-situation')?.value?.trim();
  const btn = document.getElementById('trigger-save-btn');
  if (btn) btn.disabled = !(situation && triggerDraft.reactionType);
}

function renderReactionGrid() {
  const grid = document.getElementById('reaction-grid');
  if (!grid) return;
  const reactions = ['freeze', 'fight', 'flight', 'fawn'];
  grid.innerHTML = reactions.map(id => {
    const p = DATA.patterns[id];
    return `<button class="reaction-card" data-reaction="${id}" style="--reaction-color:${p.color}; --reaction-bg:${p.colorLight}">
      <span class="reaction-card-emoji">${p.emoji}</span>
      <span class="reaction-card-name">${p.name}</span>
      <span class="reaction-card-sub">${p.subtitle}</span>
    </button>`;
  }).join('');

  grid.querySelectorAll('.reaction-card').forEach(btn => {
    btn.addEventListener('click', () => {
      triggerDraft.reactionType = btn.dataset.reaction;
      grid.querySelectorAll('.reaction-card').forEach(b => b.classList.remove('reaction-card--selected'));
      btn.classList.add('reaction-card--selected');
      haptic('light');
      updateTriggerSaveBtn();
    });
  });
}

function renderTriggerZoneChips() {
  const wrap = document.getElementById('trigger-zone-chips');
  if (!wrap) return;
  const zones = DATA.zones.filter(z => z.label && z.selectable !== false);
  wrap.innerHTML = zones.map(z =>
    `<button class="zone-chip" data-zone="${z.id}">${z.label}</button>`
  ).join('');

  wrap.querySelectorAll('.zone-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const isSelected = btn.classList.contains('zone-chip--selected');
      wrap.querySelectorAll('.zone-chip').forEach(b => b.classList.remove('zone-chip--selected'));
      if (!isSelected) {
        btn.classList.add('zone-chip--selected');
        triggerDraft.zone = btn.dataset.zone;
      } else {
        triggerDraft.zone = null;
      }
      haptic('light');
    });
  });
}

function renderTriggerSensationChips() {
  const grid = document.getElementById('trigger-sensations-grid');
  if (!grid) return;
  grid.innerHTML = DATA.sensations.map(s =>
    `<div class="checklist-item" data-id="${s.id}">
      <span class="checklist-check"></span>
      <span class="checklist-emoji">${s.emoji}</span>
      <span class="checklist-label">${s.label}</span>
    </div>`
  ).join('');

  grid.querySelectorAll('.checklist-item').forEach(item => {
    item.addEventListener('click', () => {
      item.classList.toggle('checklist-item--selected');
      const id = item.dataset.id;
      if (item.classList.contains('checklist-item--selected')) {
        if (!triggerDraft.sensations.includes(id)) triggerDraft.sensations.push(id);
      } else {
        triggerDraft.sensations = triggerDraft.sensations.filter(s => s !== id);
      }
      haptic('light');
    });
  });
}

function saveTriggerEntry() {
  const situation = document.getElementById('trigger-situation')?.value?.trim();
  const note = document.getElementById('trigger-note')?.value?.trim();
  if (!situation || !triggerDraft.reactionType) return;

  const entry = {
    situation,
    reactionType: triggerDraft.reactionType,
    intensity:    triggerDraft.intensity,
    zone:         triggerDraft.zone || null,
    sensations:   [...triggerDraft.sensations],
    note:         note || null
  };

  Storage.saveTriggerEntry(entry);
  hapticNotify('success');
  goBack();
}

function renderTriggerHistory() {
  const container = document.getElementById('trigger-history-list');
  if (!container) return;

  const entries = Storage.getTriggerEntries();
  if (!entries.length) {
    container.innerHTML = `
      <div style="text-align:center; padding: 48px 24px; color:var(--tg-hint)">
        <div style="font-size:2rem; margin-bottom:12px">⚡</div>
        <div>Записей пока нет.</div>
        <div style="margin-top:4px; font-size:13px">Зафиксируй реакцию — это займёт 2 минуты</div>
      </div>`;
    return;
  }

  // Статистика по типам реакций
  const counts = { freeze: 0, fight: 0, flight: 0, fawn: 0 };
  entries.forEach(e => { if (counts[e.reactionType] !== undefined) counts[e.reactionType]++; });
  const total = entries.length;

  const statsHtml = `
    <div class="trigger-stats">
      ${['freeze','fight','flight','fawn'].map(id => {
        const p = DATA.patterns[id];
        const pct = total ? Math.round(counts[id] / total * 100) : 0;
        return `<div class="trigger-stat-item">
          <div class="trigger-stat-bar" style="background:${p.colorLight}; border:1px solid ${p.color}20">
            <div class="trigger-stat-fill" style="width:${pct}%; background:${p.color}"></div>
          </div>
          <div class="trigger-stat-label">${p.emoji} ${p.name}</div>
          <div class="trigger-stat-count">${counts[id]}</div>
        </div>`;
      }).join('')}
    </div>`;

  // Список записей
  const listHtml = entries.map(e => {
    const p = DATA.patterns[e.reactionType];
    const date = new Date(e.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    const zoneName = e.zone ? DATA.zones.find(z => z.id === e.zone)?.label : null;
    return `<div class="trigger-card">
      <div class="trigger-card-top">
        <span class="trigger-badge" style="background:${p.colorLight}; color:${p.color}">${p.emoji} ${p.name}</span>
        <span class="trigger-card-date">${date}</span>
      </div>
      <div class="trigger-card-situation">${e.situation}</div>
      ${zoneName ? `<div class="trigger-card-meta">📍 ${zoneName} · интенсивность ${e.intensity}/10</div>` : `<div class="trigger-card-meta">интенсивность ${e.intensity}/10</div>`}
      ${e.note ? `<div class="trigger-card-note">${e.note}</div>` : ''}
    </div>`;
  }).join('');

  container.innerHTML = `
    <div style="padding: 0 16px 16px">
      <div class="section-label" style="padding-top:16px">Паттерны реакций</div>
      ${statsHtml}
      <div class="section-label mt-16">Все записи</div>
      ${listHtml}
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────
// ТРЕКЕР ИЗМЕНЕНИЙ
// ─────────────────────────────────────────────────────────────────────────

const CHECKIN_SCALES = [
  { key: 'tension',     label: 'Напряжение в теле', emoji: '😤', lowBetter: true,  low: 'нет',  high: 'сильное' },
  { key: 'anxiety',     label: 'Тревога',           emoji: '😰', lowBetter: true,  low: 'нет',  high: 'сильная' },
  { key: 'energy',      label: 'Энергия',           emoji: '⚡',  lowBetter: false, low: 'мало', high: 'много'   },
  { key: 'safety',      label: 'Безопасность',      emoji: '🛡️', lowBetter: false, low: 'нет',  high: 'есть'   },
  { key: 'bodyContact', label: 'Контакт с телом',   emoji: '🫀', lowBetter: false, low: 'слабый', high: 'сильный' },
];

const checkinDraft = { tension: 5, anxiety: 5, energy: 5, safety: 5, bodyContact: 5 };

function initCheckin() {
  // Кнопка «📊 Трекер изменений» в дневнике
  document.getElementById('checkin-btn')?.addEventListener('click', () => {
    renderCheckinScales();
    document.getElementById('checkin-note').value = '';
    goTo('checkin');
    haptic('light');
  });

  // Кнопка «История» в шапке экрана чекина
  document.getElementById('checkin-history-btn')?.addEventListener('click', () => {
    renderCheckinHistory();
    goTo('checkin-history');
    haptic('light');
  });

  // Кнопка «+ Новый» из экрана истории
  document.getElementById('new-checkin-btn')?.addEventListener('click', () => {
    renderCheckinScales();
    document.getElementById('checkin-note').value = '';
    goTo('checkin');
    haptic('light');
  });

  // Сохранить чекин
  document.getElementById('checkin-save-btn')?.addEventListener('click', saveCheckinEntry);
}

function renderCheckinScales() {
  const container = document.getElementById('checkin-scales');
  if (!container) return;

  container.innerHTML = CHECKIN_SCALES.map(s => `
    <div class="checkin-scale-item">
      <div class="checkin-scale-header">
        <span class="checkin-scale-emoji">${s.emoji}</span>
        <span class="checkin-scale-label">${s.label}</span>
        <span class="checkin-scale-val" id="val-${s.key}">5</span>
      </div>
      <input type="range" class="intensity-slider" min="1" max="10" value="5"
        id="slider-${s.key}" data-key="${s.key}">
      <div class="intensity-labels">
        <span class="intensity-hint">${s.low}</span>
        <span class="intensity-hint">${s.high}</span>
      </div>
    </div>`).join('');

  CHECKIN_SCALES.forEach(s => {
    checkinDraft[s.key] = 5;
    const slider = document.getElementById(`slider-${s.key}`);
    if (slider) {
      slider.addEventListener('input', () => {
        checkinDraft[s.key] = Number(slider.value);
        const valEl = document.getElementById(`val-${s.key}`);
        if (valEl) valEl.textContent = slider.value;
      });
    }
  });
}

function saveCheckinEntry() {
  try {
    const note = document.getElementById('checkin-note')?.value?.trim() || '';

    const checkins = Storage.getCheckins();
    const today = new Date().toDateString();
    const alreadyToday = checkins.some(c => new Date(c.date).toDateString() === today);
    if (alreadyToday) {
      const idx = checkins.findIndex(c => new Date(c.date).toDateString() === today);
      checkins[idx] = { ...checkins[idx], ...checkinDraft, note };
      localStorage.setItem('tp_checkins', JSON.stringify(checkins));
    } else {
      Storage.saveCheckin({ ...checkinDraft, note });
    }

    hapticNotify('success');
    showToast('Чекин сохранён ✓');
    setTimeout(goBack, 900);
  } catch (e) {
    showToast('Ошибка: ' + e.message, false);
  }
}

function showToast(msg, ok = true) {
  let t = document.getElementById('app-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'app-toast';
    t.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:9999;padding:10px 20px;border-radius:24px;font-size:14px;font-weight:500;pointer-events:none;transition:opacity 0.3s;max-width:280px;text-align:center;';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.background = ok ? '#22c55e' : '#ef4444';
  t.style.color = '#fff';
  t.style.opacity = '1';
  clearTimeout(t._hide);
  t._hide = setTimeout(() => { t.style.opacity = '0'; }, 2200);
}

function renderCheckinHistory() {
  const container = document.getElementById('checkin-history-list');
  if (!container) return;

  const checkins = Storage.getCheckins();

  if (!checkins.length) {
    container.innerHTML = `
      <div style="text-align:center; padding: 48px 24px; color:var(--tg-hint)">
        <div style="font-size:2.5rem; margin-bottom:12px">📊</div>
        <div>Чекинов пока нет.</div>
        <div style="margin-top:4px; font-size:13px">Сделай первую оценку — это займёт минуту</div>
      </div>`;
    return;
  }

  // Карточка сравнения: первый vs последний чекин (если >= 2)
  let comparisonHtml = '';
  if (checkins.length >= 2) {
    const first = checkins[0];
    const last  = checkins[checkins.length - 1];
    const firstDate = new Date(first.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    const lastDate  = new Date(last.date).toLocaleDateString('ru-RU',  { day: 'numeric', month: 'short' });

    const rows = CHECKIN_SCALES.map(s => {
      const a = first[s.key] || 5;
      const b = last[s.key]  || 5;
      const delta = b - a;
      const improved = s.lowBetter ? delta < 0 : delta > 0;
      const worsened = s.lowBetter ? delta > 0 : delta < 0;
      const arrow  = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
      const cls    = improved ? 'checkin-delta--good' : worsened ? 'checkin-delta--bad' : 'checkin-delta--same';
      return `<div class="checkin-compare-row">
        <span class="checkin-compare-label">${s.emoji} ${s.label}</span>
        <span class="checkin-compare-vals">${a} → ${b}</span>
        <span class="checkin-delta ${cls}">${arrow}${Math.abs(delta) || ''}</span>
      </div>`;
    }).join('');

    comparisonHtml = `
      <div class="checkin-comparison">
        <div class="checkin-comparison-head">
          <span>Изменения за программу</span>
          <span class="checkin-comparison-dates">${firstDate} → ${lastDate}</span>
        </div>
        ${rows}
      </div>`;
  }

  // Список чекинов (от новых к старым)
  const listHtml = [...checkins].reverse().map(c => {
    const date = new Date(c.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    const bars = CHECKIN_SCALES.map(s => {
      const val = c[s.key] || 5;
      const pct = val * 10;
      const color = s.lowBetter
        ? `hsl(${120 - val * 10}, 60%, 55%)`
        : `hsl(${val * 10}, 60%, 45%)`;
      return `<div class="checkin-mini-row">
        <span class="checkin-mini-label">${s.emoji}</span>
        <div class="checkin-mini-bar-wrap">
          <div class="checkin-mini-bar-fill" style="width:${pct}%; background:${color}"></div>
        </div>
        <span class="checkin-mini-val">${val}</span>
      </div>`;
    }).join('');

    return `<div class="checkin-card">
      <div class="checkin-card-date">${date}</div>
      <div class="checkin-mini-bars">${bars}</div>
      ${c.note ? `<div class="checkin-card-note">${c.note}</div>` : ''}
    </div>`;
  }).join('');

  container.innerHTML = `<div style="padding: 0 16px 24px">
    ${comparisonHtml}
    <div class="section-label" style="padding-top:${checkins.length >= 2 ? 16 : 0}px">Все чекины</div>
    ${listHtml}
  </div>`;
}

// ─────────────────────────────────────────────────────────────────────────
// АНКЕТА УЧАСТНИЦЫ (до потока)
// ─────────────────────────────────────────────────────────────────────────

let qAnswers = {};
let qStep = 0;
let qStreamId = null;

const Q_BLOCKS = [
  {
    title: 'О вас',
    fields: [
      { id: 'name',         label: 'Как вас зовут?', hint: 'Имя, как вам удобно', type: 'text', required: true },
      { id: 'age',          label: 'Сколько вам лет?', type: 'radio', options: ['до 25','25–30','31–35','36–40','41–45','46–50','старше 50'], required: true },
      { id: 'occupation',   label: 'Чем вы занимаетесь?', type: 'radio', options: ['найм (офис или удалённо)','своё дело / самозанятость','фриланс','в декрете','учусь','не работаю сейчас','другое'], required: true },
      { id: 'familyStatus', label: 'Семейное положение', type: 'radio', options: ['в отношениях / замужем','не в отношениях','развожусь / недавно рассталась'], required: true },
      { id: 'hasChildren',  label: 'Есть ли у вас дети?', type: 'radio', options: ['нет','да, один ребёнок','да, двое и больше'], required: true },
      { id: 'city',         label: 'Из какого вы города / региона?', type: 'text', required: false }
    ]
  },
  {
    title: 'Как вы сюда пришли',
    fields: [
      { id: 'source',              label: 'Откуда вы узнали о программе?', type: 'radio', options: ['от подруги или знакомой','Telegram-канал','Instagram','сама нашла в поиске','другое'], required: true },
      { id: 'referralName',        label: 'Если посоветовала подруга — как её зовут?', hint: 'Необязательно', type: 'text', required: false },
      { id: 'whatCaughtAttention', label: 'Что вас зацепило — из-за чего решили прийти?', hint: 'Можно выбрать несколько', type: 'checkbox', options: ['тема работы с телом и реакциями','соматический подход, не просто «осознайте»','доверие к ведущим','рекомендация подруги','формат — живые встречи в группе','цена','другое'] },
      { id: 'priorExperience',     label: 'Что пробовали до этого?', hint: 'Можно выбрать несколько', type: 'checkbox', options: ['индивидуальная терапия','онлайн-курсы по психологии','марафоны и групповые программы','йога / дыхательные практики / медитация','ничего, это первый опыт','другое'] }
    ]
  },
  {
    title: 'Ваш запрос',
    fields: [
      { id: 'currentSituation',     label: 'Что сейчас происходит в вашей жизни, что привело вас сюда?', hint: 'Это самый важный вопрос анкеты', type: 'textarea', required: false },
      { id: 'bodyTension',          label: 'Где в теле чаще всего живёт напряжение?', hint: 'Можно выбрать несколько', type: 'checkbox', options: ['горло / шея','плечи / спина','грудь / сердце','живот','челюсть','голова','чувствую онемение — тело как будто не моё','не замечаю ничего конкретного'] },
      { id: 'bodyStressSensations', label: 'Какие ощущения возникают в теле при стрессе?', hint: 'Можно выбрать несколько', type: 'checkbox', options: ['тяжесть','зажатость, сдавленность','дрожь или холод','ком в горле или груди','онемение, отключение','жар, пульсация','ничего не чувствую — уходит в голову'] },
      { id: 'stressReaction',       label: 'Как вы обычно реагируете, когда что-то идёт не так?', type: 'radio', options: ['замираю — не могу думать или двигаться','злюсь, спорю, защищаюсь','ухожу — в работу, телефон, сон, еду','начинаю подстраиваться, угождать, чтобы всё наладилось','по-разному, зависит от ситуации'] }
    ]
  },
  {
    title: 'Ваше состояние сейчас',
    fields: [
      { id: 'bodyContactScale', label: 'Насколько вы чувствуете контакт с телом?', hint: '1 — совсем не чувствую, 10 — в полном контакте', type: 'scale', min: 1, max: 10 },
      { id: 'anxietyScale',     label: 'Уровень тревоги в обычный день', hint: '1 — спокойно, 10 — постоянно тревожно', type: 'scale', min: 1, max: 10 },
      { id: 'hasTherapist',     label: 'Есть ли у вас сейчас психолог или терапевт?', type: 'radio', options: ['да, работаю параллельно','нет, но был раньше','нет, никогда не было'] }
    ]
  },
  {
    title: 'Ожидания',
    fields: [
      { id: 'successMeans',    label: 'Что для вас будет означать, что программа сработала?', type: 'textarea', required: false },
      { id: 'importantInWork', label: 'Что для вас важно в работе с собой?', hint: 'Можно выбрать несколько', type: 'checkbox', options: ['почувствовать, что я не одна с этим','получить конкретные инструменты на каждый день','наконец-то что-то почувствовать — а не только понять','разобраться, почему тело реагирует именно так','научиться останавливаться в моменте'] }
    ]
  },
  {
    title: 'Немного о предпочтениях',
    fields: [
      { id: 'followedChannels', label: 'На что вы подписаны — что читаете или смотрите про психологию, тело, саморазвитие?', hint: 'Каналы, блогеры, подкасты — любой формат. Необязательно', type: 'textarea', required: false },
      { id: 'practiceTime',    label: 'Сколько минут в день реально готовы уделять практике?', type: 'radio', options: ['5–10 минут','10–20 минут','20–30 минут','больше 30 минут'] },
      { id: 'futureInterest',  label: 'Интересен ли вам формат работы после потока?', hint: 'Можно выбрать несколько', type: 'checkbox', options: ['да, хочу индивидуальные сессии','да, интересен записанный курс','да, хочу следующий поток в группе','пока не знаю','мне достаточно этой программы'] }
    ]
  }
];

// ─── Инициализация и проверка статуса ────────────────────────────────────

async function checkAndShowQuestionnaire(streamId) {
  qStreamId = streamId;
  if (Storage.isQuestionnaireDone()) return;

  // Проверяем на сервере — вдруг уже заполнена с другого устройства
  try {
    const status = await Api.getQuestionnaireStatus(streamId);
    if (status?.pre) {
      Storage.setQuestionnaireDone();
      return;
    }
  } catch { /* нет связи — показываем по флагу */ }

  // Показываем bottom sheet через 10 сек (только 1 раз)
  if (!Storage.isQSheetShown()) {
    setTimeout(() => {
      Storage.setQSheetShown();
      showQInvite();
    }, 10000);
  }
}

// ─── Bottom sheet — приглашение ───────────────────────────────────────────

function showQInvite() {
  const overlay = document.getElementById('q-invite-overlay');
  const sheet   = document.getElementById('q-invite-sheet');
  if (!overlay || !sheet) return;
  overlay.classList.add('active');
  sheet.classList.add('active');
  haptic('light');
}

function closeQInvite() {
  const overlay = document.getElementById('q-invite-overlay');
  const sheet   = document.getElementById('q-invite-sheet');
  if (!overlay || !sheet) return;
  overlay.classList.remove('active');
  sheet.classList.remove('active');
}

// ─── Открыть / закрыть экран анкеты ──────────────────────────────────────

function openQuestionnaire() {
  closeQInvite();
  qStep = 0;
  qAnswers = {};
  renderQBlock();
  goTo('questionnaire');
}

function closeQuestionnaire() {
  goBack();
}

// ─── Рендер блока ────────────────────────────────────────────────────────

function renderQBlock() {
  const block = Q_BLOCKS[qStep];
  const total = Q_BLOCKS.length;

  // Прогресс
  const pct = Math.round(((qStep + 1) / total) * 100);
  const fill = document.getElementById('q-progress-fill');
  const label = document.getElementById('q-progress-label');
  if (fill) fill.style.width = pct + '%';
  if (label) label.textContent = `Блок ${qStep + 1} из ${total}`;

  // Кнопки
  const backBtn = document.getElementById('q-back-btn');
  const nextBtn = document.getElementById('q-next-btn');
  if (backBtn) backBtn.style.display = qStep === 0 ? 'none' : '';
  if (nextBtn) nextBtn.textContent = qStep === total - 1 ? 'Отправить' : 'Далее';

  // Контент
  const body = document.getElementById('questionnaire-body');
  if (!body) return;

  const fieldsHtml = block.fields.map(f => renderQField(f)).join('');
  body.innerHTML = `
    <div class="q-block-title">${block.title}</div>
    ${fieldsHtml}
  `;
  body.scrollTop = 0;

  // Восстанавливаем сохранённые значения
  block.fields.forEach(f => restoreQField(f));

  // Вешаем обработчики
  block.fields.forEach(f => bindQField(f));
}

function renderQField(f) {
  const hint = f.hint ? `<div class="q-field-hint">${f.hint}</div>` : '';
  const req  = f.required ? '<span class="q-required">*</span>' : '';

  if (f.type === 'text') {
    return `<div class="q-field">
      <label class="q-label">${f.label}${req}</label>${hint}
      <input class="q-input" id="qf-${f.id}" type="text" placeholder="">
    </div>`;
  }

  if (f.type === 'textarea') {
    return `<div class="q-field">
      <label class="q-label">${f.label}${req}</label>${hint}
      <textarea class="q-textarea" id="qf-${f.id}" rows="4" placeholder=""></textarea>
    </div>`;
  }

  if (f.type === 'radio') {
    const opts = f.options.map(o => `
      <label class="q-option">
        <input type="radio" name="qf-${f.id}" value="${o}">
        <span class="q-option-label">${o}</span>
      </label>`).join('');
    return `<div class="q-field">
      <div class="q-label">${f.label}${req}</div>${hint}
      <div class="q-options">${opts}</div>
    </div>`;
  }

  if (f.type === 'checkbox') {
    const opts = f.options.map(o => `
      <label class="q-option">
        <input type="checkbox" name="qf-${f.id}" value="${o}">
        <span class="q-option-label">${o}</span>
      </label>`).join('');
    return `<div class="q-field">
      <div class="q-label">${f.label}</div>${hint}
      <div class="q-options">${opts}</div>
    </div>`;
  }

  if (f.type === 'scale') {
    const nums = Array.from({length: f.max - f.min + 1}, (_,i) => i + f.min);
    const btns = nums.map(n => `<button class="q-scale-btn" data-val="${n}" data-id="${f.id}">${n}</button>`).join('');
    return `<div class="q-field">
      <div class="q-label">${f.label}</div>${hint}
      <div class="q-scale" id="qscale-${f.id}">${btns}</div>
    </div>`;
  }

  return '';
}

function restoreQField(f) {
  const saved = qAnswers[f.id];
  if (!saved) return;

  if (f.type === 'text' || f.type === 'textarea') {
    const el = document.getElementById(`qf-${f.id}`);
    if (el) el.value = saved;
  }
  if (f.type === 'radio') {
    document.querySelectorAll(`input[name="qf-${f.id}"]`).forEach(inp => {
      if (inp.value === saved) inp.checked = true;
    });
  }
  if (f.type === 'checkbox' && Array.isArray(saved)) {
    document.querySelectorAll(`input[name="qf-${f.id}"]`).forEach(inp => {
      if (saved.includes(inp.value)) inp.checked = true;
    });
  }
  if (f.type === 'scale') {
    document.querySelectorAll(`#qscale-${f.id} .q-scale-btn`).forEach(btn => {
      if (Number(btn.dataset.val) === saved) btn.classList.add('q-scale-btn--active');
    });
  }
}

function bindQField(f) {
  if (f.type === 'scale') {
    document.querySelectorAll(`#qscale-${f.id} .q-scale-btn`).forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll(`#qscale-${f.id} .q-scale-btn`).forEach(b => b.classList.remove('q-scale-btn--active'));
        btn.classList.add('q-scale-btn--active');
        qAnswers[f.id] = Number(btn.dataset.val);
        haptic('light');
      });
    });
  }
}

// ─── Собрать ответы текущего блока ───────────────────────────────────────

function collectQBlock() {
  const block = Q_BLOCKS[qStep];
  block.fields.forEach(f => {
    if (f.type === 'text' || f.type === 'textarea') {
      const el = document.getElementById(`qf-${f.id}`);
      if (el) qAnswers[f.id] = el.value.trim();
    }
    if (f.type === 'radio') {
      const checked = document.querySelector(`input[name="qf-${f.id}"]:checked`);
      if (checked) qAnswers[f.id] = checked.value;
    }
    if (f.type === 'checkbox') {
      const checked = [...document.querySelectorAll(`input[name="qf-${f.id}"]:checked`)].map(i => i.value);
      if (checked.length) qAnswers[f.id] = checked;
    }
    // scale — уже сохраняется при клике
  });
}

// ─── Навигация по блокам ─────────────────────────────────────────────────

function qNext() {
  collectQBlock();
  haptic('light');

  if (qStep < Q_BLOCKS.length - 1) {
    qStep++;
    renderQBlock();
    return;
  }

  // Последний блок — отправляем
  submitQuestionnaire();
}

function qPrev() {
  collectQBlock();
  haptic('light');
  if (qStep > 0) {
    qStep--;
    renderQBlock();
  }
}

// ─── Отправка на сервер ───────────────────────────────────────────────────

async function submitQuestionnaire() {
  const nextBtn = document.getElementById('q-next-btn');
  if (nextBtn) { nextBtn.disabled = true; nextBtn.textContent = 'Отправляем…'; }

  try {
    if (qStreamId) {
      await Api.saveQuestionnairePre(qStreamId, qAnswers);
    }
    Storage.setQuestionnaireDone();
    hapticNotify('success');

    // Показываем благодарность
    const body = document.getElementById('questionnaire-body');
    if (body) {
      body.innerHTML = `
        <div class="q-done">
          <div class="q-done-icon">🌿</div>
          <div class="q-done-title">Спасибо</div>
          <div class="q-done-text">Мы внимательно прочитаем каждую анкету. Увидимся на первой встрече.</div>
        </div>`;
    }
    const footer = document.querySelector('.questionnaire-footer');
    if (footer) footer.innerHTML = `<button class="btn btn--accent btn--full" onclick="closeQuestionnaire()">Закрыть</button>`;

    // Обновляем профиль — убираем баннер
    renderProfileTab();
  } catch {
    if (nextBtn) { nextBtn.disabled = false; nextBtn.textContent = 'Отправить'; }
    alert('Не удалось отправить анкету. Проверьте соединение и попробуйте ещё раз.');
  }
}

// ─── Баннер согласия на обработку данных ─────────────────────────────────

function renderConsentBanner() {
  const container = document.getElementById('consent-banner-wrap');
  if (!container) return;

  if (Storage.isConsentGiven()) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="consent-banner">
      <div class="consent-banner-icon">🔒</div>
      <div class="consent-banner-body">
        <div class="consent-banner-title">Подтвердите согласие на обработку данных</div>
        <div class="consent-banner-sub">Требуется по ФЗ-152 — займёт 10 секунд</div>
      </div>
      <button class="consent-banner-btn" id="consent-banner-btn">Подтвердить</button>
    </div>`;

  document.getElementById('consent-banner-btn')?.addEventListener('click', async () => {
    Storage.setConsentGiven();
    container.innerHTML = '';
    hapticNotify('success');
    Api.giveConsent().catch(() => {});
  });
}

// ─── Баннер в профиле ────────────────────────────────────────────────────

function renderQuestionnaireBanner() {
  const container = document.getElementById('q-banner-wrap');
  if (!container) return;

  if (Storage.isQuestionnaireDone()) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="q-banner" onclick="openQuestionnaire()">
      <div class="q-banner-icon">📋</div>
      <div class="q-banner-body">
        <div class="q-banner-title">Анкета участницы не заполнена</div>
        <div class="q-banner-sub">Займёт 5 минут — помогает сделать программу точнее</div>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
    </div>`;
}
