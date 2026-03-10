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
  if (!tg?.themeParams) return;
  const p = tg.themeParams;
  const r = document.documentElement;
  if (p.bg_color)           r.style.setProperty('--tg-theme-bg-color',            p.bg_color);
  if (p.secondary_bg_color) r.style.setProperty('--tg-theme-secondary-bg-color',  p.secondary_bg_color);
  if (p.text_color)         r.style.setProperty('--tg-theme-text-color',           p.text_color);
  if (p.hint_color)         r.style.setProperty('--tg-theme-hint-color',           p.hint_color);
  if (p.link_color)         r.style.setProperty('--tg-theme-link-color',           p.link_color);
  if (p.button_color)       r.style.setProperty('--tg-theme-button-color',         p.button_color);
  if (p.button_text_color)  r.style.setProperty('--tg-theme-button-text-color',    p.button_text_color);
  if (p.header_bg_color)    r.style.setProperty('--tg-theme-header-bg-color',      p.header_bg_color);
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

  // Запускаем сплэш → главный экран
  setTimeout(() => {
    goTo('home');
    renderDiaryTab();
    renderDiagTab();
    renderProfileTab();
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
  if (tab === 'diag')    renderDiagTab();
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
  const entry = Storage.getTodayEntry();

  if (!entry) {
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
    const zone = DATA.zones.find(z => z.id === entry.zone);
    const sLabels = (entry.sensations || [])
      .map(id => DATA.sensations.find(s => s.id === id))
      .filter(Boolean)
      .map(s => `<span class="entry-sens-chip">${s.emoji} ${s.label}</span>`)
      .join('');

    container.className = 'today-card today-card--done';
    container.innerHTML = `
      <div class="today-done">
        <div class="today-done-check">✓</div>
        <div class="today-done-info">
          <div class="today-done-title">${zone?.label || '—'}</div>
          <div class="today-done-meta">Запись за сегодня сделана</div>
          <div class="entry-sens mt-8">${sLabels}</div>
          ${entry.note ? `<div class="entry-note mt-8">${entry.note}</div>` : ''}
        </div>
      </div>`;
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
  // Сбрасываем все маркеры
  document.querySelectorAll('.zone-marker').forEach(m => {
    m.classList.remove('zone-marker--active');
  });
  // Сбрасываем кнопки
  document.querySelectorAll('.zone-btn').forEach(b => {
    b.classList.remove('zone-btn--active');
  });
  // Скрываем инфо-карточку
  document.getElementById('zone-info-card')?.classList.add('hidden');
  // Блокируем кнопку
  const btn = document.getElementById('zone-continue-btn');
  if (btn) btn.disabled = true;
}

// Клик по кнопке зоны
document.addEventListener('click', e => {
  const btn = e.target.closest('.zone-btn');
  if (!btn || !btn.dataset.zone) return;
  selectZone(btn.dataset.zone);
  haptic('light');
});

function selectZone(zoneId) {
  draft.zone = zoneId;
  const zone = DATA.zones.find(z => z.id === zoneId);
  if (!zone) return;

  // Подсвечиваем кнопку
  document.querySelectorAll('.zone-btn').forEach(b => b.classList.remove('zone-btn--active'));
  document.querySelector(`.zone-btn[data-zone="${zoneId}"]`)?.classList.add('zone-btn--active');

  // Подсвечиваем маркер на SVG
  document.querySelectorAll('.zone-marker').forEach(m => m.classList.remove('zone-marker--active'));
  document.querySelector(`.zone-marker[data-zone="${zoneId}"]`)?.classList.add('zone-marker--active');

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
// ВКЛАДКА: ДИАГНОСТИКА
// ─────────────────────────────────────────────────────────────────────────
function renderDiagTab() {
  const container = document.getElementById('diag-tab-content');
  if (!container) return;

  const saved = Storage.getDiagResult();

  if (saved) {
    // Показываем сохранённый результат
    const p = DATA.patterns[saved.patternId];
    if (!p) return;
    const date = new Date(saved.date).toLocaleDateString('ru-RU', {
      day:'numeric', month:'long', year:'numeric'
    });
    container.innerHTML = `
      <div class="diag-saved-result" style="background:${p.colorLight}; border-left:4px solid ${p.color}">
        <div class="diag-saved-emoji">${p.emoji}</div>
        <div class="diag-saved-name" style="color:${p.color}">${p.name}</div>
        <div class="diag-saved-sub">${p.subtitle}</div>
        <div class="diag-saved-date">Диагностика: ${date}</div>
      </div>
      <button class="btn btn--ghost btn--full btn--sm mb-16" id="diag-view-result-btn">
        Посмотреть полный результат
      </button>
      <div class="section-label">Хотите пройти заново?</div>
      <button class="btn btn--outline btn--full btn--sm" id="diag-retake-btn">
        Пройти диагностику снова
      </button>`;

    document.getElementById('diag-view-result-btn')?.addEventListener('click', () => {
      renderResultScreen(saved.patternId);
      goTo('result');
      haptic();
    });
    document.getElementById('diag-retake-btn')?.addEventListener('click', () => {
      Storage.clearDiagResult();
      renderDiagTab();
      haptic();
    });

  } else {
    // Показываем интро
    container.innerHTML = `
      <div class="diag-intro">
        <div class="diag-intro-icon">🔍</div>
        <div class="diag-intro-title">Найдите свой паттерн</div>
        <div class="diag-intro-desc">
          10 вопросов — и вы узнаете, какая телесная стратегия выживания управляет вашими реакциями
        </div>
        <div class="diag-intro-chips">
          <span class="diag-chip">⏱ 2 минуты</span>
          <span class="diag-chip">🔒 Анонимно</span>
          <span class="diag-chip">🎯 4 паттерна</span>
        </div>
        <button class="btn btn--primary btn--full" id="diag-start-btn">
          Начать диагностику
        </button>
      </div>`;

    document.getElementById('diag-start-btn')?.addEventListener('click', startDiagnostic);
  }
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
    switchTab('diag');
    renderDiagTab();
    haptic();
  };
}

// ─────────────────────────────────────────────────────────────────────────
// ВКЛАДКА: ПРОФИЛЬ
// ─────────────────────────────────────────────────────────────────────────
function initProfile() {}

function renderProfileTab() {
  renderUserCard();
  renderStats();
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
