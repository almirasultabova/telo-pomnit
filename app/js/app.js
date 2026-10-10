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
  r.style.setProperty('--tg-theme-secondary-bg-color', '#e9e1d6');
  r.style.setProperty('--tg-theme-text-color',         '#1a211a');
  r.style.setProperty('--tg-theme-hint-color',         '#726a60');
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
let habitualView = 'summary';
function goTo(screenId, back = false) {
  if (Api.clubBlocked) return;
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

  if (screenId === 'home') screenStack.length = 0;
  else if (!back && !['splash', 'onboarding'].includes(currentScreen)) screenStack.push(currentScreen);
  currentScreen = screenId;
  if (screenId === 'home' && activeTab === 'main') renderMainTab();
  updateBackBtn();
  AppBoot.done();
}

function goBack() {
  if (currentScreen === 'data-rights') { closeDataRights(); return; }
  if (Api.clubBlocked) { screenStack.length = 0; updateBackBtn(); return; }
  if (currentScreen === 'home' && activeTab === 'diag' && habitualView !== 'summary') {
    if (habitualView === 'quiz' && diag.current > 0) habitualPrevious();
    else renderMyPathTab();
    return;
  }
  if (!screenStack.length) return;
  const prev = screenStack.pop();
  goTo(prev, true);
}

function updateBackBtn() {
  if (!tg?.BackButton) return;
  if (currentScreen === 'data-rights' || !Api.clubBlocked && (screenStack.length > 0 || habitualView !== 'summary' && currentScreen === 'home' && activeTab === 'diag')) {
    tg.BackButton.show();
  } else {
    tg.BackButton.hide();
  }
}

let telegramBackBound = false;
function syncTelegramBackNavigation() {
  if (!tg?.BackButton?.onClick) return;
  if (typeof tg.BackButton.offClick === 'function') {
    tg.BackButton.offClick(goBack);
    tg.BackButton.onClick(goBack);
  } else if (!telegramBackBound) tg.BackButton.onClick(goBack);
  telegramBackBound = true;
  updateBackBtn();
}
syncTelegramBackNavigation();
window.addEventListener('pageshow', syncTelegramBackNavigation);
tg?.onEvent?.('activated', syncTelegramBackNavigation);
document.addEventListener('visibilitychange', () => { if (!document.hidden) syncTelegramBackNavigation(); });

// ─── Состояние текущей записи дневника ───────────────────────────────────
const draft = {
  zone:       null,  // id зоны
  sensations: [],    // массив id ощущений
  note:       ''
};

let bodyMapView = 'front';
let savedDiaryClientId = null;
let diarySaveStarted = false;

// ─── Состояние диагностики ────────────────────────────────────────────────
const diag = {
  answers:  [],   // массив { pattern }
  current:  0     // индекс текущего вопроса
};

// ─── Текущая активная вкладка ─────────────────────────────────────────────
let activeTab = 'main';
// Home keeps only the identity returned by the authenticated API, never initDataUnsafe.
let homeUser = null;

// ─── Фильтр карты тела по неделям (0 = все) ───────────────────────────────
let heatmapWeek = 0;

// Calendar boundaries use Moscow civil days, independent of device timezone.
function moscowDay(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = name => parts.find(p => p.type === name).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function streamPeriod(stream = currentProgram()) {
  if (!stream) return null;
  const first = moscowDay(stream.startDate), last = moscowDay(stream.endDate);
  if (!first || !last || last < first) return null;
  const start = Date.parse(first + 'T00:00:00+03:00');
  const end = Date.parse(last + 'T00:00:00+03:00') + 86400000;
  return { start, end, first, last, weeks: Math.ceil((end - start) / (7 * 86400000)) };
}
function streamState(stream = currentProgram(), now = programNow()) {
  const period = streamPeriod(stream);
  if (!period) return 'none';
  return now < period.start ? 'upcoming' : now >= period.end ? 'completed' : 'current';
}
function inStreamPeriod(row, stream = currentProgram()) {
  const period = streamPeriod(stream);
  const time = Date.parse(row.date || row.createdAt);
  return !!period && (!row.streamId || row.streamId === stream.id) && time >= period.start && time < period.end;
}
function getStreamWeek(dateStr, stream = currentProgram()) {
  const period = streamPeriod(stream), time = Date.parse(dateStr);
  if (!period || time < period.start || time >= period.end || !Number.isFinite(time)) return null;
  return Math.floor((time - period.start) / (7 * 86400000)) + 1;
}
function selectedCheckins() {
  return Storage.getCheckins().filter(row => inStreamPeriod(row));
}
function periodStreak(entries) {
  const days = [...new Set(entries.map(e => moscowDay(e.date)).filter(Boolean))].sort();
  let best = 0, count = 0, previous = null;
  for (const day of days) {
    const stamp = Date.parse(day + 'T00:00:00+03:00');
    count = previous !== null && stamp - previous === 86400000 ? count + 1 : 1;
    best = Math.max(best, count); previous = stamp;
  }
  return best;
}
function selectedAttendance() {
  const meetings = currentProgram()?.meetings || [];
  const attended = new Set(Storage.getAttended().map(String));
  return { total: meetings.length, count: meetings.filter(m => attended.has(String(m.id))).length };
}
function programPickerHTML() {
  const streams = programAccess?.streams || [];
  if (!streams.length) return '';
  return `<label for="path-stream-select">Поток для наблюдений</label><select class="access-select" id="path-stream-select">${streams.map(stream => `<option value="${escapeAccessText(stream.id)}"${stream.id === selectedProgramId ? ' selected' : ''}>${escapeAccessText(stream.name)}${streamState(stream) === 'completed' ? ' · архив' : ''}</option>`).join('')}</select>`;
}
function selectProgram(id) {
  if (!programAccess?.streams?.some(stream => stream.id === id)) return;
  selectedProgramId = id; heatmapWeek = 0;
  renderMyPathTab(); renderNextMeeting(); renderZoomBtn(); renderSchedule(); renderMainTab();
}
function streamStatusHTML() {
  const stream = currentProgram(), period = streamPeriod(stream);
  if (!programAccess) return '<p class="access-notice">Не удалось загрузить период потока. Обновите доступ и расписание во вкладке «Мой поток».</p>';
  if (!period) return '<p class="access-notice">Поток для наблюдений пока не выбран. Личный дневник и история доступны во вкладке «Дневник».</p>';
  const fmt = value => new Date(value + 'T12:00:00+03:00').toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', year: 'numeric' });
  const state = streamState(stream);
  const title = state === 'upcoming' ? 'Поток скоро начнётся' : state === 'completed' ? 'Архив потока' : 'Поток идёт';
  return `<div class="access-program"><strong>${title}</strong><p>${escapeAccessText(stream.name)} · ${fmt(period.first)} — ${fmt(period.last)} · МСК</p>${state === 'upcoming' ? '<p>Наблюдения этого потока появятся после начала. Прежние записи остаются в дневнике.</p>' : ''}</div>`;
}

function avgOf(arr) {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
}

// ─────────────────────────────────────────────────────────────────────────
// ОЩУЩЕНИЯ: встроенные + пользовательские
// ─────────────────────────────────────────────────────────────────────────
const CUSTOM_SENSATION_PREFIX = 'custom:';
const CUSTOM_SENSATION_ICON = '<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>';

function getCustomSensations() {
  try {
    return JSON.parse(AppLocalStorage.getItem(Storage.key('tp_custom_sensations')) || '[]');
  } catch { return []; }
}
function addCustomSensation(label) {
  const list = getCustomSensations();
  if (!list.includes(label)) {
    list.push(label);
    AppLocalStorage.setItem(Storage.key('tp_custom_sensations'), JSON.stringify(list));
  }
}
// Возвращает {id, label, emoji} для любого id — встроенного или custom:<label>
function getSensation(id) {
  if (typeof id === 'string' && id.startsWith(CUSTOM_SENSATION_PREFIX)) {
    return { id, label: id.slice(CUSTOM_SENSATION_PREFIX.length), emoji: CUSTOM_SENSATION_ICON };
  }
  return DATA.sensations.find(s => s.id === id) || null;
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
  initFeedback();
  Storage.subscribe(() => {
    if (Api.clubBlocked || !Api.isAuthed()) return;
    renderDiarySyncStatus();
    if (currentScreen === 'saved') renderSavedScreen();
    if (currentScreen === 'history') renderHistory();
    if (currentScreen === 'home') { renderDiaryTab(); renderMainTab(); }
    if (currentScreen === 'checkin') renderCheckinSyncStatus();
    if (currentScreen === 'checkin-history') renderCheckinHistory();
    if (activeTab === 'diag') renderMyPathTab();
  });
  window.addEventListener('online', () => { Storage.flushPending(); Storage.flushCheckinsPending(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { Storage.flushPending(); Storage.flushCheckinsPending(); }
  });

  function startApp() {
    renderMainTab();
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

  // Не задерживаем вход длинной искусственной заставкой.
  const minSplash = new Promise(resolve => setTimeout(resolve, 250));

  let accessDenied = false;
  let accessDeniedCode = null;
  let startupFailed = false;

  const authFlow = Api.auth()
    .then(async user => {
      homeUser = { id: String(user.id), name: user.name || '' };
      try {
        const [access, me] = await Promise.allSettled([
          Api.getAccess(),
          Api.getMe(),
          Storage.initFromApi() // данные, профиль и права загружаются одновременно
        ]);
        for (const result of [access, me]) {
          if (result.status === 'rejected' && result.reason?.code?.startsWith('CLUB_ACCESS_')) throw result.reason;
        }
        if (access.status === 'fulfilled') {
          applyProgramAccess(access.value);
        }
        if (me.status === 'fulfilled' && String(me.value?.id) === String(Api.userId)) homeUser = { id: String(Api.userId), name: me.value.name || user.name || '' };
        if (!Api.isClubAdmin && me.status === 'fulfilled' && me.value?.enrollment?.stream?.id) {
          checkAndShowQuestionnaire(me.value.enrollment.stream.id);
        }
      } catch (err) {
        if (err?.code?.startsWith('CLUB_ACCESS_')) throw err;
        /* нет связи — работаем локально */
      }
    })
    .catch(err => {
      if (err?.status === 403) {
        accessDenied = true;
        accessDeniedCode = err.code;
      }
      else {
        startupFailed = true;
        AppBoot.fail(err?.status === 401
          ? 'Telegram не подтвердил вход. Закройте окно и откройте приложение кнопкой в боте.'
          : 'Не удалось соединиться с приложением. Повторите загрузку.');
      }
    });

  // Переходим с экрана сплэша только после обоих условий
  Promise.all([minSplash, authFlow]).then(() => {
    if (startupFailed) return;
    if (accessDenied) {
      // The first 403 already offered the separate data-rights route. A user
      // may open it before the minimum splash timer finishes; do not replace it.
      if (currentScreen !== 'data-rights') showAccessDenied(accessDeniedCode);
    } else {
      startApp();
    }
  }).catch(() => AppBoot.fail('Не удалось открыть главный экран. Повторите загрузку.'));
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
  // Reuse existing tool handlers; do not introduce parallel save/draft flows.
  document.getElementById('main-body-btn')?.addEventListener('click', () => {
    if (!Api.clubBlocked && Api.isAuthed()) startDiaryEntry();
  });
  for (const [source, target] of [['main-reaction-btn', 'stop-reaction-btn'], ['main-state-btn', 'checkin-btn']]) {
    document.getElementById(source)?.addEventListener('click', () => {
      if (!Api.clubBlocked && Api.isAuthed()) document.getElementById(target)?.click();
    });
  }
}

function switchTab(tab) {
  if (Api.clubBlocked) return;
  if (!['main', 'diary', 'diag', 'profile'].includes(tab)) return;
  activeTab = tab;
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('tab-pane--active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('nav-btn--active'));
  document.getElementById('tab-' + tab)?.classList.add('tab-pane--active');
  document.querySelector(`.nav-btn[data-tab="${tab}"]`)?.classList.add('nav-btn--active');
  document.querySelectorAll('.nav-btn').forEach(button => {
    if (button.dataset.tab === tab) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });

  // Обновляем содержимое при переключении
  if (tab === 'main')    renderMainTab();
  if (tab === 'diary')   renderDiaryTab();
  if (tab === 'diag')    renderMyPathTab();
  if (tab === 'profile') {renderProfileTab();refreshProgramAccess().then(renderProfileTab);}
  updateBackBtn();
}

// Home is a read-only presentation of existing account, access and storage data.
function renderMainTab() {
  const greeting = document.getElementById('home-greeting');
  const flow = document.getElementById('home-stream');
  const observations = document.getElementById('home-observations');
  if (!greeting || !flow || !observations) return;
  const verified = !Api.clubBlocked && Api.isAuthed() && homeUser?.id === String(Api.userId);
  const personalName = verified ? homeUser.name.trim() : '';
  greeting.textContent = personalName || 'Здравствуйте';
  const welcome = document.getElementById('home-welcome');
  const avatar = document.getElementById('home-avatar');
  welcome.hidden = !personalName;
  avatar.hidden = !personalName;
  avatar.textContent = personalName ? Array.from(personalName)[0].toLocaleUpperCase('ru-RU') : '';
  flow.replaceChildren(); flow.removeAttribute('data-state'); observations.replaceChildren();
  if (!verified) return;
  const link = (label, action) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'home-link'; button.textContent = label;
    button.onclick = () => { if (!Api.clubBlocked && Api.isAuthed() && homeUser?.id === String(Api.userId)) action(button); };
    return button;
  };
  const paragraph = (parent, text, className = '') => {
    const p = document.createElement('p'); p.className = className; p.textContent = text; parent.append(p); return p;
  };
  const card = document.createElement('div'); card.className = 'home-stream-card'; flow.append(card);
  const stream = currentProgram();
  if (Api.isClubAdmin) paragraph(card, 'Служебный режим · ведущая', 'home-role');
  if (!programAccess) {
    flow.dataset.state = 'error';
    paragraph(card, 'Не удалось загрузить ваш поток. Проверьте соединение и повторите загрузку.', 'home-error');
    card.append(link('Повторить загрузку потока', async button => { button.disabled = true; await refreshProgramAccess(); }));
  } else if (!stream) {
    flow.dataset.state = 'none';
    const title = document.createElement('div'); title.className = 'home-stream-name'; title.textContent = 'Без активного потока'; card.append(title);
    paragraph(card, Api.isClubAdmin ? 'Доступные для ведения потоки сейчас не найдены.' : 'Вы можете вести личные наблюдения. Информация о доступных вам потоках появится здесь.');
    card.append(link('Открыть профиль', () => switchTab('profile')));
  } else {
    const phase = stream.phase || streamState(stream);
    const between = phase === 'completed' && !stream.canReadRecordings;
    flow.dataset.state = between ? 'between' : phase;
    const top = document.createElement('div'); top.className = 'home-stream-top'; card.append(top);
    const title = document.createElement('div'); title.className = 'home-stream-name'; title.textContent = stream.name; top.append(title);
    const status = document.createElement('span'); status.className = 'home-status';
    status.textContent = phase === 'upcoming' ? 'Скоро' : phase === 'current' ? 'Идёт поток' : between ? 'Между потоками' : 'Завершён'; top.append(status);
    const period = streamPeriod(stream);
    if (period) {
      const date = value => new Date(value + 'T12:00:00+03:00').toLocaleDateString('ru-RU', {timeZone: 'Europe/Moscow', day: 'numeric', month: 'long'});
      paragraph(card, date(period.first) + ' — ' + date(period.last));
    }
    const next = (stream.meetings || []).filter(m => Number.isFinite(Date.parse(m.date)) && Date.parse(m.date) >= programNow()).sort((a,b) => Date.parse(a.date) - Date.parse(b.date))[0];
    if (next && ['upcoming','current'].includes(phase)) {
      const meeting = document.createElement('div'); meeting.className = 'home-meeting'; card.append(meeting);
      const label = document.createElement('span'); label.className = 'home-meeting-label'; label.textContent = 'Ближайшая встреча'; label.hidden = !next.topic; meeting.append(label);
      const topic = document.createElement('strong'); topic.textContent = next.topic || 'Ближайшая встреча'; meeting.append(topic);
      const meetingDate = paragraph(meeting, '');
      const stamp = document.createElement('time'); stamp.dateTime = next.date;
      stamp.setAttribute('aria-label', accessDate(next.date) + ' · МСК');
      const day = document.createElement('span'); day.className = 'home-meeting-day';
      day.textContent = new Date(next.date).toLocaleDateString('ru-RU', {timeZone:'Europe/Moscow',day:'numeric',month:'long'});
      const clock = document.createElement('span'); clock.className = 'home-meeting-clock';
      clock.textContent = new Date(next.date).toLocaleTimeString('ru-RU', {timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit'}) + ' · МСК';
      stamp.append(day, clock); meetingDate.append(stamp);
      if (!stream.canAttend) paragraph(meeting, 'Вход на встречу сейчас недоступен.');
    } else paragraph(card, phase === 'completed' ? (stream.canReadRecordings ? 'Поток завершён. Доступные материалы и сроки — в профиле.' : 'Доступ к материалам потока завершён. Ваши личные записи остаются в дневнике.') : 'Предстоящих встреч в расписании сейчас нет.');
    card.append(link(phase === 'completed' ? 'Посмотреть свой поток' : 'Расписание и доступ', () => switchTab('profile')));
  }
  const history = Storage.getHistoryLoadStatus();
  const failed = ['diary','checkins'].filter(key => history[key] === 'failed');
  if (failed.length) {
    paragraph(observations, 'Не удалось загрузить ' + (failed.length === 2 ? 'историю тела и состояния' : failed[0] === 'diary' ? 'историю тела' : 'историю состояния') + '. Сохранённые на этом устройстве записи могут быть неполными.', 'home-error');
    observations.append(link('Повторить загрузку наблюдений', async button => {
      const owner = Api.userId; button.disabled = true;
      await Storage.initFromApi(); if (String(Api.userId) === String(owner)) renderMainTab();
    }));
  }
  // These two histories expose reliable load states. Reaction history has no
  // load-state contract; do not turn an unverified empty response into a claim.
  const rows = [...Storage.getDiaryEntries().map(row => ({...row, kind: 'diary'})), ...Storage.getCheckins().map(row => ({...row, kind: 'checkins'}))]
    .filter(row => Number.isFinite(Date.parse(row.date || row.createdAt)))
    .sort((a,b) => Date.parse(b.date || b.createdAt) - Date.parse(a.date || a.createdAt)).slice(0,2);
  for (const row of rows) {
    const item = document.createElement('div'); item.className = 'home-observation'; observations.append(item);
    const stamp = row.date || row.createdAt, time = document.createElement('time'); time.dateTime = stamp;
    time.textContent = accessDate(stamp) + ' · МСК'; item.append(time);
    const title = document.createElement('strong'); title.textContent = row.kind === 'diary' ? 'Наблюдение за телом' : 'Отметка состояния'; item.append(title);
    if (row.note) paragraph(item, String(row.note).slice(0,160) + (String(row.note).length > 160 ? '…' : ''));
    if (row.syncStatus && row.syncStatus !== 'synced') paragraph(item, 'Запись на этом устройстве · ещё не подтверждена сервером');
    item.append(link('Открыть историю', () => {
      if (row.kind === 'diary') document.getElementById('diary-history-btn').click();
      else { renderCheckinHistory(); goTo('checkin-history'); }
    }));
  }
  if (!rows.length && !failed.length) paragraph(observations, history.diary === 'loaded' && history.checkins === 'loaded' ? 'Пока нет записей о теле и состоянии. Начните с наблюдения за телом или отметки состояния — эти записи появятся здесь.' : 'История наблюдений ещё загружается.', 'home-empty');
  const main = document.getElementById('tab-main');
  const scroll = main.querySelector('.home-scroll');
  const actions = main.querySelector('.home-actions');
  const streamSection = main.querySelector('.home-stream-section');
  const continuation = main.querySelector('.home-continuation');
  main.dataset.homeState = flow.dataset.state;
  const returningToStream = ['current','upcoming'].includes(flow.dataset.state);
  for (const section of returningToStream ? [streamSection, continuation, actions] : [actions, streamSection, continuation]) scroll.append(section);
}

// ─────────────────────────────────────────────────────────────────────────
// ВКЛАДКА: ДНЕВНИК
// ─────────────────────────────────────────────────────────────────────────
function renderDiaryTab() {
  renderDiarySyncStatus();
  renderAccessNotice();
  renderStreak();
  renderTodayCard();
  renderRecentEntries();
  renderHistoryLoadWarning(document.querySelector('#tab-diary .screen-scroll'), ['diary'], 'diary');
}

function renderHistoryLoadWarning(container, fields, scope) {
  if (!container) return;
  const id = 'history-load-warning-' + scope;
  document.getElementById(id)?.remove();
  const status = Storage.getHistoryLoadStatus?.() || {};
  if (!fields.some(field => status[field] === 'failed')) return;
  const panel = document.createElement('div'); panel.id = id; panel.className = 'access-program'; panel.setAttribute('role', 'status');
  const text = document.createElement('p');
  text.textContent = 'Не удалось обновить историю с сервера. Здесь показаны доступные записи с устройства; пустой список ещё не означает, что записей нет.';
  panel.append(text);
  const retry = document.createElement('button'); retry.className = 'btn btn--outline btn--full'; retry.textContent = 'Повторить загрузку истории';
  retry.onclick = async () => {
    const owner = Storage.key('history_owner'), generation = Storage._generation;
    retry.disabled = true;
    try { await Storage.initFromApi(); } catch {} finally {
      if (!Api.clubBlocked && Api.isAuthed() && Storage.key('history_owner') === owner && Storage._generation === generation) {
        renderDiaryTab(); renderMyPathTab();
        if (currentScreen === 'checkin-history') renderCheckinHistory();
        if (currentScreen === 'history') renderHistory();
      }
    }
  };
  panel.append(retry); container.prepend(panel);
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
        <div class="today-empty-title">Что говорит твоё тело сегодня?</div>
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
        .map(id => getSensation(id))
        .filter(Boolean)
        .map(s => `<span class="entry-sens-chip">${s.emoji} ${escapeAccessText(s.label)}</span>`)
        .join('');
      return `<div class="today-entry-row">
        <div class="today-entry-meta">
          <span class="today-entry-zone">${zone?.label || '—'}</span>
          <span class="today-entry-time">${time}</span>
        </div>
        <div class="entry-sens">${sLabels}</div>
        ${e.note ? `<div class="entry-note">${escapeAccessText(e.note)}</div>` : ''}
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
    const loaded = Storage.getHistoryLoadStatus().diary === 'loaded';
    container.innerHTML = loaded
      ? '<div class="diary-history-empty"><h3>Записей пока нет</h3><p>После сохранения наблюдения появятся здесь.</p></div>'
      : '<div class="diary-history-empty"><p>История ещё не загружена. Здесь появятся доступные личные записи.</p></div>';
    return;
  }
  container.innerHTML = entries.map(e => entryCardHTML(e)).join('');
}

function entryCardHTML(entry) {
  const zone = DATA.zones.find(z => z.id === entry.zone);
  const sLabels = (entry.sensations || [])
    .map(id => getSensation(id))
    .filter(Boolean)
    .map(s => `<span class="entry-sens-chip">${s.emoji} ${escapeAccessText(s.label)}</span>`)
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
      ${entry.note ? `<div class="entry-note">${escapeAccessText(entry.note)}</div>` : ''}
    </div>`;
}

function startDiaryEntry() {
  diarySaveStarted = false;
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
    refreshAiScreen();
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

// Presentation coordinates for the owner's two plates (100 × 150).
// Persisted zone IDs, labels and the observation model remain in DATA.
const BODY_PLATES = {front:'/media/app/redesign/body-front-owner.png',back:'/media/app/redesign/body-back-owner.png'};
const BODY_PLATE_REGIONS = {
  head:[36,0,26,22],eyes:[49,8,10,3],jaw:[48,16,10,5],throat:[44,21,12,8],
  chest:[33,29,30,12],diaphragm:[38,41,24,10],belly:[39,51,24,13],pelvis:[38,64,24,16],
  shoulder_l:[29,28,10,12],shoulder_r:[60,27,9,14],arm_upper_l:[26,40,9,14],arm_upper_r:[64,41,9,14],
  arm_lower_l:[22,54,10,17],arm_lower_r:[70,54,10,17],hand_l:[16,70,11,14],hand_r:[75,70,11,14],
  thigh_l:[39,80,12,25],thigh_r:[51,80,12,25],leg_l:[42,105,10,29],leg_r:[52,105,10,29],foot_l:[44,136,10,12],foot_r:[52,136,10,12],
  head_back:[38,0,25,21],upper_back:[32,27,33,23],shoulder_blade_l:[33,32,13,17],shoulder_blade_r:[52,32,13,17],
  lower_back:[38,50,25,14],pelvis_back:[38,64,25,10],buttocks:[38,74,25,15],
  back_thigh_l:[40,89,12,24],back_thigh_r:[52,89,12,24],calf_l:[43,113,10,21],calf_r:[53,113,10,21],foot_back_l:[44,135,10,12],foot_back_r:[52,135,10,12]
};
function bodyPlatePath(id) {
  const [x,y,w,h]=BODY_PLATE_REGIONS[id];const r=Math.min(w,h)*.28;
  return `M${x+r},${y} H${x+w-r} Q${x+w},${y} ${x+w},${y+r} V${y+h-r} Q${x+w},${y+h} ${x+w-r},${y+h} H${x+r} Q${x},${y+h} ${x},${y+h-r} V${y+r} Q${x},${y} ${x+r},${y} Z`;
}
function renderBodyMap() {
  const svgEl = document.getElementById('body-figure-svg');
  if (!svgEl) return;

  const zones = DATA.zones.filter(z => z.view === bodyMapView && z.selectable !== false);

  const imgSrc = BODY_PLATES[bodyMapView];
  const imgBg = `<image href="${imgSrc}" x="0" y="0" width="100" height="150" preserveAspectRatio="xMidYMid meet"/>`;

  const paths = zones.map(z => {
    return `<path class="zone-path" data-zone="${z.id}" d="${bodyPlatePath(z.id)}" role="button" tabindex="0" aria-label="${escapeAccessText(z.label)}" aria-pressed="false"/>`;
  }).join('');

  svgEl.innerHTML = `
    ${imgBg}
    <g>${paths}</g>`;
  const status=document.getElementById('body-media-status');if(status)status.hidden=true;
  svgEl.querySelector('image').addEventListener('error',()=>{if(status)status.hidden=false;});
  svgEl.onkeydown=event=>{const zone=event.target.closest('[data-zone]');if(zone&&['Enter',' '].includes(event.key)){event.preventDefault();selectZone(zone.dataset.zone);haptic('light');}};
  document.getElementById('body-zone-list').innerHTML=zones.map(z=>`<button class="zone-btn" data-zone="${z.id}" aria-pressed="false">${escapeAccessText(z.label)}</button>`).join('');

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

  document.querySelectorAll('#body-figure-svg .zone-path').forEach(p => {p.classList.remove('zone-path--active');p.setAttribute('aria-pressed','false');});
  document.querySelector(`.zone-path[data-zone="${zoneId}"]`)?.classList.add('zone-path--active');
  document.querySelector(`#body-figure-svg .zone-path[data-zone="${zoneId}"]`)?.setAttribute('aria-pressed','true');
  document.querySelectorAll('#body-zone-list .zone-btn').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.zone===zoneId)));

  const card = document.getElementById('zone-info-card');
  if (card) {
    card.classList.remove('hidden');
    document.getElementById('zone-info-name').textContent = zone.label;
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

  const builtIn = DATA.sensations.map(s => ({ id: s.id, label: s.label, emoji: s.emoji }));
  const custom  = getCustomSensations().map(label => ({
    id: CUSTOM_SENSATION_PREFIX + label,
    label,
    emoji: CUSTOM_SENSATION_ICON
  }));
  const all = [...builtIn, ...custom];

  grid.innerHTML = all.map(s => `
    <button class="sensation-btn" data-sensation="${escapeAccessText(s.id)}">
      <span class="sensation-emoji">${s.emoji}</span>
      <span class="sensation-label">${escapeAccessText(s.label)}</span>
    </button>
  `).join('') + `
    <div class="sensation-custom-row">
      <input id="sensation-custom-input" type="text" class="sensation-custom-input" placeholder="Своё ощущение" maxlength="24">
      <button id="sensation-custom-add" class="sensation-custom-add" type="button" aria-label="Добавить своё ощущение">+</button>
    </div>
  `;

  function attachToggle(btn) {
    btn.addEventListener('click', () => {
      const id = btn.dataset.sensation;
      haptic('light');
      if (draft.sensations.includes(id)) {
        draft.sensations = draft.sensations.filter(s => s !== id);
        btn.classList.remove('sensation-btn--active');
      } else {
        draft.sensations.push(id);
        btn.classList.add('sensation-btn--active');
      }
      const continueBtn = document.getElementById('sensations-continue-btn');
      if (continueBtn) continueBtn.disabled = draft.sensations.length === 0;
    });
  }
  grid.querySelectorAll('.sensation-btn').forEach(attachToggle);

  const input = document.getElementById('sensation-custom-input');
  const addBtn = document.getElementById('sensation-custom-add');
  function addCustom() {
    const raw = (input?.value || '').trim().toLowerCase();
    if (!raw) return;
    const label = raw.length > 24 ? raw.slice(0, 24) : raw;
    const id = CUSTOM_SENSATION_PREFIX + label;
    // если уже на экране — просто выделяем
    const existing = grid.querySelector(`.sensation-btn[data-sensation="${CSS.escape(id)}"]`);
    if (existing) {
      if (!draft.sensations.includes(id)) {
        draft.sensations.push(id);
        existing.classList.add('sensation-btn--active');
      }
    } else {
      addCustomSensation(label);
      const btn = document.createElement('button');
      btn.className = 'sensation-btn sensation-btn--active';
      btn.dataset.sensation = id;
      btn.innerHTML = `<span class="sensation-emoji">${CUSTOM_SENSATION_ICON}</span><span class="sensation-label">${label}</span>`;
      grid.insertBefore(btn, grid.querySelector('.sensation-custom-row'));
      attachToggle(btn);
      draft.sensations.push(id);
    }
    input.value = '';
    haptic('light');
    const continueBtn = document.getElementById('sensations-continue-btn');
    if (continueBtn) continueBtn.disabled = draft.sensations.length === 0;
  }
  addBtn?.addEventListener('click', addCustom);
  input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } });
}

// ─────────────────────────────────────────────────────────────────────────
// ЭКРАН: ЗАМЕТКА
// ─────────────────────────────────────────────────────────────────────────
function initNote() {
  document.getElementById('note-save-btn')?.addEventListener('click', () => {
    draft.note = document.getElementById('note-textarea')?.value?.trim() || '';
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
  if (diarySaveStarted || Api.clubBlocked || !Api.isAuthed()) return;
  const entry = {
    date:       new Date().toISOString(),
    zone:       draft.zone,
    sensations: [...draft.sensations],
    note:       draft.note
  };
  try {
    const row = Storage.saveDiaryEntry(entry);
    diarySaveStarted = true;
    savedDiaryClientId = row.clientId;
    renderSavedScreen();
    goTo('saved');
  } catch {
    showToast('Не удалось сохранить запись. Текст остаётся в поле — попробуйте ещё раз.', false);
  }
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
  document.getElementById('saved-retry-btn')?.addEventListener('click', () => Storage.flushPending());
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
  const row = Storage.getDiaryEntries().find(entry => entry.clientId === savedDiaryClientId);
  if (row) {
    const synced = row.syncStatus === 'synced';
    const temporary = row.syncStatus === 'memory-only';
    document.getElementById('saved-title').textContent = synced ? 'Запись сохранена на сервере'
      : temporary ? 'Запись ещё не сохранена' : 'Запись сохранена на устройстве';
    document.getElementById('saved-sub').textContent = synced ? 'Она будет доступна при следующем входе.'
      : temporary ? 'Хранилище устройства недоступно. Не закрывайте окно до подтверждения отправки.'
      : row.syncError ? 'Сервер не подтвердил сохранение. Повторим отправку, когда появится соединение.'
      : 'Отправляем на сервер. До подтверждения запись доступна только на этом устройстве.';
    document.getElementById('saved-icon').textContent = synced ? '✓' : '…';
    document.getElementById('saved-retry-btn').hidden = synced;
  }
  const streak = Storage.getStreak();
  const el = document.getElementById('saved-streak-num');
  if (el) el.textContent = streak;
  const sub = document.getElementById('saved-streak-label');
  if (sub) sub.textContent = pluralDays(streak);
}

function renderDiarySyncStatus() {
  const container = document.getElementById('diary-sync-status');
  if (!container) return;
  const pending = Storage.getDiaryEntries().filter(entry => entry.syncStatus !== 'synced');
  container.hidden = !pending.length;
  container.replaceChildren();
  if (!pending.length) return;
  const message = document.createElement('p');
  message.textContent = pending.some(entry => entry.syncStatus === 'memory-only')
    ? 'Есть запись без подтверждения сохранения. Не закрывайте окно: хранилище устройства недоступно.'
    : 'Есть записи на устройстве, которые ещё не сохранены на сервере.';
  const retry = document.createElement('button');
  retry.className = 'btn btn--outline btn--sm';
  retry.textContent = 'Повторить отправку';
  retry.addEventListener('click', () => Storage.flushPending());
  container.append(message, retry);
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

function renderMyPathTab() {
  const container = document.getElementById('diag-tab-content');
  if (!container) return;

  const entries = Storage.getDiaryEntries().filter(row => inStreamPeriod(row));
  const diagResult = Storage.getDiagResult();

  const analyticsHtml = !streamPeriod() ? '' : renderStreamSummary(entries) + renderCheckinChart() + (entries.length
    ? renderMirrorCard(entries) +
      renderHeatmapSection(entries) +
      renderTopSensations(entries) +
      renderRecentNotes(entries) +
      renderPathStats(entries)
    : `<div class="mypath-empty">
        <div class="mypath-empty-icon">🌱</div>
        <div class="mypath-empty-title">Записей за выбранный поток пока нет</div>
        <div class="mypath-empty-sub">Полная личная история остаётся во вкладке «Дневник».</div>
      </div>`);

  container.innerHTML = programPickerHTML() + streamStatusHTML() +
    '<section class="path-analysis" aria-label="Личные наблюдения">' + analyticsHtml + '</section>' +
    '<section class="path-questionnaire" aria-label="Опрос привычных реакций">' + renderDiagBlock(diagResult) + '</section>';
  renderHistoryLoadWarning(container, ['diary', 'checkins'], 'path');
  container.querySelector('#path-stream-select')?.addEventListener('change', event => selectProgram(event.target.value));

  container.querySelectorAll('.hmap-week-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      heatmapWeek = Number(btn.dataset.week);
      renderMyPathTab();
    });
  });
}

// ─── Блок диагностики паттерна ────────────────────────────────────────────

function habitualOwnerCurrent() {
  return diag.owner === Storage._userId && diag.generation === Storage._generation;
}
function habitualLegacyHTML() {
  const old = Storage.getDiagResult();
  if (!old) return '';
  const p = DATA.patterns[old.patternId];
  return `<details class="diag-legacy"><summary>Прежний результат опроса</summary><p>${escapeAccessText(p?.name || 'Сохранённый результат')}. Получен по предыдущим вопросам. Новая версия его не пересчитывает.</p></details>`;
}
function habitualDurable() {
  try { return window.localStorage.getItem(Storage.key('habitual_result_v2')) === JSON.stringify(Storage.getHabitualResult()); } catch { return false; }
}
function renderDiagBlock() {
  habitualView = 'summary'; updateBackBtn();
  const result = Storage.getHabitualResult(), draft = Storage.getHabitualDraft();
  if (!result) return `<div class="diag-invite"><div class="diag-invite-title">Ведущая привычная реакция</div>
    <p>Иногда ответ или действие появляются раньше, чем мы успеваем выбрать их. Опрос поможет заметить, какие реакции вы чаще отмечаете у себя, и найти слова для описания своего опыта.</p>
    <p>16 коротких утверждений. Отвечайте о том, как бывает у вас обычно в разных жизненных обстоятельствах. Если оценить трудно, можно так и ответить. Здесь нет правильных ответов.</p>
    <button class="btn btn--primary btn--full" onclick="startDiag()">${draft ? 'Продолжить опрос' : 'Начать опрос'}</button></div>${habitualLegacyHTML()}`;
  const m = Habitual.message(result);
  const examples = Habitual.items.filter((q, i) => q.group === result.leadingGroup && result.answers[i] >= 3 && result.answers[i] <= 4).slice(0, 2);
  return `<div class="diag-result-card"><div class="diag-result-name">${escapeAccessText(m.title)}</div><p>${escapeAccessText(m.text)}</p>
    ${result.tiedGroups.length ? `<p>${result.tiedGroups.map(g => escapeAccessText(Habitual.descriptions[g].name)).join(' · ')}</p>` : ''}
    ${examples.length ? `<div class="diag-result-section-title">Вы отмечали</div><ul>${examples.map(q => `<li>${escapeAccessText(q.text)}</li>`).join('')}</ul>` : result.leadingGroup ? '<p>Среди предложенных реакций эту вы отмечали чаще других, хотя не обязательно часто.</p>' : ''}
    ${m.observe ? `<p>${escapeAccessText(m.observe)}</p>` : ''}
    <p class="habitual-note">Опрос помогает наблюдать за привычными реакциями. Он не устанавливает диагноз и не объясняет причины телесных симптомов.</p>
    <p role="status">${result.syncStatus === 'synced' ? 'Ответы сохранены в вашем аккаунте.' : habitualDurable() ? 'Ответы сохранены на устройстве. Сервер ещё не подтвердил сохранение.' : 'Сервер ещё не подтвердил сохранение. Ответы доступны в этом открытом приложении; после закрытия они могут потеряться.'}</p>
    ${result.syncStatus !== 'synced' ? '<button class="diag-result-retry" onclick="retryHabitualSave(this)">Повторить сохранение</button>' : ''}
    <button class="diag-result-retry" onclick="showHabitualAnswers()">Посмотреть свои ответы</button>
    ${result.state === 'incomplete' ? '<button class="diag-result-retry" onclick="startDiag(true)">Вернуться к вопросам</button>' : ''}
    ${draft ? '<button class="diag-result-retry" onclick="startDiag()">Продолжить начатый опрос</button>' : ''}
    <button class="diag-result-retry" onclick="startDiag(false, true)">Пройти заново</button></div>${habitualLegacyHTML()}`;
}
function startDiag(fromResult = false, fresh = false) {
  const draft = fresh ? null : Storage.getHabitualDraft();
  const result = fromResult ? Storage.getHabitualResult() : null;
  diag.answers = (result?.answers || draft?.answers || Array(16).fill(null)).slice();
  diag.current = fromResult ? Math.max(0, diag.answers.findIndex(x => x > 4)) : Math.max(0, diag.answers.findIndex(x => x === null));
  diag.owner = Storage._userId; diag.generation = Storage._generation;
  Storage.saveHabitualDraft(diag.answers); showDiagQuestion();
}
function showDiagQuestion() {
  const container = document.getElementById('diag-tab-content');
  if (!container || !habitualOwnerCurrent()) return;
  habitualView = 'quiz'; updateBackBtn();
  const q = Habitual.items[diag.current], selected = diag.answers[diag.current];
  container.innerHTML = `<div class="diag-quiz"><div class="diag-quiz-header"><div class="diag-quiz-counter">Утверждение ${diag.current + 1} из 16</div>
    <div class="diag-quiz-bar"><div class="diag-quiz-fill" style="width:${diag.current / 16 * 100}%"></div></div></div>
    <p>Как часто вы замечаете это у себя?</p><div class="diag-quiz-q">${escapeAccessText(q.text)}</div>
    <div class="diag-quiz-options">${Habitual.choices.map((text, i) => `<button class="diag-quiz-option ${selected === i ? 'habitual-selected' : ''}" aria-pressed="${selected === i}" onclick="pickDiagAnswer(${i},${diag.current})">${escapeAccessText(text)}</button>`).join('')}</div>
    <div class="habitual-controls">${diag.current ? '<button class="diag-result-retry" onclick="habitualPrevious()">Предыдущее утверждение</button>' : ''}
    <button class="btn btn--primary" onclick="habitualNext(${diag.current})" ${selected === null ? 'disabled' : ''}>${diag.current === 15 ? 'Посмотреть результат' : 'Далее'}</button>
    <button class="diag-result-retry" onclick="renderMyPathTab()">Продолжить позже</button></div></div>`;
}
function pickDiagAnswer(value, index) {
  if (!habitualOwnerCurrent() || index !== diag.current || !Number.isInteger(value) || value < 0 || value > 6) return;
  diag.answers[index] = value; Storage.saveHabitualDraft(diag.answers); showDiagQuestion();
}
function habitualPrevious() { if (habitualOwnerCurrent() && diag.current > 0) { diag.current--; showDiagQuestion(); } }
async function habitualNext(index) {
  if (!habitualOwnerCurrent() || index !== diag.current || diag.answers[index] === null) return;
  if (diag.current < 15) { diag.current++; showDiagQuestion(); return; }
  const missing = diag.answers.findIndex(x => x === null);
  if (missing >= 0) { diag.current = missing; showDiagQuestion(); return; }
  const owner = diag.owner, generation = diag.generation;
  const pending = Storage.saveHabitualResult(diag.answers.slice());
  renderMyPathTab();
  await pending;
  if (owner === Storage._userId && generation === Storage._generation && activeTab === 'diag' && !Storage.getHabitualDraft()) renderMyPathTab();
}
async function retryHabitualSave(button) {
  button.disabled = true;
  const owner = Storage._userId, generation = Storage._generation;
  await Storage.flushHabitualResult();
  if (owner === Storage._userId && generation === Storage._generation && activeTab === 'diag') renderMyPathTab();
}
function showHabitualAnswers() {
  const r = Storage.getHabitualResult(); if (!r) return;
  habitualView = 'answers'; updateBackBtn();
  document.getElementById('diag-tab-content').innerHTML = `<div class="diag-result-card"><div class="diag-result-name">Ваши ответы</div><ol class="habitual-answers">${Habitual.items.map((q, i) => `<li><p>${escapeAccessText(q.text)}</p><strong>${escapeAccessText(Habitual.choices[r.answers[i]])}</strong></li>`).join('')}</ol><button class="btn btn--primary" onclick="renderMyPathTab()">К результату</button></div>`;
}

// ─── Зеркало ──────────────────────────────────────────────────────────────
function renderMirrorCard(entries) {
  const period = streamPeriod();
  const anchor = Math.min(programNow(), period?.end || programNow());
  const week7ago = anchor - 7 * 86400000;
  const recent = entries.filter(e => Date.parse(e.date) >= week7ago && Date.parse(e.date) < anchor);

  if (!recent.length) {
    return `<div class="mirror-card mirror-card--empty">
      <div class="mirror-label">Зеркало недели</div>
      <div class="mirror-text">За последние 7 дней выбранного периода записей нет</div>
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
  const topSens   = getSensation(topSensId);

  const phrase = topSens
    ? `За последние 7 дней выбранного периода чаще отмечено ощущение <em>«${escapeAccessText(topSens.label)}»</em>. Чаще отмеченная область: <em>«${escapeAccessText(topZone?.label || topZoneId)}»</em>.`
    : `За последние 7 дней выбранного периода чаще отмечена область <em>«${escapeAccessText(topZone?.label || topZoneId)}»</em>.`;

  return `<div class="mirror-card">
    <div class="mirror-label">Зеркало недели</div>
    <div class="mirror-text">${phrase}</div>
    <div class="mirror-count">Записей: ${recent.length}</div>
  </div>`;
}

// ─── Тепловая карта — силуэт тела ──────────────────────────────────────────
function renderHeatmapSection(entries) {
  const filtered = heatmapWeek === 0
    ? entries
    : entries.filter(e => getStreamWeek(e.date) === heatmapWeek);

  const weekBtns = Array.from({ length: (streamPeriod()?.weeks || 0) + 1 }, (_, w) => w).map(w => {
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
    return `<path d="${bodyPlatePath(z.id)}" fill="${fill}" stroke="${stroke}" stroke-width="0.6"/>`;
  }).join('');

  const heatSvg = `<svg viewBox="0 0 100 150" xmlns="http://www.w3.org/2000/svg" class="hmap-zones-svg">
    <g>${heatPaths}</g>
  </svg>`;

  const imgCol = `<div class="hmap-img-wrap">
    <img src="${BODY_PLATES.front}" alt="" class="hmap-glow-img" loading="lazy" decoding="async">
    ${heatSvg}
  </div>`;

  // Список всех выбираемых зон с барами, отсортированных по количеству
  const allSelectableZones = DATA.zones.filter(z => z.selectable !== false);
  const rows = allSelectableZones
    .map(z => ({ zone: z, count: counts[z.id] || 0 }))
    .sort((a, b) => b.count - a.count)
    .map(({ zone: z, count: c }) => {
      const barW = Math.round((c / maxCount) * 100);
      return {count: c, html: `<div class="hmap-row">
        <div class="hmap-zone-name">${z.label}</div>
        <div class="hmap-bar-wrap"><div class="hmap-bar" style="width:${barW}%"></div></div>
        <div class="hmap-count ${c > 0 ? 'hmap-count--active' : ''}">${c || '—'}</div>
      </div>`};
    });
  const labels = rows.filter(row => row.count > 0).map(row => row.html).join('') || '<p class="hmap-empty">В этом периоде области пока не отмечены.</p>';

  return `<div class="hmap-wrap">
      <div class="hmap-svg-col">${imgCol}</div>
      <div class="hmap-labels-col">${labels}</div>
      <details class="hmap-all-zones"><summary>Все области</summary><div class="hmap-full-list">${rows.map(row => row.html).join('')}</div></details>
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
      const s = getSensation(id);
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
        <div class="tops-label">${escapeAccessText(s.label)}</div>
        <div class="tops-bar-wrap">
          <div class="tops-bar" style="width:${pct}%"></div>
        </div>
      </div>
      <div class="tops-count">${s.count}</div>
    </div>`;
  }).join('');

  return `<div class="section-label mt-16 mb-8">Чаще отмеченные ощущения</div>
    <div class="tops-list">${items}</div>`;
}

// ─── Статистика пути ───────────────────────────────────────────────────────
function renderPathStats(entries) {
  const uniqueDays    = new Set(entries.map(e => moscowDay(e.date))).size;
  const { count: attendedCount, total: totalMeetings } = selectedAttendance();

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
        <div class="path-stat-num">${periodStreak(entries)}</div>
        <div class="path-stat-label">самая длинная серия</div>
      </div>
    </div>`;
}

// ─── 1. График чекинов по неделям потока ─────────────────────────────────
function scaleValue(row, key) {
  const value = row[key];
  return !row.legacyScale && Number.isInteger(value) && value >= 1 && value <= 10 ? value : null;
}
function renderCheckinChart() {
  const period = streamPeriod();
  const checkins = selectedCheckins();
  if (!period || !checkins.length) return '';
  const colors = ['#a75c52', '#ae7d3b', '#637f49', '#467882', '#7e648f'];
  const W = 280, H = 130, left = 22, right = 8, top = 8, bottom = 22;
  const xp = week => left + ((week - 1) / Math.max(1, period.weeks - 1)) * (W - left - right);
  const yp = value => top + (10 - value) / 9 * (H - top - bottom);
  const weeks = Array.from({ length: period.weeks }, (_, i) => i + 1);
  const series = CHECKIN_SCALES.map((scale, index) => {
    const points = weeks.map(week => {
      const values = checkins.filter(row => getStreamWeek(row.date) === week).map(row => scaleValue(row, scale.key)).filter(value => value !== null);
      return values.length ? { week, value: avgOf(values) } : null;
    });
    const available = points.filter(Boolean);
    if (!available.length) return '';
    // Missing weeks break a line; missing observations never become a value 5.
    let previous = null;
    const segments = points.map(point => {
      if (!point) { previous = null; return ''; }
      const segment = previous ? `<line x1="${xp(previous.week)}" y1="${yp(previous.value)}" x2="${xp(point.week)}" y2="${yp(point.value)}" stroke="${colors[index]}" stroke-width="2"/>` : '';
      previous = point;
      return segment + `<circle cx="${xp(point.week)}" cy="${yp(point.value)}" r="3" fill="${colors[index]}"/>`;
    }).join('');
    return `<g data-scale="${scale.key}">${segments}</g>`;
  }).join('');
  if (!series) return '<p class="access-notice">В этом периоде сохранены только прежние средние оценки. Отдельные шкалы по ним восстановить нельзя.</p>';
  const grid = [1, 5, 10].map(value => `<line x1="${left}" y1="${yp(value)}" x2="${W - right}" y2="${yp(value)}" stroke="rgba(0,0,0,.06)"/><text x="${left - 4}" y="${yp(value) + 3}" text-anchor="end" font-size="9">${value}</text>`).join('');
  const labels = weeks.map(week => `<text x="${xp(week)}" y="${H - 5}" text-anchor="middle" font-size="9">Н${week}</text>`).join('');
  return `<div class="section-label mt-16 mb-8">Пять шкал по неделям потока</div><div class="checkin-chart-wrap"><svg viewBox="0 0 ${W} ${H}" class="checkin-chart-svg" role="img" aria-label="Недельные средние по каждой из пяти шкал">${grid}${labels}${series}</svg><div class="checkin-chart-legend">${CHECKIN_SCALES.map((scale, i) => `<span class="cchart-leg"><span class="cchart-dot" style="background:${colors[i]}"></span>${scale.label}</span>`).join('')}</div><p class="access-notice">Каждая линия — отдельная шкала. Пропуски не заполняются оценками.</p></div>`;
}

// ─── 3. Итоговое резюме выбранного завершённого потока ─────────────────────────────
function renderStreamSummary(entries) {
  if (streamState() !== 'completed') return '';

  const uniqueDays    = new Set(entries.map(e => moscowDay(e.date))).size;
  const { count: attendedCount, total: totalMeetings } = selectedAttendance();

  const zoneCounts = {};
  entries.forEach(e => { zoneCounts[e.zone] = (zoneCounts[e.zone] || 0) + 1; });
  const topZoneId = Object.entries(zoneCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const topZone   = DATA.zones.find(z => z.id === topZoneId);

  const sensCounts = {};
  entries.forEach(e => (e.sensations || []).forEach(s => { sensCounts[s] = (sensCounts[s] || 0) + 1; }));
  const topSensId = Object.keys(sensCounts).sort((a, b) => sensCounts[b] - sensCounts[a])[0];
  const topSens   = getSensation(topSensId);

  return `<div class="stream-summary">
    <div class="stream-summary-title">Поток завершён</div>
    <div class="stream-summary-sub">Ваши наблюдения за выбранный поток</div>
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
        <div class="stream-summary-num">${periodStreak(entries)}</div>
        <div class="stream-summary-label">дней<br>в самой длинной серии</div>
      </div>
    </div>
    ${topZone ? `<div class="stream-summary-insight">Главная зона потока — <em>${escapeAccessText(topZone.label)}</em>${topSens ? `, ощущение — <em>${escapeAccessText(topSens.label.toLowerCase())}</em>` : ''}</div>` : ''}
  </div>`;
}

// ─── 4. Последние заметки в «Мой путь» ───────────────────────────────────
function renderRecentNotes(entries) {
  const withNotes = entries.filter(e => e.note && e.note.trim());
  if (withNotes.length < 2) return '';

  const recent = withNotes.slice(0, 3);
  const fmt = d => new Date(d).toLocaleDateString('ru', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'short' });

  const items = recent.map(e => `
    <div class="rnote-item">
      <div class="rnote-date">${fmt(e.date)}</div>
      <div class="rnote-text">${escapeAccessText(e.note)}</div>
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
function startDiagnostic() { goTo('home', true); switchTab('diag'); startDiag(); }

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
  let savingConsent = false;

  cb?.addEventListener('change', () => {
    if (btn) btn.disabled = savingConsent || !cb.checked;
  });

  btn?.addEventListener('click', async () => {
    if (!cb?.checked || savingConsent) return;
    savingConsent = true;
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Сохраняем…';
    try {
      await Api.giveConsent();
      Storage.setOnboardingDone();
      Storage.setOfferSeen();
      Storage.setConsentGiven();
      hapticNotify('success');
      goTo('home');
    } catch (e) {
      showToast('Не удалось сохранить согласие. Проверьте соединение и попробуйте ещё раз.', false);
    } finally {
      savingConsent = false;
      btn.textContent = label;
      btn.disabled = !cb.checked;
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────
// ВКЛАДКА: ПРОФИЛЬ
// ─────────────────────────────────────────────────────────────────────────
function initProfile() {}

function renderProfileTab() {
  renderConsentBanner();
  renderPrivacyEntry();
  renderQuestionnaireBanner();
  renderUserCard();
  renderStats();
  renderNextMeeting();
  renderZoomBtn();
  renderSchedule();
  renderHosts();
  if (Api.isClubAdmin) renderAdmissions();
}

let admissionRefreshTimer = null;
let admissionLoading = false;
async function renderAdmissions() {
  const panel = document.getElementById('admission-admin-panel');
  if (!panel || !Api.isClubAdmin || admissionLoading) return;
  panel.hidden = false;
  admissionLoading = true;
  if (!panel.childElementCount) panel.textContent = 'Загружаем заявки…';
  try {
    const users = await Api.getAdmissions();
    panel.replaceChildren();
    const title = document.createElement('h3');title.className='section-label';
    const pending = users.filter(u=>u.accessStatus==='pending').length;
    title.textContent='Заявки на доступ' + (pending ? ' · '+pending : '');panel.append(title);
    const refresh=document.createElement('button');refresh.className='btn btn--ghost btn--sm';refresh.textContent='Обновить заявки';refresh.onclick=renderAdmissions;panel.append(refresh);
    const nav=document.querySelector('.nav-btn[data-tab="profile"]');
    if(nav){
      let badge=nav.querySelector('.nav-badge');
      if(pending){if(!badge){badge=document.createElement('small');badge.className='nav-badge';badge.setAttribute('aria-hidden','true');nav.append(badge);}badge.textContent=String(pending);nav.setAttribute('aria-label','Профиль · заявок: '+pending);}
      else{badge?.remove();nav.removeAttribute('aria-label');}
    }
    if (!users.length) {const p=document.createElement('p');p.textContent='Новых заявок пока нет.';panel.append(p);}
    users.sort((a,b)=>(a.accessStatus==='pending'?-1:1)-(b.accessStatus==='pending'?-1:1));
    for (const user of users) {
      const card=document.createElement('div');card.className='access-program';
      const name=document.createElement('strong');name.textContent=[user.firstName,user.lastName].filter(Boolean).join(' ')||user.name||'Пользователь';card.append(name);
      const info=document.createElement('p');info.textContent=(user.telegramUsername||user.username?'@'+(user.telegramUsername||user.username)+' · ':'')+'Telegram ID: '+user.telegramId;card.append(info);
      const state=document.createElement('p');state.textContent=({pending:'Ожидает решения',approved:'Вход разрешён',rejected:'Вход закрыт'})[user.accessStatus]||'Вход закрыт';card.append(state);
      for (const [status,label] of [['approved','Разрешить'],['rejected',user.accessStatus==='approved'?'Отозвать доступ':'Отказать']]) {
        if(user.accessStatus===status)continue;
        const button=document.createElement('button');button.className='btn btn--'+(status==='approved'?'primary':'outline')+' btn--full mb-8';button.textContent=label;
        button.onclick=async()=>{
          card.querySelectorAll('button').forEach(b=>b.disabled=true);
          try {await Api.decideAdmission(user.id,status);await renderAdmissions();}
          catch {state.textContent='Не удалось сохранить решение. Повторите.';card.querySelectorAll('button').forEach(b=>b.disabled=false);}
        };
        card.append(button);
      }
      panel.append(card);
    }
    if(!admissionRefreshTimer)admissionRefreshTimer=setInterval(()=>{if(document.visibilityState==='visible')renderAdmissions();},30000);
  } catch {
    panel.replaceChildren();const p=document.createElement('p');p.textContent='Не удалось загрузить заявки.';panel.append(p);
    const retry=document.createElement('button');retry.className='btn btn--outline btn--full';retry.textContent='Повторить загрузку заявок';retry.onclick=renderAdmissions;panel.append(retry);
  } finally {admissionLoading=false;}
}

let programAccess = null;
let programClock = null;
function programNow() { return programClock ? programClock.server + (Date.now() - programClock.received) : Date.now(); }
let selectedProgramId = null;
function escapeAccessText(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function accessDate(value) {
  return new Date(value).toLocaleString('ru-RU', {timeZone:'Europe/Moscow',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
function applyProgramAccess(access) {
  programAccess=access;
  const serverTime = Date.parse(access.serverTime);
  programClock = Number.isFinite(serverTime) ? { server: serverTime, received: Date.now() } : null;
  aiAccessGranted=access.ai?.canWrite === true;
  if(!access.streams?.some(s=>s.id===selectedProgramId)) selectedProgramId=(access.streams?.find(s=>s.canAttend)||access.streams?.find(s=>s.phase==='upcoming')||access.streams?.[0])?.id || null;
  heatmapWeek = 0;
  renderAccessNotice();
  renderMainTab();
  if (activeTab === 'diag') renderMyPathTab();
}
function renderAccessNotice() {
  const text=programAccess?.ai?.message || 'Не удалось проверить доступ к AI. Дневник и реакции остаются доступны.';
  const aiNotice=document.getElementById('ai-access-notice');
  if(aiNotice) aiNotice.textContent=text;
  const button=document.getElementById('ai-chat-btn');
  if(button) {
    let note=document.getElementById('diary-access-notice');
    if(!note){note=document.createElement('p');note.id='diary-access-notice';note.className='access-notice';button.after(note);}
    note.textContent=text;
  }
}
function currentProgram(){return programAccess?.streams?.find(s=>s.id===selectedProgramId);}
async function refreshProgramAccess(){
  try {applyProgramAccess(await Api.getAccess());}
  catch {programAccess=null;aiAccessGranted=null;renderAccessNotice();renderMainTab();}
}
function renderNextMeeting(){
  const el=document.getElementById('next-meeting-card');
  if(!el)return;
  const streams=programAccess?.streams||[];
  el.innerHTML='<div class="access-program"><div class="section-label">Мой поток</div><p>Дневник, реакции и ваша история остаются бесплатными после завершения.</p></div>';
  if(!programAccess){
    const p=document.createElement('p');p.textContent='Расписание не загружено. Проверьте соединение и обновите доступ.';el.append(p);
  }else if(!streams.length){
    const p=document.createElement('p');p.textContent='У вас пока нет оплаченной программы. Бесплатными инструментами уже можно пользоваться.';el.append(p);
  }else{
    const stream=currentProgram();
    if(stream){
      const phase=stream.phase||streamState(stream);
      const feature=document.createElement('section');feature.className='profile-stream-feature';feature.setAttribute('aria-label','Выбранный поток');
      const state=document.createElement('p');state.className='profile-stream-state';
      state.textContent=phase==='upcoming'?'Предстоящий поток':phase==='current'?'Идёт поток':stream.canReadRecordings?'Поток завершён':'Между потоками';feature.append(state);
      const name=document.createElement('h3');name.textContent=stream.name;feature.append(name);
      const next=(stream.meetings||[]).filter(m=>Number.isFinite(Date.parse(m.date))&&Date.parse(m.date)>=programNow()).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date))[0];
      if(next&&['upcoming','current'].includes(phase)){
        const date=document.createElement('time');date.dateTime=next.date;date.textContent=accessDate(next.date)+' · МСК';feature.append(date);
        const topic=document.createElement('p');topic.className='profile-stream-topic';topic.textContent=next.topic||'Ближайшая встреча';feature.append(topic);
      }else{
        const note=document.createElement('p');note.textContent=phase==='completed'?'Сроки доступа и материалы — ниже.':'Предстоящих встреч в расписании сейчас нет.';feature.append(note);
      }
      el.append(feature);
    }
    const label=document.createElement('label');label.textContent='Выберите свой поток';label.htmlFor='owned-stream-select';el.append(label);
    const select=document.createElement('select');select.id='owned-stream-select';select.className='access-select';
    streams.forEach(stream=>{const option=document.createElement('option');option.value=stream.id;option.textContent=stream.name+(streamState(stream)==='completed'?' · архив':'');select.append(option);});
    select.value=selectedProgramId;select.addEventListener('change',()=>selectProgram(select.value));el.append(select);
  }
  const refresh=document.createElement('button');refresh.className='btn btn--ghost btn--sm';refresh.textContent='Обновить доступ и расписание';
  refresh.addEventListener('click',async()=>{refresh.disabled=true;await refreshProgramAccess();renderProfileTab();});el.append(refresh);
}
function appendAccessLink(container,url,label){
  if(!url)return;
  try {if(new URL(url).protocol!=='https:')return;}catch{return;}
  const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.className='btn btn--outline btn--full mb-8';a.textContent=label;container.append(a);
}
function renderZoomBtn(){
  const container=document.getElementById('zoom-btn-wrap');if(!container)return;container.replaceChildren();
  const chat=document.getElementById('chat-btn');if(chat){chat.hidden=true;chat.removeAttribute('data-tg-link');}
  const stream=currentProgram();if(!stream)return;
  if(stream.canAttend)appendAccessLink(container,stream.zoomLink,'Войти в Zoom');
  if(stream.canReadRecordings)appendAccessLink(container,stream.chatLink,stream.phase==='completed'?'Чат и материалы своего потока':'Чат своего потока');
}
function renderSchedule(){
  const container=document.getElementById('schedule-section');if(!container)return;
  const stream=currentProgram();container.replaceChildren();
  if(stream){
    const intro=document.createElement('p');intro.className='access-notice';
    intro.textContent=stream.canReadRecordings?'Записи встреч доступны до '+accessDate(new Date(new Date(stream.recordingsExpiresAt).getTime()-1))+'. После завершения программы поддержка ведущих не продолжается.':'Доступ к записям встреч ещё не начался или уже завершился. Личный дневник остаётся доступным.';
    container.append(intro);
    (stream.meetings||[]).forEach(meeting=>{
      const details=document.createElement('details');details.className='access-meeting';
      const summary=document.createElement('summary');summary.textContent=accessDate(meeting.date)+' · '+(meeting.topic||'Встреча '+meeting.number);details.append(summary);
      for(const text of [meeting.description,meeting.prepare]){if(text){const p=document.createElement('p');p.textContent=text;details.append(p);}}
      if(stream.canAttend)appendAccessLink(details,meeting.zoomLink,'Zoom этой встречи');
      container.append(details);
    });
    if(!stream.meetings?.length){const p=document.createElement('p');p.textContent='Расписание этого потока уточняется. Старое расписание сюда не переносится.';container.append(p);}
  }
  const next=document.createElement('div');next.className='access-program';
  next.innerHTML='<div class="section-label">Следующая группа</div><p>Даты и условия нового набора — на сайте. Покупка нового потока не обнуляет ваш дневник.</p>';
  appendAccessLink(next,'https://telo-pomnit.ru/landing_concept.html','Посмотреть следующий набор');container.append(next);
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
      ${h.tg ? `<a class="host-tg-link" data-tg-link="${h.tg}">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      </a>` : ''}
    </div>`).join('');
}

function renderUserCard() {
  const container = document.getElementById('profile-user-card');
  if (!container) return;

  const verified = !Api.clubBlocked && Api.isAuthed() && homeUser?.id === String(Api.userId);
  const name = verified && homeUser.name.trim() ? homeUser.name.trim() : 'Участница';
  const initial = name.charAt(0).toUpperCase();

  container.innerHTML = `
    <div class="profile-avatar">${escapeAccessText(initial)}</div>
    <div>
      <div class="profile-name">${escapeAccessText(name)}</div>
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
    e.preventDefault();
    const url = link.dataset.tgLink;
    if (typeof tg?.openTelegramLink === 'function') tg.openTelegramLink(url);
    else window.open(url, '_blank', 'noopener,noreferrer');
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
let lastDeniedCode = null;
function showAccessDenied(code) {
  lastDeniedCode = code;
  closeQInvite();
  Api.clubBlocked = true;
  Api.logout();
  clearPrivateConversationState();
  savedDiaryClientId = null;
  draft.zone = null; draft.sensations = []; draft.note = '';
  const textarea = document.getElementById('note-textarea');
  if (textarea) textarea.value = '';
  for (const id of ['history-list', 'recent-entries', 'today-card', 'diag-tab-content', 'ai-messages']) {
    document.getElementById(id)?.replaceChildren();
  }
  AppBoot.done();
  screenStack.length = 0; currentScreen = 'splash';tg?.BackButton?.hide();
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('screen--active','screen--enter','screen--enter-back','screen--exit','screen--exit-back','screen--fade-in'));
  const offer=document.getElementById('offer-modal');if(offer)offer.hidden=true;
  const el = document.getElementById('screen-splash');
  if (el) {
    const club = code?.startsWith('CLUB_ACCESS_');
    const message = code === 'CLUB_ACCESS_REJECTED' ? 'Доступ не разрешён.' : 'Заявка отправлена. Ожидайте подтверждения.';
    el.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:40px;text-align:center;gap:20px;">
        <div style="font-size:48px;">🌿</div>
        <div style="font-family:Georgia,serif;font-size:22px;color:#1a110a;">Тело помнит</div>
        <div style="font-size:15px;color:#8a7a6a;line-height:1.6;">${club ? message+'<br>Это закрытое приложение для одобренного круга участниц.' : code === 'SESSION_EXPIRED' ? 'Сессия завершилась. Откройте приложение заново через бота.' : 'У вас нет доступа к приложению.'}</div>
        ${club || code === 'SESSION_EXPIRED' ? '<button class="btn btn--primary" id="check-club-access">Проверить доступ</button>' : ''}
      </div>`;
    el.classList.add('screen--active');
    document.getElementById('check-club-access')?.addEventListener('click',()=>location.reload());
    const rights = document.createElement('button'); rights.className = 'btn btn--outline'; rights.id = 'blocked-data-rights-btn'; rights.textContent = 'Мои данные и приватность'; rights.onclick = openDataRights;
    el.firstElementChild?.append(rights);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// МОДАЛКА: ОФФЕР (показывается один раз при первом открытии)
// ─────────────────────────────────────────────────────────────────────────
function showOfferModal() {
  if (Api.clubBlocked) return;
  const modal = document.getElementById('offer-modal');
  if (!modal) return;

  modal.hidden = false;

  document.getElementById('offer-subscribe-btn').addEventListener('click', () => {
    Storage.setOfferSeen();
    closeOfferModal();
    const url = 'https://t.me/akhoroshavtseva';
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
// Личные данные: отдельная проверка личности не открывает закрытый клуб.
let rightsRequest = 0;
let rightsReturnBlocked = false;
let rightsReturnScreen = 'home';
let rightsReturnStack = [];
let rightsReturnOwner = null;
let rightsReturnGeneration = null;
function closeDataRights() {
  if (document.getElementById('data-rights-close')?.disabled) return;
  rightsRequest++; clearPreparedDiaryPdf(); DataRightsApi.clear();
  screenStack.length = 0;
  if (rightsReturnBlocked || Api.clubBlocked) {
    showAccessDenied(lastDeniedCode || 'SESSION_EXPIRED');
  } else if (rightsReturnOwner !== Storage._userId || rightsReturnGeneration !== Storage._generation) {
    // Do not restore an origin rendered for another account/session.
    showAccessDenied('SESSION_EXPIRED');
  } else {
    const destination = document.getElementById('screen-' + rightsReturnScreen) ? rightsReturnScreen : 'home';
    goTo(destination, true);
    if (destination !== 'home') screenStack.push(...rightsReturnStack);
    if (destination === 'home') switchTab('profile');
  }
  rightsReturnStack = [];
  syncTelegramBackNavigation();
}
function renderPrivacyEntry() {
  const container = document.querySelector('#tab-profile .screen-scroll');
  if (!container || document.getElementById('data-rights-btn')) return;
  const button = document.createElement('button'); button.id = 'data-rights-btn'; button.className = 'profile-link-btn'; button.innerHTML = '<svg aria-hidden="true" class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/></svg><span>Мои данные и приватность</span><svg aria-hidden="true" class="profile-link-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>'; button.onclick = openDataRights;
  const stats = document.getElementById('profile-stats');
  if (stats) stats.after(button); else container.append(button);
}
function ensureDataRightsScreen() {
  if (document.getElementById('screen-data-rights')) return;
  const screen = document.createElement('div'); screen.id = 'screen-data-rights'; screen.className = 'screen';
  screen.innerHTML = `<div class="screen-header"><div class="screen-title">Мои данные и приватность</div><button class="screen-header-btn" id="data-rights-close">Назад</button></div><div class="screen-scroll" style="padding:16px;padding-bottom:32px"><p class="access-notice">Этот раздел позволяет получить и удалить свои данные независимо от клубного допуска. Он не открывает дневник или программу.</p><p>Интерфейс и передача запросов к серверу: Vercel. Сервер и база приложения: Beget. Сообщения AI обрабатывает OpenAI; дневниковый контекст нового диалога выбираете вы.</p><p><a href="https://www.telo-pomnit.ru/privacy.html" target="_blank" rel="noopener">Политика обработки данных</a> · <a href="https://www.telo-pomnit.ru/offer.html" target="_blank" rel="noopener">Условия программы</a></p><p id="data-rights-status" role="status">Проверяем владельца данных…</p><button id="data-rights-retry" class="btn btn--outline btn--full mb-8">Повторить проверку личности</button><div id="data-rights-actions" hidden><button id="data-export-json" class="btn btn--outline btn--full mb-8">Скачать все данные приложения · JSON</button><button id="data-export-pdf" class="btn btn--outline btn--full mb-8">Скачать дневник в PDF</button><button id="data-export-local" class="btn btn--outline btn--full mb-8">Скачать ещё не отправленные записи и черновики · JSON</button><p class="access-notice">В PDF и общей выгрузке — данные, сохранённые на сервере. Ещё не отправленные записи и черновики можно скачать отдельно с этого устройства. В них нет старых данных без подтверждённого владельца.</p><button id="data-delete-start" class="btn btn--outline btn--full">Удалить аккаунт и личные записи</button><div id="data-delete-confirm" hidden><p>Вы удалите аккаунт приложения и его личные записи: дневник, оценки состояния, реакции, анкеты, ответы и разговоры с AI. Ещё не отправленные записи и черновики этого аккаунта на устройстве тоже удалятся. Отменить действие нельзя. При необходимости сначала скачайте свои данные. Просто закрыть приложение можно без удаления — все сохранённые записи останутся.</p><p>Необходимые сведения об оплатах и отметка о закрытом аккаунте останутся. Данные в резервных копиях не исчезают сразу; сроки их очистки уточняются.</p><label for="data-delete-phrase">Введите УДАЛИТЬ МОИ ДАННЫЕ</label><input id="data-delete-phrase" class="ai-input" autocomplete="off"><button id="data-delete-submit" class="btn btn--outline btn--full" disabled>Удалить аккаунт и записи навсегда</button><button id="data-delete-cancel" class="btn btn--ghost btn--full">Отмена</button></div></div></div>`;
  document.body.append(screen);
  document.getElementById('data-rights-close').onclick = closeDataRights;
  document.getElementById('data-rights-retry').onclick = openDataRights;
  document.getElementById('data-export-json').onclick = () => performRightsAction(async ({ owner, request, storageGeneration }) => {
    const data = await DataRightsApi.exportAll();
    if (request === rightsRequest && owner === DataRightsApi.userId && storageGeneration === Storage._generation) downloadPrivateFile(JSON.stringify(data, null, 2), 'application/json', 'telo-server-data.json');
  }, 'Серверная выгрузка подготовлена.');
  document.getElementById('data-export-pdf').onclick = () => performRightsAction(async ({ owner, request, storageGeneration }) => {
    const pdf = await DataRightsApi.downloadDiaryPdf();
    if (request === rightsRequest && owner === DataRightsApi.userId && storageGeneration === Storage._generation) {
      offerPreparedDiaryPdf(pdf, owner, document.querySelector('#screen-data-rights .screen-scroll'));
    }
  }, 'Дневник подготовлен в PDF. Ещё не отправленные записи устройства в него не входят.');
  document.getElementById('data-export-local').onclick = () => performRightsAction(async () => downloadPrivateFile(JSON.stringify(Storage.exportPendingForUser(DataRightsApi.userId), null, 2), 'application/json', 'telo-local-pending.json'), 'Выгрузка неподтверждённых записей подготовлена.');
  document.getElementById('data-delete-start').onclick = () => { document.getElementById('data-delete-confirm').hidden = false; document.getElementById('data-delete-phrase').focus(); };
  document.getElementById('data-delete-cancel').onclick = resetDeleteConfirmation;
  document.getElementById('data-delete-phrase').oninput = event => { document.getElementById('data-delete-submit').disabled = event.target.value !== 'УДАЛИТЬ МОИ ДАННЫЕ'; };
  document.getElementById('data-delete-submit').onclick = deletePersonalData;
}
function resetDeleteConfirmation() {
  document.getElementById('data-delete-confirm').hidden = true;
  document.getElementById('data-delete-phrase').value = '';
  document.getElementById('data-delete-submit').disabled = true;
}
async function openDataRights() {
  ensureDataRightsScreen();
  if (currentScreen !== 'data-rights') {
    rightsReturnBlocked = Api.clubBlocked;
    rightsReturnScreen = currentScreen;
    rightsReturnOwner = Storage._userId;
    rightsReturnGeneration = Storage._generation;
    rightsReturnStack = screenStack.filter(screen => !['splash', 'onboarding', 'data-rights'].includes(screen));
  }
  const request = ++rightsRequest;
  document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('screen--active', 'screen--enter', 'screen--exit'));
  document.getElementById('screen-data-rights').classList.add('screen--active'); currentScreen = 'data-rights'; screenStack.length = 0; syncTelegramBackNavigation(); AppBoot.done();
  document.getElementById('data-rights-actions').hidden = true; resetDeleteConfirmation();
  const retry = document.getElementById('data-rights-retry'); retry.disabled = true;
  const status = document.getElementById('data-rights-status'); status.textContent = 'Проверяем владельца данных…';
  try {
    await DataRightsApi.auth();
    if (request !== rightsRequest) return;
    status.textContent = DataRightsApi.accountDeleted ? 'Аккаунт приложения и личные записи удалены. Сведения об оплатах и отметка о закрытом аккаунте остаются. Данные в резервных копиях не исчезают сразу.' : 'Личность подтверждена. Можно получить свои данные или запросить удаление.';
    document.getElementById('data-rights-actions').hidden = false;
    document.getElementById('data-export-local').hidden = DataRightsApi.accountDeleted;
    document.getElementById('data-export-pdf').hidden = DataRightsApi.accountDeleted;
    document.getElementById('data-delete-start').hidden = DataRightsApi.accountDeleted;
  } catch { if (request === rightsRequest) status.textContent = 'Не удалось подтвердить личность. Откройте приложение через Telegram-бота и повторите.'; }
  finally { if (request === rightsRequest) retry.disabled = false; }
}
async function performRightsAction(action, successText) {
  const owner = DataRightsApi.userId, request = rightsRequest, storageGeneration = Storage._generation;
  const buttons = document.querySelectorAll('#data-rights-actions button'); buttons.forEach(button => button.disabled = true);
  document.getElementById('data-rights-close').disabled = true;
  document.getElementById('data-rights-retry').disabled = true;
  try {
    if (!owner) throw new Error('Сначала подтвердите личность.');
    if (Date.now() >= DataRightsApi.expiresAt) await DataRightsApi.auth();
    if (owner !== DataRightsApi.userId || request !== rightsRequest || storageGeneration !== Storage._generation) throw new Error('Владелец данных изменился. Откройте раздел заново.');
    await action({ owner, request, storageGeneration });
    if (request === rightsRequest) document.getElementById('data-rights-status').textContent = successText;
  } catch (error) {
    if (request === rightsRequest) {
      document.getElementById('data-rights-status').textContent = error.message || 'Действие не выполнено. Можно повторить.';
      if (owner !== DataRightsApi.userId) { resetDeleteConfirmation(); document.getElementById('data-rights-actions').hidden = true; DataRightsApi.clear(); }
    }
  }
  finally { if (request === rightsRequest) { buttons.forEach(button => button.disabled = false); document.getElementById('data-rights-close').disabled = false; document.getElementById('data-rights-retry').disabled = false; document.getElementById('data-delete-submit').disabled = document.getElementById('data-delete-phrase').value !== 'УДАЛИТЬ МОИ ДАННЫЕ'; } }
}
async function deletePersonalData() {
  if (document.getElementById('data-delete-phrase').value !== 'УДАЛИТЬ МОИ ДАННЫЕ') return;
  await performRightsAction(async () => {
    const userId = DataRightsApi.userId;
    await DataRightsApi.auth();
    if (userId !== DataRightsApi.userId) throw new Error('Владелец данных изменился. Повторите проверку личности.');
    await DataRightsApi.deleteMe();
    Storage.purgeUser(userId); Api.logout(); Api.clubBlocked = true; DataRightsApi.accountDeleted = true;
    clearPrivateConversationState();
    draft.zone = null; draft.sensations = []; draft.note = ''; savedDiaryClientId = null; savedCheckinDayKey = null;
    for (const key of Object.keys(checkinDraft)) checkinDraft[key] = 5;
    checkinHasUnsavedChanges = false; diag.answers = []; diag.current = 0; qAnswers = {};
    triggerDraft.situation = ''; triggerDraft.reactionType = null; triggerDraft.intensity = 5; triggerDraft.zone = null; triggerDraft.sensations = []; triggerDraft.note = '';
    feedbackRating = 0; qStreamId = null; qStep = 0;
    programAccess = null; selectedProgramId = null; programClock = null; aiAccessGranted = false;
    document.querySelectorAll('textarea').forEach(input => { input.value = ''; });
    for (const id of ['history-list','recent-entries','today-card','diag-tab-content','ai-messages','checkin-history-list','consent-banner-wrap','diary-sync-status','checkin-sync-status']) document.getElementById(id)?.replaceChildren();
    document.getElementById('data-rights-actions').hidden = false;
    document.getElementById('data-export-local').hidden = true; document.getElementById('data-export-pdf').hidden = true; document.getElementById('data-delete-start').hidden = true;
    // Keep only the verified identifier; the revoked purpose token is discarded.
    // Financial export will obtain a fresh limited token without reopening club.
    DataRightsApi.clear(); DataRightsApi.userId = userId;
    resetDeleteConfirmation(); rightsReturnBlocked = true; lastDeniedCode = 'ACCOUNT_DELETED';
  }, 'Аккаунт приложения и личные записи удалены. Сведения об оплатах и отметка о закрытом аккаунте остаются; резервные копии очищаются отдельно.');
}
function downloadPrivateFile(contents, type, filename) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.target = '_blank'; link.rel = 'noopener noreferrer'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}

let preparedDiaryPdf = null;
function clearPreparedDiaryPdf() {
  preparedDiaryPdf = null;
  document.querySelectorAll('.pdf-ready-panel').forEach(panel => panel.remove());
}
function offerPreparedDiaryPdf(pdf, owner, container) {
  clearPreparedDiaryPdf();
  if (!container) return;
  const file = new File([pdf], 'dnevnik-tela.pdf', { type: 'application/pdf' });
  preparedDiaryPdf = { file, owner, generation: DataRightsApi._generation, storageGeneration: Storage._generation, expiresAt: DataRightsApi.expiresAt };
  const panel = document.createElement('div'); panel.className = 'pdf-ready-panel access-notice';
  const text = document.createElement('p'); text.textContent = 'PDF подготовлен. В нём вся история, сохранённая на сервере; ещё не отправленные записи устройства не включены.'; panel.append(text);
  let nativeAvailable = false;
  try { nativeAvailable = !!navigator.canShare?.({ files: [file] }) && typeof navigator.share === 'function'; } catch {}
  {
    const save = document.createElement('button'); save.className = 'btn btn--outline btn--full'; save.id = nativeAvailable ? 'pdf-share-file' : 'pdf-download-file'; save.textContent = 'Сохранить или открыть PDF';
    save.onclick = () => {
      const ready = preparedDiaryPdf;
      if (!ready || ready.owner !== DataRightsApi.userId || ready.generation !== DataRightsApi._generation || ready.storageGeneration !== Storage._generation || Date.now() >= ready.expiresAt || DataRightsApi.accountDeleted) { clearPreparedDiaryPdf(); showToast('Подготовьте PDF заново.', false); return; }
      // Only this second explicit click invokes the native file chooser.
      if (nativeAvailable) {
        navigator.share({ files: [ready.file], title: 'Дневник · Тело помнит' }).catch(error => { if (error.name !== 'AbortError') showToast('Не удалось открыть выбор сохранения. PDF можно подготовить повторно.', false); }).finally(syncTelegramBackNavigation);
      } else {
        downloadPrivateFile(ready.file, 'application/pdf', 'dnevnik-tela.pdf');
        syncTelegramBackNavigation();
      }
    };
    panel.append(save);
  }
  container.prepend(panel);
}
window.addEventListener('pagehide', clearPreparedDiaryPdf);

// Настоящий PDF всей серверной истории, без обращения к AI.
async function exportDiaryPdf() {
  const button = document.getElementById('export-pdf-btn'); if (button) button.disabled = true;
  const owner = Storage._userId, generation = Storage._generation;
  try {
    await DataRightsApi.auth();
    if (DataRightsApi.userId !== owner) throw new Error('Не удалось подтвердить владельца дневника.');
    const pdf = await DataRightsApi.downloadDiaryPdf();
    if (Storage._generation !== generation || Api.clubBlocked) return;
    offerPreparedDiaryPdf(pdf, owner, document.getElementById('history-list'));
    showToast('PDF подготовлен.');
  } catch (error) { showToast(error.message || 'PDF не удалось загрузить. Можно повторить.', false); }
  finally { if (button) button.disabled = false; }
}

// ─────────────────────────────────────────────────────────────────────────
// AI ЧАТ
// ─────────────────────────────────────────────────────────────────────────

let aiSessionId = null;
let aiMessages = [];
let aiAccessGranted = null;
let aiPending = false;
let aiScreenRequest = 0;
let aiContext = { mode: 'none', ids: [], preview: null, reviewed: false };
let aiContextCandidates = [];
let aiSessionContext = null;
let aiContextLoading = false;
let aiContextLoadState = 'idle';
let aiContextLoadRequest = 0;
let aiDraftScope = null;
let aiDraftDurable = true;
function ensureAiDraftScope() {
  const scope = Storage._userId ? Storage._userId + ':' + (aiSessionId || 'new') : null;
  if (scope === aiDraftScope) return;
  aiDraftScope = scope; aiDraftDurable = scope ? Storage.isAiDraftPersistent(aiSessionId) : true;
  const input = document.getElementById('ai-input');
  if (input) input.value = scope ? Storage.getAiDraft(aiSessionId) : '';
}
function saveCurrentAiDraft() {
  const input = document.getElementById('ai-input');
  if (!input || !Storage._userId || Api.clubBlocked) return;
  aiDraftDurable = Storage.saveAiDraft(aiSessionId, input.value);
  renderAiDraftStatus();
}
function renderAiDraftStatus() {
  const bar = document.getElementById('ai-input-bar');
  if (!bar) return;
  let status = document.getElementById('ai-draft-status');
  if (!status) { status = document.createElement('p'); status.id = 'ai-draft-status'; status.setAttribute('role','status'); bar.append(status); }
  const text = document.getElementById('ai-input')?.value || '';
  status.hidden = !text;
  status.textContent = aiDraftDurable ? 'Черновик сохранён на этом устройстве. Он не отправляется сам.' : 'Черновик не сохранён на устройстве. Не закрывайте приложение: текст пока только в этом окне.';
}
function clearPrivateConversationState() {
  homeUser = null;
  renderMainTab();
  aiScreenRequest++; aiSessionId = null; aiMessages = []; aiPending = false;
  aiContext = { mode: 'none', ids: [], preview: null, reviewed: false };
  aiContextLoadRequest++; aiContextLoadState = 'idle';
  aiContextCandidates = []; aiSessionContext = null; aiContextLoading = false; aiDraftScope = null; aiDraftDurable = true;
  clearPreparedDiaryPdf();
  const input = document.getElementById('ai-input'); if (input) input.value = '';
  document.getElementById('ai-messages')?.replaceChildren();
}
function initAiChat() {
  document.getElementById('ai-send-btn')?.addEventListener('click', sendAiMessage);
  const input = document.getElementById('ai-input');
  input?.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendAiMessage(); } });
  input?.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 100) + 'px'; saveCurrentAiDraft(); });
}
async function refreshAiScreen() {
  if (aiPending) return;
  const request = ++aiScreenRequest, generation = Storage._generation;
  await refreshProgramAccess();
  if (request !== aiScreenRequest || generation !== Storage._generation || Api.clubBlocked) return;
  renderAiChat();
  try {
    const sessions = await Api.getAiSessions();
    if (request !== aiScreenRequest || generation !== Storage._generation || Api.clubBlocked) return;
    const select = document.getElementById('ai-history-select'); select.replaceChildren(new Option('Новый диалог', ''));
    sessions.forEach(session => select.add(new Option(accessDate(session.createdAt), session.sessionId)));
    select.value = aiSessionId || '';
  } catch { document.getElementById('ai-access-notice').textContent += ' Историю не удалось загрузить — можно повторить.'; }
}
document.getElementById('ai-access-refresh')?.addEventListener('click', refreshAiScreen);
document.getElementById('ai-history-select')?.addEventListener('change', async event => {
  if (aiPending) return;
  const id = event.target.value, request = ++aiScreenRequest, generation = Storage._generation;
  if (!id) { aiSessionId = null; aiMessages = []; aiSessionContext = null; aiContext = { mode: 'none', ids: [], preview: null, reviewed: false }; renderAiChat(); return; }
  event.target.disabled = true;
  document.getElementById('ai-input').disabled = true;
  try {
    const session = await Api.getAiSession(id);
    if (request !== aiScreenRequest || generation !== Storage._generation || Api.clubBlocked) return;
    aiSessionId = session.sessionId; aiMessages = Array.isArray(session.messages) ? session.messages : [];
    aiSessionContext = { mode: session.contextMode || 'legacy_unknown', snapshot: session.contextSnapshot || [], text: session.contextText || '', version: session.contextVersion };
    renderAiChat();
  } catch { document.getElementById('ai-access-notice').textContent = 'Не удалось загрузить диалог. Попробуйте ещё раз.'; }
  finally { event.target.disabled = aiPending; document.getElementById('ai-input').disabled = false; }
});
function aiContextReady() { return !!aiSessionId || aiContext.mode === 'none' || (!!aiContext.preview && aiContext.reviewed); }
function renderAiChat() {
  ensureAiDraftScope();
  renderAiDraftStatus();
  renderAccessNotice();
  const bar = document.getElementById('ai-input-bar');
  if (bar) bar.style.display = aiAccessGranted === true || document.getElementById('ai-input')?.value ? '' : 'none';
  document.getElementById('ai-send-btn').disabled = aiPending || aiAccessGranted !== true || !aiContextReady();
  renderAiMessages();
}
function appendAiContextPreview(panel, snapshot, exactText) {
  const readable = document.createElement('div'); readable.id = 'ai-context-readable';
  for (const row of snapshot || []) {
    const card = document.createElement('article'); card.className = 'privacy-context-text';
    const heading = document.createElement('strong'); heading.textContent = accessDate(row.createdAt) + ' · ' + (DATA.zones.find(zone => zone.id === row.zone)?.label || row.zone); card.append(heading);
    const sensations = document.createElement('p'); sensations.textContent = 'Ощущения: ' + ((row.sensations || []).map(id => getSensation(id)?.label || id).join(', ') || 'не указаны'); card.append(sensations);
    const note = document.createElement('p'); note.textContent = row.note || 'Без заметки'; card.append(note);
    if (row.noteTruncated || row.sensationsTruncated) { const hint = document.createElement('p'); hint.textContent = 'Эта запись сокращена для отправки. Полная запись остаётся в дневнике.'; card.append(hint); }
    readable.append(card);
  }
  panel.append(readable);
  const details = document.createElement('details'); details.id = 'ai-context-exact-details';
  const title = document.createElement('summary'); title.textContent = 'Точный текст отправки';
  const exact = document.createElement('pre'); exact.id = 'ai-context-preview'; exact.className = 'privacy-context-text'; exact.textContent = exactText;
  details.append(title, exact); panel.append(details);
}
async function loadAiContextCandidates() {
  const request = ++aiContextLoadRequest, generation = Storage._generation, owner = Storage._userId;
  const current = () => request === aiContextLoadRequest && generation === Storage._generation && owner === Storage._userId && !aiSessionId && aiContext.mode === 'selected' && !Api.clubBlocked;
  aiContextCandidates = []; aiContextLoading = true; aiContextLoadState = 'loading'; renderAiChat();
  try {
    const data = await Api.getDiary();
    if (!current()) return;
    aiContextCandidates = Array.isArray(data) ? data : data.entries || [];
    aiContextLoadState = 'loaded';
  } catch { if (current()) { aiContextCandidates = []; aiContextLoadState = 'failed'; } }
  finally { if (current()) { aiContextLoading = false; renderAiChat(); } }
}
function renderAiContext(container) {
  const panel = document.createElement('section'); panel.id = 'ai-context-panel'; panel.className = 'access-program';
  const disclosure = document.createElement('p'); disclosure.textContent = 'Ответы создаёт AI с помощью OpenAI. В этот сервис передаётся текст разговора. Выбранные записи дневника используются и для следующих ответов в этом разговоре.'; panel.append(disclosure);
  const limits = document.createElement('p'); limits.textContent = 'AI может ошибаться и не заменяет врача или ведущую. Этот чат не предназначен для срочной помощи. Сообщения здесь не отправляются ведущим.'; panel.append(limits);
  const contact = document.createElement('a'); contact.href = 'https://t.me/almira_sultanova'; contact.target = '_blank'; contact.rel = 'noopener noreferrer'; contact.dataset.tgLink = contact.href; contact.className = 'consent-link'; contact.style.display = 'block'; contact.style.marginBottom = '12px'; contact.textContent = 'Написать Альмире'; contact.id = 'ai-contact-host'; panel.append(contact);
  if (aiSessionId) {
    const mode = aiSessionContext?.mode || 'legacy_unknown';
    const status = document.createElement('p'); status.id = 'ai-context-status';
    status.textContent = mode === 'none' ? 'Для этого разговора записи дневника не выбирались.' : mode === 'selected' ? 'В этот разговор добавлены выбранные вами записи. Другие записи можно выбрать в новом разговоре.' : 'Это старый разговор. Какие записи передавались в него раньше, не сохранено. Сведения из дневника могут остаться в сообщениях. Если хотите говорить без записей, начните новый разговор.';
    panel.append(status);
    if (mode === 'selected') appendAiContextPreview(panel, aiSessionContext.snapshot, aiSessionContext.text || JSON.stringify(aiSessionContext.snapshot));
  } else {
    const label = document.createElement('label'); label.htmlFor = 'ai-context-mode'; label.textContent = 'Записи для этого разговора'; panel.append(label);
    const mode = document.createElement('select'); mode.id = 'ai-context-mode'; mode.className = 'access-select'; mode.add(new Option('Без дневника', 'none')); mode.add(new Option('Выбрать до пяти записей', 'selected')); mode.value = aiContext.mode; mode.disabled = aiPending;
    mode.onchange = async () => {
      aiContextLoadRequest++; aiContextLoadState = 'idle'; aiContextLoading = false;
      aiContext = { mode: mode.value, ids: [], preview: null, reviewed: false }; aiContextCandidates = []; renderAiChat();
      if (aiContext.mode === 'selected') await loadAiContextCandidates();
    };
    panel.append(mode);
    if (aiContext.mode === 'none') { const status = document.createElement('p'); status.id = 'ai-context-status'; status.textContent = 'Записи дневника не добавляются. Отправится только текст вашего сообщения и история этого диалога.'; panel.append(status); }
    else {
      const choices = document.createElement('div'); choices.id = 'ai-context-choices';
      if (aiContextLoading) choices.textContent = 'Загружаем записи, сохранённые в аккаунте…';
      else if (aiContextLoadState === 'failed') {
        choices.textContent = 'Не удалось загрузить записи. Повторите загрузку или выберите «Без дневника».';
        const retry = document.createElement('button'); retry.id = 'ai-context-reload'; retry.type = 'button'; retry.className = 'btn btn--outline btn--full'; retry.textContent = 'Повторить загрузку'; retry.disabled = aiPending; retry.onclick = loadAiContextCandidates; choices.append(retry);
      } else if (!aiContextCandidates.length) choices.textContent = 'В аккаунте пока нет записей для выбора. Можно начать без дневника.';
      aiContextCandidates.forEach(entry => {
        const row = document.createElement('label'); row.className = 'privacy-context-choice';
        const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = entry.id; checkbox.checked = aiContext.ids.includes(entry.id); checkbox.disabled = aiPending;
        checkbox.onchange = () => {
          if (checkbox.checked && aiContext.ids.length >= 5) { checkbox.checked = false; showToast('Можно выбрать не более пяти записей.', false); return; }
          aiContext.ids = checkbox.checked ? [...aiContext.ids, entry.id] : aiContext.ids.filter(id => id !== entry.id); aiContext.preview = null; aiContext.reviewed = false; renderAiChat();
        };
        const text = document.createElement('span'); text.textContent = accessDate(entry.createdAt || entry.date) + ' · ' + (entry.note || 'Без заметки').slice(0, 100); row.append(checkbox, text); choices.append(row);
      });
      panel.append(choices);
      const previewButton = document.createElement('button'); previewButton.id = 'ai-context-preview-btn'; previewButton.className = 'btn btn--outline btn--full'; previewButton.textContent = 'Посмотреть выбранные записи'; previewButton.disabled = aiPending || !aiContext.ids.length || aiContextLoading;
      previewButton.onclick = async () => {
        const generation = Storage._generation, ids = [...aiContext.ids]; previewButton.disabled = true;
        try {
          const preview = await Api.previewAiContext(ids);
          if (generation !== Storage._generation || aiSessionId || Api.clubBlocked || JSON.stringify(aiContext.ids) !== JSON.stringify(ids)) return;
          aiContext.preview = preview; aiContext.reviewed = false; renderAiChat();
        } catch (error) { document.getElementById('ai-access-notice').textContent = error.message || 'Не удалось подготовить выбранные записи. Можно повторить.'; previewButton.disabled = false; }
      };
      panel.append(previewButton);
      if (aiContext.preview) {
        appendAiContextPreview(panel, aiContext.preview.contextSnapshot, aiContext.preview.contextText);
        if (aiContext.preview.contextSnapshot?.some(row => row.noteTruncated || row.sensationsTruncated)) { const hint = document.createElement('p'); hint.textContent = 'В OpenAI отправится только показанная часть длинной записи. Полная запись останется в дневнике.'; panel.append(hint); }
        const reviewLabel = document.createElement('label'); reviewLabel.className = 'privacy-context-choice'; const review = document.createElement('input'); review.type = 'checkbox'; review.id = 'ai-context-review'; review.checked = aiContext.reviewed; review.disabled = aiPending;
        review.onchange = () => { aiContext.reviewed = review.checked; document.getElementById('ai-send-btn').disabled = aiPending || aiAccessGranted !== true || !aiContextReady(); };
        const reviewText = document.createElement('span'); reviewText.textContent = 'Я просмотрела записи и разрешаю использовать их в этом разговоре с OpenAI.'; reviewLabel.append(review, reviewText); panel.append(reviewLabel);
      }
    }
  }
  container.append(panel);
}
function renderAiMessages() {
  const container = document.getElementById('ai-messages'); if (!container) return;
  const previousScroll = container.scrollTop; container.replaceChildren(); renderAiContext(container);
  if (!aiMessages.length) { const welcome = document.createElement('p'); welcome.className = 'ai-welcome-text'; welcome.textContent = aiAccessGranted === true ? 'Можно начать с того, что вы сейчас замечаете в теле, чувствах или мыслях. Что хочется обсудить?' : 'Здесь можно читать сохранённые диалоги. Для нового сообщения нужен действующий доступ к AI.'; container.append(welcome); }
  aiMessages.forEach(message => { const row = document.createElement('div'); row.className = 'ai-msg ai-msg--' + (message.role === 'user' ? 'user' : 'assistant'); const text = document.createElement('div'); text.className = 'ai-msg-text'; text.textContent = String(message.content || ''); row.append(text); container.append(row); });
  container.scrollTop = aiSessionId ? container.scrollHeight : previousScroll;
}
async function sendAiMessage() {
  const input = document.getElementById('ai-input'), rawText = input?.value || '', message = rawText.trim();
  if (!message || aiPending || !aiContextReady()) return;
  const generation = Storage._generation, request = aiScreenRequest, owner = Storage._userId, sentSessionId = aiSessionId;
  saveCurrentAiDraft();
  aiPending = true; renderAiChat(); const select = document.getElementById('ai-history-select'); select.disabled = true;
  try {
    await refreshProgramAccess();
    if (generation !== Storage._generation || request !== aiScreenRequest || Api.clubBlocked || aiAccessGranted !== true) return;
    const context = { contextMode: aiContext.mode, diaryEntryIds: [...aiContext.ids], contextPreviewHash: aiContext.preview?.contextHash };
    const result = await Api.aiChat(message, aiSessionId, context);
    if (generation !== Storage._generation || request !== aiScreenRequest || Api.clubBlocked) return;
    if (!aiSessionId) aiSessionContext = { mode: context.contextMode, snapshot: aiContext.preview?.contextSnapshot || [], text: aiContext.preview?.contextText || '' };
    Storage.clearAiDraftIfMatches(sentSessionId, rawText, owner, generation);
    const remainingDraft = Storage.getAiDraft(sentSessionId);
    if (!sentSessionId && remainingDraft) {
      Storage.moveAiDraftIfMatches(null, result.sessionId, remainingDraft, owner, generation);
    }
    aiSessionId = result.sessionId; aiDraftScope = owner + ':' + aiSessionId; aiDraftDurable = Storage.isAiDraftPersistent(aiSessionId); aiMessages.push({ role: 'user', content: message }, { role: 'assistant', content: result.reply });
    if (input.value === rawText) { input.value = ''; input.style.height = 'auto'; }
    renderAiDraftStatus();
    renderAiMessages(); hapticNotify('success');
    if (!Array.from(select.options).some(option => option.value === aiSessionId)) select.add(new Option('Текущий диалог', aiSessionId)); select.value = aiSessionId;
  } catch (error) {
    if (error.code === 'AI_ACCESS_REQUIRED') { aiAccessGranted = false; if (programAccess) programAccess.ai = error.access; }
    if (error.code === 'CONTEXT_CHANGED') { aiContext.preview = null; aiContext.reviewed = false; }
    if (generation === Storage._generation && !Api.clubBlocked) { renderAiChat(); document.getElementById('ai-access-notice').textContent = error.message || 'Не удалось отправить. Ваш текст остаётся в поле ввода.'; }
  } finally { aiPending = false; select.disabled = false; if (generation === Storage._generation && !Api.clubBlocked) document.getElementById('ai-send-btn').disabled = aiAccessGranted !== true || !aiContextReady(); }
}
document.addEventListener('visibilitychange', async () => {
  if (!document.hidden && Api.isAuthed()) { await refreshProgramAccess(); if (currentScreen === 'ai-chat' && !aiPending) renderAiChat(); if (activeTab === 'profile') renderProfileTab(); }
});

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
    `<div class="checklist-item" data-id="${escapeAccessText(s.id)}">
      <span class="checklist-check"></span>
      <span class="checklist-emoji">${s.emoji}</span>
      <span class="checklist-label">${escapeAccessText(s.label)}</span>
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
        <div style="margin-top:4px; font-size:13px">Запишите ситуацию и свою реакцию</div>
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
      <div class="trigger-card-situation">${escapeAccessText(e.situation)}</div>
      ${zoneName ? `<div class="trigger-card-meta">📍 ${zoneName} · интенсивность ${e.intensity}/10</div>` : `<div class="trigger-card-meta">интенсивность ${e.intensity}/10</div>`}
      ${e.note ? `<div class="trigger-card-note">${escapeAccessText(e.note)}</div>` : ''}
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
let checkinHasUnsavedChanges = false;

function initCheckin() {
  // Кнопка «📊 Трекер изменений» в дневнике
  document.getElementById('checkin-btn')?.addEventListener('click', () => {
    renderCheckinScales();
    renderCheckinSyncStatus();
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
    renderCheckinSyncStatus();
    goTo('checkin');
    haptic('light');
  });

  // Сохранить чекин
  document.getElementById('checkin-save-btn')?.addEventListener('click', saveCheckinEntry);
  document.getElementById('checkin-note')?.addEventListener('input', () => {
    checkinHasUnsavedChanges = true; renderCheckinSyncStatus();
  });
}

function renderCheckinScales() {
  const container = document.getElementById('checkin-scales');
  if (!container) return;
  savedCheckinDayKey = null;
  checkinHasUnsavedChanges = false;

  const today = Storage.checkinDayKey(new Date());
  const existing = Storage.getCheckins().find(row => row.dayKey === today && !row.legacyScale);
  const note = document.getElementById('checkin-note');
  if (note) note.value = existing?.note || '';
  CHECKIN_SCALES.forEach(scale => { checkinDraft[scale.key] = scaleValue(existing || {}, scale.key) ?? 5; });
  container.innerHTML = CHECKIN_SCALES.map(s => `
    <div class="checkin-scale-item">
      <div class="checkin-scale-header">
        <span class="checkin-scale-emoji">${s.emoji}</span>
        <span class="checkin-scale-label">${escapeAccessText(s.label)}</span>
        <span class="checkin-scale-val" id="val-${s.key}">${checkinDraft[s.key]}</span>
      </div>
      <div class="checkin-slider-row">
        <button class="checkin-step-btn" onclick="stepSlider('${s.key}',-1)">−</button>
        <input type="range" class="intensity-slider" min="1" max="10" value="${checkinDraft[s.key]}" aria-label="${escapeAccessText(s.label)}"
          id="slider-${s.key}" data-key="${s.key}">
        <button class="checkin-step-btn" onclick="stepSlider('${s.key}',1)">+</button>
      </div>
      <div class="intensity-labels">
        <span class="intensity-hint">${s.low}</span>
        <span class="intensity-hint">${s.high}</span>
      </div>
    </div>`).join('');

  CHECKIN_SCALES.forEach(s => {
    const slider = document.getElementById(`slider-${s.key}`);
    if (slider) {
      slider.addEventListener('input', () => {
        checkinDraft[s.key] = Number(slider.value);
        checkinHasUnsavedChanges = true;
        renderCheckinSyncStatus();
        const valEl = document.getElementById(`val-${s.key}`);
        if (valEl) valEl.textContent = slider.value;
      });
    }
  });
}

function stepSlider(key, delta) {
  const slider = document.getElementById(`slider-${key}`);
  if (!slider) return;
  const newVal = Math.min(10, Math.max(1, Number(slider.value) + delta));
  slider.value = newVal;
  checkinDraft[key] = newVal;
  checkinHasUnsavedChanges = true;
  renderCheckinSyncStatus();
  const valEl = document.getElementById(`val-${key}`);
  if (valEl) valEl.textContent = newVal;
}

let savedCheckinDayKey = null;
function checkinStatusText(row) {
  if (row.syncStatus === 'synced') return 'Все пять оценок сохранены на сервере.';
  if (row.syncStatus === 'memory-only') return 'Пока только в открытом приложении: хранилище недоступно. Не закрывайте окно до подтверждения сервера.';
  return row.syncError ? 'Оценки сохранены на устройстве. Отправить на сервер пока не удалось; можно повторить.' : 'Оценки сохранены на устройстве. Ожидают подтверждения сервера.';
}
function renderCheckinSyncStatus() {
  const save = document.getElementById('checkin-save-btn');
  if (!save) return;
  let panel = document.getElementById('checkin-sync-status');
  if (!panel) {
    panel = document.createElement('div'); panel.id = 'checkin-sync-status'; panel.className = 'access-notice'; panel.setAttribute('role', 'status');
    document.getElementById('checkin-note').after(panel);
  }
  const day = savedCheckinDayKey || Storage.checkinDayKey(new Date());
  const row = Storage.getCheckins().find(item => item.dayKey === day && !item.legacyScale);
  panel.replaceChildren();
  if (checkinHasUnsavedChanges) {
    panel.dataset.syncStatus = 'draft';
    panel.textContent = 'Оценки изменены. Нажмите «Сохранить оценки», чтобы сохранить изменения.';
    return;
  }
  if (!row) return;
  panel.dataset.syncStatus = row.syncStatus;
  const text = document.createElement('p'); text.textContent = checkinStatusText(row); panel.append(text);
  if (row.syncStatus !== 'synced') {
    const retry = document.createElement('button'); retry.id = 'checkin-sync-retry'; retry.className = 'btn btn--outline btn--full'; retry.textContent = 'Повторить отправку';
    retry.onclick = async () => { retry.disabled = true; try { await Storage.flushCheckinsPending(); } finally { renderCheckinSyncStatus(); } };
    panel.append(retry);
  }
}
async function saveCheckinEntry() {
  const button = document.getElementById('checkin-save-btn');
  if (button?.disabled) return;
  try {
    if (button) button.disabled = true;
    const note = document.getElementById('checkin-note')?.value?.trim() || '';
    const row = Storage.saveCheckin({ ...checkinDraft, note });
    checkinHasUnsavedChanges = false;
    savedCheckinDayKey = row.dayKey;
    renderCheckinSyncStatus();
    await Storage.flushCheckinsPending();
    renderCheckinSyncStatus();
    const actual = Storage.getCheckins().find(item => item.dayKey === row.dayKey);
    if (actual?.syncStatus === 'synced') hapticNotify('success');
  } catch {
    showToast('Не удалось сохранить оценки. Ответы остаются в этом окне.', false);
  } finally { if (button) button.disabled = false; }
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
  // History is personal and complete; only comparisons/weekly plots use a stream.
  const checkins = Storage.getCheckins();
  const periodRows = selectedCheckins();
  const fmt = value => new Date(value).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', year: 'numeric' });
  const comparisons = CHECKIN_SCALES.map(scale => {
    const measured = periodRows.filter(row => scaleValue(row, scale.key) !== null);
    if (measured.length < 2) return '';
    const first = measured[0], last = measured[measured.length - 1];
    const a = scaleValue(first, scale.key), b = scaleValue(last, scale.key);
    const delta = b - a;
    return `<div class="checkin-compare-row"><span class="checkin-compare-label">${scale.label}<small style="display:block">${fmt(first.date)} — ${fmt(last.date)}</small></span><span class="checkin-compare-vals">${a} → ${b}</span><span class="checkin-delta checkin-delta--same">${delta > 0 ? '↑' : delta < 0 ? '↓' : '→'}${Math.abs(delta) || ''}</span></div>`;
  }).join('');
  const comparison = comparisons ? `<div class="checkin-comparison"><div class="checkin-comparison-head">Изменения отдельных шкал · ${escapeAccessText(currentProgram()?.name)}</div>${comparisons}</div>` : '';
  const list = [...checkins].reverse().map(row => {
    const legacy = row.legacyScale || CHECKIN_SCALES.every(scale => scaleValue(row, scale.key) === null);
    const bars = legacy ? `<p class="access-notice">Прежняя запись: сохранена только средняя оценка${Number.isFinite(row.bodyScore) ? ' ' + row.bodyScore + '/10' : ''}. Отдельные шкалы не восстановлены.</p>` : CHECKIN_SCALES.map(scale => {
      const value = scaleValue(row, scale.key);
      return `<div class="checkin-mini-row"><span class="checkin-mini-label" style="min-width:45%">${scale.label}</span><div class="checkin-mini-bar-wrap">${value === null ? '' : `<div class="checkin-mini-bar-fill" style="width:${value * 10}%;background:var(--tg-button)"></div>`}</div><span class="checkin-mini-val">${value ?? '—'}</span></div>`;
    }).join('');
    return `<div class="checkin-card"><div class="checkin-card-date">${fmt(row.date)} · МСК</div><div class="checkin-mini-bars">${bars}</div>${row.note ? `<div class="checkin-card-note">${escapeAccessText(row.note)}</div>` : ''}${!legacy ? `<p class="access-notice">${checkinStatusText(row)}</p>` : ''}</div>`;
  }).join('');
  container.innerHTML = `<div style="padding:0 16px 24px">${comparison}<div class="section-label">Все личные наблюдения</div>${list || '<p class="access-notice">Оценок пока нет. Можно начать с того, что вы замечаете сейчас.</p>'}</div>`;
  renderHistoryLoadWarning(container, ['checkins'], 'checkins');
}

// ─────────────────────────────────────────────────────────────────────────
// АНКЕТА УЧАСТНИЦЫ (до потока)
// ─────────────────────────────────────────────────────────────────────────

let qAnswers = {};
let qStep = 0;
let qStreamId = null;
let qInviteTimer = null;
let qStatusVerified = false;

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
  if (Api.isClubAdmin || Api.clubBlocked || !streamId) return;
  const owner = Api.userId;
  const generation = Api._authGeneration;
  qStreamId = streamId;
  if (Storage.isQuestionnaireDone()) return;

  // Проверяем на сервере — вдруг уже заполнена с другого устройства
  try {
    const status = await Api.getQuestionnaireStatus(streamId);
    if (Api.clubBlocked || Api.userId !== owner || Api._authGeneration !== generation) return;
    qStatusVerified = true;
    if (status?.pre) {
      Storage.setQuestionnaireDone();
      renderQuestionnaireBanner();
      return;
    }
  } catch { return; /* Unknown server status must not become "not filled in". */ }
  renderQuestionnaireBanner();

  // Показываем bottom sheet через 10 сек (только 1 раз)
  if (!Storage.isQSheetShown()) {
    clearTimeout(qInviteTimer);
    qInviteTimer = setTimeout(() => {
      qInviteTimer = null;
      if (Api.isClubAdmin || Api.clubBlocked || Api.userId !== owner || Api._authGeneration !== generation || currentScreen !== 'home') return;
      Storage.setQSheetShown();
      showQInvite();
    }, 10000);
  }
}

// ─── Bottom sheet — приглашение ───────────────────────────────────────────

function showQInvite() {
  if (Api.isClubAdmin || Api.clubBlocked || !qStreamId || !qStatusVerified) return;
  const overlay = document.getElementById('q-invite-overlay');
  const sheet   = document.getElementById('q-invite-sheet');
  if (!overlay || !sheet) return;
  overlay.classList.add('active');
  sheet.classList.add('active');
  haptic('light');
}

function closeQInvite() {
  clearTimeout(qInviteTimer);
  qInviteTimer = null;
  const overlay = document.getElementById('q-invite-overlay');
  const sheet   = document.getElementById('q-invite-sheet');
  if (!overlay || !sheet) return;
  overlay.classList.remove('active');
  sheet.classList.remove('active');
}

// ─── Открыть / закрыть экран анкеты ──────────────────────────────────────

function openQuestionnaire() {
  if (Api.isClubAdmin || Api.clubBlocked || !qStreamId) return;
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
        <label class="consent-label"><input type="checkbox" id="consent-banner-cb"><span>Я согласна с текстом согласия ниже.</span></label>
        <details><summary>Текст согласия · 8 октября 2026</summary><p>${escapeAccessText(document.getElementById('consent-text-body')?.textContent || '')}</p><a href="https://www.telo-pomnit.ru/privacy.html" target="_blank" rel="noopener">Политика обработки данных</a></details>
      </div>
      <button class="consent-banner-btn" id="consent-banner-btn" disabled>Подтвердить</button>
    </div>`;

  const btn = document.getElementById('consent-banner-btn');
  const checkbox = document.getElementById('consent-banner-cb');
  let savingConsent = false;
  checkbox?.addEventListener('change', () => { btn.disabled = savingConsent || !checkbox.checked; });
  btn?.addEventListener('click', async () => {
    if (savingConsent || !checkbox?.checked) return;
    savingConsent = true;
    btn.disabled = true;
    btn.textContent = 'Сохраняем…';
    try {
      await Api.giveConsent();
      Storage.setConsentGiven();
      container.innerHTML = '';
      hapticNotify('success');
    } catch (e) {
      showToast('Не удалось сохранить согласие. Проверьте соединение и попробуйте ещё раз.', false);
    } finally {
      savingConsent = false;
      btn.disabled = !checkbox.checked;
      btn.textContent = 'Подтвердить';
    }
  });
}

// ─── Баннер в профиле ────────────────────────────────────────────────────

function renderQuestionnaireBanner() {
  const container = document.getElementById('q-banner-wrap');
  if (!container) return;

  if (Api.isClubAdmin || !qStreamId || !qStatusVerified || Storage.isQuestionnaireDone()) {
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

// ─────────────────────────────────────────────────────────────────────────
// ОБРАТНАЯ СВЯЗЬ
// ─────────────────────────────────────────────────────────────────────────
let feedbackRating = 0;

function openFeedback() {
  feedbackRating = 0;
  const text = document.getElementById('fb-text');
  if (text) { text.value = ''; }
  const counter = document.getElementById('fb-counter');
  if (counter) counter.textContent = '0';
  document.querySelectorAll('#fb-stars .fb-star').forEach(s => s.classList.remove('fb-star--active'));
  const submit = document.getElementById('fb-submit');
  if (submit) { submit.disabled = true; submit.textContent = 'Отправить'; }
  const formWrap = document.getElementById('feedback-form-wrap');
  const thanks   = document.getElementById('feedback-thanks');
  if (formWrap) formWrap.style.display = '';
  if (thanks)   thanks.style.display = 'none';
  goTo('feedback');
}

function initFeedback() {
  document.getElementById('open-feedback-btn')?.addEventListener('click', openFeedback);

  const stars = document.querySelectorAll('#fb-stars .fb-star');
  stars.forEach(star => {
    star.addEventListener('click', () => {
      feedbackRating = Number(star.dataset.star);
      stars.forEach(s => {
        s.classList.toggle('fb-star--active', Number(s.dataset.star) <= feedbackRating);
      });
      haptic('light');
      updateFeedbackSubmitState();
    });
  });

  const text = document.getElementById('fb-text');
  text?.addEventListener('input', () => {
    const counter = document.getElementById('fb-counter');
    if (counter) counter.textContent = String(text.value.length);
    updateFeedbackSubmitState();
  });

  document.getElementById('fb-submit')?.addEventListener('click', submitFeedback);
}

function updateFeedbackSubmitState() {
  const text = document.getElementById('fb-text');
  const submit = document.getElementById('fb-submit');
  if (!submit) return;
  const hasText = (text?.value || '').trim().length > 0;
  submit.disabled = !hasText;
}

async function submitFeedback() {
  const text = document.getElementById('fb-text');
  const submit = document.getElementById('fb-submit');
  const value = (text?.value || '').trim();
  if (!value) return;

  submit.disabled = true;
  submit.textContent = 'Отправляем…';
  try {
    await Api.sendFeedback({ rating: feedbackRating || null, text: value });
    haptic('medium');
    document.getElementById('feedback-form-wrap').style.display = 'none';
    document.getElementById('feedback-thanks').style.display = '';
  } catch (e) {
    submit.disabled = false;
    submit.textContent = 'Отправить';
    alert('Не удалось отправить отзыв. Попробуйте ещё раз.');
  }
}
