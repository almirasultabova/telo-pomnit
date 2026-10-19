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
const screenFocus = new Map();
let accessibleScreen = null;
function syncScreenAccessibility() {
  const activeScreen = document.querySelector('.screen--active');
  const inviteOpen = document.getElementById('q-invite-sheet')?.classList.contains('active');
  document.querySelectorAll('.screen').forEach(screen => {
    const active = !inviteOpen && screen.classList.contains('screen--active');
    screen.inert = !active;
    if (active) screen.removeAttribute('aria-hidden'); else screen.setAttribute('aria-hidden', 'true');
  });
  if (!inviteOpen && accessibleScreen && activeScreen && accessibleScreen !== activeScreen && !activeScreen.contains(document.activeElement)) {
    activeScreen.tabIndex = -1;
    activeScreen.focus({ preventScroll: true });
  }
  accessibleScreen = activeScreen;
}
function goTo(screenId, back = false) {
  window.MeetingPanel?.invalidate();
  if (Api.clubBlocked) return;
  const prev = document.getElementById('screen-' + currentScreen);
  const next = document.getElementById('screen-' + screenId);
  if (!next || screenId === currentScreen) return;
  if (currentScreen !== 'splash') window.LaunchSplash?.cancel();
  window.QuestionnaireCycle?.leaving(currentScreen);
  if (screenId !== currentScreen) window.ScreenReview?.leave(currentScreen);
  if (currentScreen === 'questionnaire' && !qStatusDone) collectQBlock();
  if (prev?.contains(document.activeElement)) screenFocus.set(currentScreen, document.activeElement);

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
  syncScreenAccessibility();
  const restore = back && screenFocus.get(screenId);
  next.tabIndex = -1;
  (restore?.isConnected && next.contains(restore) ? restore : next).focus({ preventScroll: true });
  if (screenId === 'home' && activeTab === 'main') renderMainTab();
  updateBackBtn();
  AppBoot.done();
}

function goBack() {
  if (window.MeetingPanel?.isOpen()) { window.MeetingPanel.close(); return; }
  if (document.getElementById('q-invite-sheet')?.classList.contains('active')) { closeQInvite(); return; }
  if (currentScreen === 'stream-overview') { closeStreamOverview(); return; }
  if (currentScreen === 'access-admin') { closeAccessManagement(); return; }
  if (currentScreen === 'data-export-preview') { closePrivatePreview(); return; }
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
  if (window.MeetingPanel?.isOpen() || document.getElementById('q-invite-sheet')?.classList.contains('active') || ['data-rights','data-export-preview'].includes(currentScreen) || !Api.clubBlocked && (screenStack.length > 0 || habitualView !== 'summary' && currentScreen === 'home' && activeTab === 'diag')) {
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
  if (id === selectedProgramId) return;
  selectedProgramId = id; heatmapWeek = 0;
  if (activeTab === 'diag') void Storage.ensurePathPeriod(pathPeriodScope());
  checkAndShowQuestionnaire(id);
  renderMyPathTab(); renderNextMeeting(); renderZoomBtn(); renderSchedule(); renderMainTab();
}
function streamStatusHTML() {
  const stream = currentProgram(), period = streamPeriod(stream);
  if (!programAccess) return '<p class="access-notice">Не удалось загрузить период потока. Обновите доступ и расписание в Профиле.</p>';
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
  syncScreenAccessibility();
  const screenObserver = new MutationObserver(() => syncScreenAccessibility());
  document.querySelectorAll('.screen').forEach(screen => screenObserver.observe(screen, { attributes: true, attributeFilter: ['class'] }));
  Storage.subscribe(() => {
    if (Api.clubBlocked || !Api.isAuthed()) return;
    renderDiarySyncStatus();
    if (currentScreen === 'saved') renderSavedScreen();
    if (currentScreen === 'history') renderHistory();
    if (currentScreen === 'home') { renderDiaryTab(); renderMainTab(); }
    if (currentScreen === 'checkin') renderCheckinSyncStatus();
    if (currentScreen === 'checkin-history') renderCheckinHistory();
    if (currentScreen === 'trigger-history') renderTriggerHistory();
    if (activeTab === 'diag') renderMyPathTab();
    if (activeTab === 'profile') renderStats();
  });
  window.addEventListener('online', () => { Storage.flushPending(); Storage.flushCheckinsPending(); Storage.flushTriggersPending(); });
  document.addEventListener('visibilitychange', () => {
    scheduleDiaryDayRefresh();
    if (!document.hidden) {
      if (activeTab === 'diary' && Api.isAuthed() && !Api.clubBlocked) { void Storage.ensureDiaryToday(); renderDiaryTab(); }
      Storage.flushPending(); Storage.flushCheckinsPending(); Storage.flushTriggersPending();
      if (Api.isAuthed() && !Api.clubBlocked) {
        const owner = Api.userId, generation = Api._authGeneration;
        void Api.recordAppVisit().then(() => {
          if (owner === Api.userId && generation === Api._authGeneration && activeTab === 'profile') renderStats();
        }).catch(() => {});
      }
    }
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
        (window.LaunchSplash?.whenVisible() || Promise.resolve()).then(() => setTimeout(showOfferModal, 400));
      }
    }
  }

  // Не задерживаем вход длинной искусственной заставкой.
  const minSplash = new Promise(resolve => setTimeout(resolve, 250));

  let accessDenied = false;
  let accessDeniedCode = null;
  let startupFailed = false;

  const authenticatedInitData = window.Telegram?.WebApp?.initData || '';
  const authFlow = Api.auth()
    .then(async user => {
      homeUser = { id: String(user.id), name: user.name || '', photoUrl: user.photoUrl || null };
      // Api.auth synchronously captures this same signed payload before its request.
      // Use the photo only after server authentication; never initDataUnsafe identity.
      if (authenticatedInitData && authenticatedInitData === window.Telegram?.WebApp?.initData) {
        try {
          const telegramUser = JSON.parse(new URLSearchParams(authenticatedInitData).get('user') || '{}');
          if (typeof telegramUser.photo_url === 'string') homeUser.photoUrl = telegramUser.photo_url;
        } catch {}
      }
      const authenticatedPhoto = homeUser.photoUrl;
      const owner = Api.userId, generation = Api._authGeneration;
      void Api.getMe().then(me => {
        if (Api.userId !== owner || Api._authGeneration !== generation || Api.clubBlocked) return;
        const profile = me?.user || me;
        if (String(profile?.id) === String(owner)) homeUser = { id: String(owner), name: profile.name || user.name || '', photoUrl: authenticatedPhoto || profile.photoUrl || null };
        renderMainTab();
      }).catch(() => {});
      void Storage.initFromApi({ recentCheckins: true, recentDiary: true }).then(() => {
        if (Api.userId !== owner || Api._authGeneration !== generation || Api.clubBlocked) return;
        renderMainTab(); renderDiaryTab();
        if (activeTab === 'diag') renderMyPathTab();
      }).catch(() => {});
      try {
        const [access] = await Promise.allSettled([Api.getAccess()]);
        for (const result of [access]) {
          if (result.status === 'rejected' && result.reason?.code?.startsWith('CLUB_ACCESS_')) throw result.reason;
        }
        if (access.status === 'fulfilled') {
          applyProgramAccess(access.value);
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
      window.LaunchSplash?.ready();
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
  window.MeetingPanel?.invalidate();
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
  if (tab === 'diary')   { void Storage.ensureDiaryToday(); renderDiaryTab(); }
  if (tab === 'diag')    { void Storage.ensurePathPeriod(pathPeriodScope()); renderMyPathTab(); }
  if (tab === 'profile') {renderProfileTab();refreshProgramAccess().then(renderProfileTab);}
  scheduleDiaryDayRefresh();
  updateBackBtn();
}

// Home is a read-only presentation of existing account, access and storage data.
function renderMainTab() {
  const greeting = document.getElementById('home-greeting');
  const flow = document.getElementById('home-stream');
  const observations = document.getElementById('home-observations');
  if (!greeting || !flow || !observations) return;
  const verified = !Api.clubBlocked && Api.isAuthed() && homeUser?.id === String(Api.userId);
  window.SaveStatus?.renderHome();
  const personalName = verified ? homeUser.name.trim() : '';
  greeting.textContent = personalName.split(/\s+/)[0] || 'Здравствуйте';
  const welcome = document.getElementById('home-welcome');
  const avatar = document.getElementById('home-avatar');
  welcome.hidden = !personalName;
  avatar.hidden = !personalName;
  renderVerifiedAvatar(avatar);
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
      await Storage.initFromApi({ fields: failed.filter(kind => Storage.getHistoryLoadStatus()[kind] === 'failed') }); if (String(Api.userId) === String(owner)) renderMainTab();
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
      else { void Storage.ensureCheckinHistory(); renderCheckinHistory(); goTo('checkin-history'); }
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
let diaryDayTimer = null;
function scheduleDiaryDayRefresh() {
  clearTimeout(diaryDayTimer);
  if (activeTab !== 'diary' || document.hidden || !Api.isAuthed() || Api.clubBlocked) return;
  const midnight = Date.parse(Storage.checkinDayKey(new Date())+'T00:00:00+03:00')+86400000;
  diaryDayTimer = setTimeout(() => {
    if (activeTab === 'diary' && Api.isAuthed() && !Api.clubBlocked) { void Storage.ensureDiaryToday(); renderDiaryTab(); }
    scheduleDiaryDayRefresh();
  }, Math.max(250, midnight-Date.now()+50));
}

function renderDiaryTab() {
  if (activeTab === 'diary') window.AfterMeeting?.refresh();
  window.DiscussionNotes?.refresh();
  renderDiarySyncStatus();
  renderAccessNotice();
  renderStreak();
  renderTodayCard();
  renderRecentEntries();
  document.getElementById('diary-history-loading')?.remove();
  if (['idle', 'loading'].includes(Storage.getDiaryTodayStatus())) {
    const notice = document.createElement('p'); notice.id = 'diary-history-loading'; notice.className = 'access-notice'; notice.setAttribute('role', 'status'); notice.textContent = 'Загружаем записи за сегодня…';
    document.querySelector('#tab-diary .screen-scroll')?.prepend(notice);
  }
  renderHistoryLoadWarning(document.querySelector('#tab-diary .screen-scroll'), ['diary'], 'diary');
}

function renderHistoryLoadWarning(container, fields, scope) {
  if (!container) return;
  const id = 'history-load-warning-' + scope;
  document.getElementById(id)?.remove();
  const status = scope === 'path' ? Storage.getPathPeriodStatus(pathPeriodScope()) : Storage.getHistoryLoadStatus?.() || {};
  if (!(scope === 'diary' ? Storage.getDiaryTodayStatus() === 'failed' : fields.some(field => status[field] === 'failed'))) return;
  const panel = document.createElement('div'); panel.id = id; panel.className = 'access-program'; panel.setAttribute('role', 'status');
  const text = document.createElement('p');
  text.textContent = scope === 'diary'
    ? 'Не удалось загрузить все записи за сегодня. Здесь показаны доступные записи с устройства; пустой список ещё не означает, что записей нет.'
    : 'Не удалось обновить историю с сервера. Здесь показаны доступные записи с устройства; пустой список ещё не означает, что записей нет.';
  panel.append(text);
  const retry = document.createElement('button'); retry.className = 'btn btn--outline btn--full'; retry.textContent = 'Повторить загрузку истории';
  retry.onclick = async () => {
    const owner = Storage.key('history_owner'), generation = Storage._generation;
    retry.disabled = true;
    try {
      if (scope === 'diary') await Storage.ensureDiaryToday({ retry: true });
      else if (scope === 'path') await Storage.ensurePathPeriod(pathPeriodScope(), { fields: fields.filter(kind => status[kind] === 'failed'), retry: true });
      else await Storage.initFromApi({ fields: fields.filter(kind => Storage.getHistoryLoadStatus()[kind] === 'failed') });
    } catch {} finally {
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
  const n = Storage.diaryStreakReady() ? Storage.getStreak() : null;
  const el = document.getElementById('streak-num');
  if (el) el.textContent = n === null ? '—' : n;
  const sub = document.getElementById('streak-days-sub');
  if (sub) sub.textContent = n === null ? 'История ещё не загружена' : pluralStreakDays(n);
}

function pluralStreakDays(n) {
  if (n % 10 === 1 && n % 100 !== 11) return 'день подряд';
  if ([2,3,4].includes(n%10) && ![12,13,14].includes(n%100)) return 'дня подряд';
  return 'дней подряд';
}

function renderTodayCard() {
  const container = document.getElementById('today-card');
  if (!container) return;

  const todayEntries = Storage.getTodayEntries();

  if (!todayEntries.length) {
    container.className = 'today-card';
    container.innerHTML = `
      <div class="today-empty">
        <div class="today-empty-title">Почувствовать тело</div>
        <div class="today-empty-sub">${Storage.getDiaryTodayStatus() === 'loaded' ? 'Выберите область тела и ощущение' : 'Записи за сегодня ещё не загружены. Можно добавить новое наблюдение.'}</div>
        <button class="btn btn--primary mt-8" id="start-entry-btn" >
          Начать наблюдение
        </button>
      </div>`;
    document.getElementById('start-entry-btn')?.addEventListener('click', startDiaryEntry);
  } else {
    container.className = 'today-card today-card--done';
    const chips = todayEntries.map(e => {
      const zone = DATA.zones.find(z => z.id === e.zone);
      const time = new Date(e.date).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' });
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
        <button class="btn btn--primary mt-12" id="add-entry-btn" >
          Добавить наблюдение
        </button>
      </div>`;
    document.getElementById('add-entry-btn')?.addEventListener('click', startDiaryEntry);
  }
}

function renderRecentEntries() {
  const container = document.getElementById('recent-entries');
  if (!container) return;
  const entries = Storage.getRecentEntries(3);
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
  const dateStr = date.toLocaleDateString('ru-RU', { timeZone:'Europe/Moscow', day:'numeric', month:'short' });
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

function startDiaryEntry(repairId = null) {
  diarySaveStarted = false;
  draft.zone = null;
  draft.sensations = [];
  draft.note = '';
  bodyMapView = 'front';
  document.getElementById('note-textarea').value = '';
  if (window.ObservationDrafts?.openBody(typeof repairId === 'string' ? repairId : null) === false) return;
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
  if (e.target.closest('#diary-history-btn')) {
    if (!window.DiaryHistory) void Storage.ensureDiaryHistory();
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
const BODY_PLATES = {front:'/media/app/redesign/body-front-owner-lossless.webp',back:'/media/app/redesign/body-back-owner-lossless.webp'};
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
  document.getElementById('zone-info-card')?.classList.add('hidden');
  const continueBtn = document.getElementById('zone-continue-btn');
  if (continueBtn) continueBtn.disabled = true;

  // Sync toggle buttons
  document.getElementById('view-front-btn')?.classList.toggle('view-toggle-btn--active', bodyMapView === 'front');
  document.getElementById('view-back-btn')?.classList.toggle('view-toggle-btn--active', bodyMapView === 'back');
  document.getElementById('view-front-btn')?.setAttribute('aria-pressed',String(bodyMapView === 'front'));
  document.getElementById('view-back-btn')?.setAttribute('aria-pressed',String(bodyMapView === 'back'));
  if (draft.zone) selectZone(draft.zone);
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

  const btn = document.getElementById('sensations-continue-btn');
  if (btn) btn.disabled = !draft.sensations.length;

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
    <button class="sensation-btn${draft.sensations.includes(s.id) ? ' sensation-btn--active' : ''}" data-sensation="${escapeAccessText(s.id)}" aria-pressed="${draft.sensations.includes(s.id)}">
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
      btn.setAttribute('aria-pressed', String(draft.sensations.includes(id)));
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
        existing.setAttribute('aria-pressed','true');
      }
    } else {
      addCustomSensation(label);
      const btn = document.createElement('button');
      btn.className = 'sensation-btn sensation-btn--active';
      btn.setAttribute('aria-pressed','true');
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
    if (!entry.zone || !entry.sensations.length || entry.note.length > 20000) {
      window.ObservationDrafts?.renderBody();
      return;
    }
    const row = window.ObservationDrafts ? window.ObservationDrafts.submitBody(entry) : Storage.saveDiaryEntry(entry);
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
    switchTab('main');
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
    if (row.retryBlocked) {
      document.getElementById('saved-title').textContent = 'Запись не отправлена';
      document.getElementById('saved-sub').textContent = row.rejectedStatus === 409
        ? 'Сервер обнаружил конфликт записи. Исходный текст сохранён; повторная отправка остановлена. Сохраните копию через «Мои данные и приватность».'
        : 'Сервер отклонил запись. Откройте её для исправления; остальные записи продолжают отправляться.';
      document.getElementById('saved-retry-btn').hidden = true;
    }
    document.getElementById('saved-repair-btn')?.remove();
    if (row.retryBlocked && [400, 422].includes(row.rejectedStatus)) {
      const repair = document.createElement('button'); repair.id = 'saved-repair-btn'; repair.className = 'btn btn--outline';
      repair.textContent = 'Исправить запись'; repair.onclick = () => startDiaryEntry(row.clientId);
      document.getElementById('saved-retry-btn').after(repair);
    }
  }
  const streak = Storage.diaryStreakReady() ? Storage.getStreak() : null;
  const el = document.getElementById('saved-streak-num');
  if (el) el.textContent = streak === null ? '—' : streak;
  const sub = document.getElementById('saved-streak-label');
  if (sub) sub.textContent = streak === null ? 'История ещё не загружена' : pluralDays(streak);
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
  retry.hidden = !pending.some(row => !row.retryBlocked);
  for (const row of pending.filter(row => row.retryBlocked)) {
    const text = document.createElement('p');
    text.textContent = row.rejectedStatus === 409 ? 'Есть конфликт записи. Исходный текст сохранён; автоматический повтор остановлен.' : 'Есть отклонённая запись. Откройте её для исправления.';
    container.append(text);
    if ([400, 422].includes(row.rejectedStatus)) {
      const edit = document.createElement('button'); edit.className = 'btn btn--outline btn--sm'; edit.textContent = 'Исправить запись';
      edit.onclick = () => startDiaryEntry(row.clientId); container.append(edit);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// ЭКРАН: ИСТОРИЯ
// ─────────────────────────────────────────────────────────────────────────
function initHistory() {}

function renderHistory() {
  if (window.DiaryHistory) return window.DiaryHistory.refresh();
  renderLocalDiaryHistory();
}
function renderLocalDiaryHistory() {
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
    const key = d.toLocaleDateString('ru-RU', { timeZone:'Europe/Moscow', day:'numeric', month:'long', year:'numeric' });
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

  const analyticsHtml = !streamPeriod() ? '<section class="path-no-stream"><h2>Личные наблюдения</h2><p>Чтобы увидеть наблюдения и динамику за поток, выберите доступный поток. Все ваши записи остаются в Дневнике.</p></section>' : renderStreamSummary(entries) + (entries.length
    ? renderMirrorCard(entries) +
      renderHeatmapSection(entries) +
      renderTopSensations(entries) +
      renderRecentNotes(entries) +
      renderPathStats(entries)
    : `<div class="mypath-empty">
        <div class="mypath-empty-title">Наблюдения этого потока</div>
        <div class="mypath-empty-sub">Здесь появятся области тела и ощущения из ваших записей. Можно начать с того, что вы чувствуете сейчас.</div><button class="btn btn--accent" id="path-first-observation" type="button">Почувствовать тело</button>
      </div>`);

  const diaryStatus = Storage.getPathPeriodStatus(pathPeriodScope()).diary;
  const shownAnalytics = !streamPeriod() || diaryStatus === 'loaded' ? analyticsHtml : '<section class="path-no-stream"><p role="status">' + (diaryStatus === 'failed' ? 'Не удалось обновить наблюдения. Сохранённые записи доступны в Дневнике.' : 'Загружаем наблюдения выбранного потока…') + '</p></section>';
  container.innerHTML = renderCheckinChart() + programPickerHTML() + streamStatusHTML() +
    `<button type="button" class="path-program-link" id="path-program-btn"><span>Мой поток</span><small>${Api.userRole === 'HOST' || Api.isClubAdmin ? 'Расписание' : 'Анкета и расписание'} · в Профиле →</small></button>` +
    '<section class="path-questionnaire" aria-label="Опрос привычных реакций">' + renderDiagBlock(diagResult) + '</section>' +
    '<section class="path-analysis" aria-label="Личные наблюдения">' + shownAnalytics + '</section>';
  renderHistoryLoadWarning(container, ['diary'], 'path');
  window.PathDynamics?.bind(container, { context: pathDynamicsContext, checkin: () => document.getElementById('main-state-btn')?.click(), retry: button => refreshPathDynamics(button, false), sync: button => refreshPathDynamics(button, true) });
  container.querySelector('#path-first-observation')?.addEventListener('click',()=>document.getElementById('main-body-btn')?.click());
  container.querySelector('#path-first-checkin')?.addEventListener('click',()=>document.getElementById('main-state-btn')?.click());
  container.querySelector('#path-stream-select')?.addEventListener('change', event => selectProgram(event.target.value));
  container.querySelector('#path-program-btn')?.addEventListener('click', () => switchTab('profile'));

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
  if (!result) return `<div class="diag-invite"><div class="diag-invite-title">Привычная реакция</div>
    <p>Иногда ответ или действие появляются раньше, чем мы успеваем выбрать их. Опрос поможет заметить, какие реакции вы чаще отмечаете у себя, и найти слова для описания своего опыта.</p>
    <p>16 коротких утверждений. Отвечайте о том, как бывает у вас обычно в разных жизненных обстоятельствах. Если оценить трудно, можно так и ответить. Здесь нет правильных ответов.</p>
    <button class="btn btn--primary btn--full" onclick="startDiag()">${draft ? 'Продолжить опрос' : 'Начать опрос'}</button></div>${habitualLegacyHTML()}`;
  const m = Habitual.message(result);
  const examples = Habitual.items.filter((q, i) => q.group === result.leadingGroup && result.answers[i] >= 3 && result.answers[i] <= 4).slice(0, 2);
  const summaryName = result.leadingGroup ? Habitual.descriptions[result.leadingGroup].name : m.title;
  return `<div class="diag-result-card"><h2 class="habitual-summary-label">Привычная реакция</h2><div class="diag-result-name">${escapeAccessText(summaryName)}</div><details class="habitual-result-disclosure" ${result.syncStatus !== 'synced' ? 'open' : ''}><summary>Подробнее о результате</summary><p>${escapeAccessText(m.text)}</p>
    ${result.tiedGroups.length ? `<p>${result.tiedGroups.map(g => escapeAccessText(Habitual.descriptions[g].name)).join(' · ')}</p>` : ''}
    ${examples.length ? `<div class="diag-result-section-title">Вы отмечали</div><ul>${examples.map(q => `<li>${escapeAccessText(q.text)}</li>`).join('')}</ul>` : result.leadingGroup ? '<p>Среди предложенных реакций эту вы отмечали чаще других, хотя не обязательно часто.</p>' : ''}
    ${m.observe ? `<p>${escapeAccessText(m.observe)}</p>` : ''}
    <p class="habitual-note">Опрос помогает наблюдать за привычными реакциями. Он не устанавливает диагноз и не объясняет причины телесных симптомов.</p>
    <p role="status">${result.syncStatus === 'synced' ? 'Ответы сохранены в вашем аккаунте.' : habitualDurable() ? 'Ответы сохранены на устройстве. Сервер ещё не подтвердил сохранение.' : 'Сервер ещё не подтвердил сохранение. Ответы доступны в этом открытом приложении; после закрытия они могут потеряться.'}</p>
    ${result.syncStatus !== 'synced' ? '<button class="diag-result-retry" onclick="retryHabitualSave(this)">Повторить сохранение</button>' : ''}
    <button class="diag-result-retry" onclick="showHabitualAnswers()">Посмотреть свои ответы</button>
    ${result.state === 'incomplete' ? '<button class="diag-result-retry" onclick="startDiag(true)">Вернуться к вопросам</button>' : ''}
    ${draft ? '<button class="diag-result-retry" onclick="startDiag()">Продолжить начатый опрос</button>' : ''}
    <button class="diag-result-retry" onclick="startDiag(false, true)">Пройти заново</button></details></div>${habitualLegacyHTML()}`;
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
    return `<button class="hmap-week-btn${active}" data-week="${w}" aria-pressed="${heatmapWeek === w}">${label}</button>`;
  }).join('');

  return `<div class="section-label mt-16 mb-4">Карта ощущений</div>
    <p class="hmap-description">Области тела, которые вы отмечали в дневнике. Числа — количество записей за выбранный период.</p>
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
function pathPeriodScope() {
  const period = streamPeriod();
  return period ? { id: selectedProgramId, start: period.start, end: period.end } : null;
}
function pathDynamicsContext() {
  const allowed = !Api.clubBlocked && Api.isAuthed() && Api.userId === Storage._userId;
  return { allowed, scope: [Storage._userId, Storage._generation, selectedProgramId].join(':'),
    stream: currentProgram(), period: streamPeriod(), now: programNow(), scales: CHECKIN_SCALES,
    rows: allowed ? selectedCheckins() : [], loadState: Storage.getPathPeriodStatus(pathPeriodScope()).checkins };
}
function renderCheckinChart() {
  return window.PathDynamics?.render(pathDynamicsContext()) || '';
}
async function refreshPathDynamics(button, syncOnly) {
  const owner = Storage._userId, generation = Storage._generation, scope = pathDynamicsContext().scope;
  if (!pathDynamicsContext().allowed || button?.disabled) return;
  if (button) button.disabled = true;
  try {
    if (syncOnly) await Storage.flushCheckinsPending();
    else await Storage.ensurePathPeriod(pathPeriodScope(), { fields: ['checkins'], retry: true, refresh: true });
  } catch {} finally {
    const current = owner === Storage._userId && generation === Storage._generation && scope === pathDynamicsContext().scope && !Api.clubBlocked && Api.isAuthed();
    if (current && button?.isConnected) button.disabled = false;
    if (current && currentScreen === 'home' && activeTab === 'diag') renderMyPathTab();
  }
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
  renderAccessManagementEntry();
  renderStreamOverviewEntry();
  window.ScreenReview?.renderEntry();
}

let programRefreshError = false;
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
  programRefreshError=false;
  programAccess=access;
  const serverTime = Date.parse(access.serverTime);
  programClock = Number.isFinite(serverTime) ? { server: serverTime, received: Date.now() } : null;
  aiAccessGranted=access.ai?.canWrite === true;
  if(!access.streams?.some(s=>s.id===selectedProgramId)) selectedProgramId=(access.streams?.find(s=>s.canAttend)||access.streams?.find(s=>s.phase==='upcoming')||access.streams?.[0])?.id || null;
  heatmapWeek = 0;
  renderAccessNotice();
  renderMainTab();
  if (activeTab === 'diag') { void Storage.ensurePathPeriod(pathPeriodScope()); renderMyPathTab(); }
  checkAndShowQuestionnaire(selectedProgramId);
  window.MeetingPanel?.sync();
}
function renderAccessNotice() {
  const text=aiQuestionnaireSaved() ? 'Анкета отправлена. Обновите доступ к AI-ассистенту.' : programAccess?.ai?.message || 'Не удалось проверить доступ к AI. Дневник и реакции остаются доступны.';
  const aiNotice=document.getElementById('ai-access-notice');
  if(aiNotice) aiNotice.textContent=text;
  const questionnaireButton=document.getElementById('ai-questionnaire-btn');
  if(questionnaireButton) {
    questionnaireButton.hidden=programAccess?.ai?.reason !== 'questionnaire_required';
    questionnaireButton.textContent=aiQuestionnaireSaved() ? 'Обновить доступ к AI' : 'Заполнить анкету';
  }
  const button=document.getElementById('ai-chat-btn');
  if(button) {
    let note=document.getElementById('diary-access-notice');
    if(!note){note=document.createElement('p');note.id='diary-access-notice';note.className='access-notice';button.after(note);}
    note.textContent=text; note.hidden=programAccess?.ai?.canWrite === true;
  }
}
function currentProgram(){return programAccess?.streams?.find(s=>s.id===selectedProgramId);}
function aiQuestionnaireSaved() {
  return programAccess?.ai?.reason === 'questionnaire_required' && qStatusVerified && qStatusDone &&
    qStreamId === programAccess.ai.questionnaireStreamId && Api.userId === qStatusIdentity?.owner && Api._authGeneration === qStatusIdentity?.generation;
}
async function refreshProgramAccess(){
  const owner=Api.userId,generation=Api._authGeneration;
  try {
    const access=await Api.getAccess();
    if(owner===Api.userId && generation===Api._authGeneration && !Api.clubBlocked)applyProgramAccess(access);
  } catch {
    if(owner!==Api.userId || generation!==Api._authGeneration || Api.clubBlocked)return;
    programRefreshError=true;
    if(!programAccess){aiAccessGranted=null;checkAndShowQuestionnaire(null);renderAccessNotice();}
    renderMainTab();
  }
}
function renderNextMeeting(){
  const el=document.getElementById('next-meeting-card');
  if(!el)return;
  const streams=programAccess?.streams||[];
  el.replaceChildren();
  window.StreamStatePanel?.clear();
  if(programRefreshError && programAccess){const notice=document.createElement('p');notice.className='program-status';notice.setAttribute('role','status');notice.textContent='Не удалось обновить расписание. Показаны последние загруженные данные.';el.append(notice);}
  if(!programAccess){
    const p=document.createElement('p');p.className='program-status';p.textContent='Не удалось загрузить поток и расписание.';el.append(p);
  }else if(!streams.length){
    const p=document.createElement('p');p.className='program-status';p.textContent='Сейчас вам не открыт поток. Личные наблюдения доступны в Дневнике.';el.append(p);
  }else{
    const stream=currentProgram();
    if(stream){
      const phase=stream.phase||streamState(stream);
      const feature=document.createElement('section');feature.className='profile-stream-feature';feature.setAttribute('aria-label','Ваш поток');
      const state=document.createElement('p');state.className='profile-stream-state';
      state.textContent=phase==='upcoming'?'Начнётся скоро':phase==='current'?'Вы участвуете':'Поток завершён';feature.append(state);
      const name=document.createElement('h3');name.textContent=stream.name;feature.append(name);
      const next=(stream.meetings||[]).filter(m=>Number.isFinite(Date.parse(m.date))&&Date.parse(m.date)>=programNow()).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date))[0];
      if(next&&['upcoming','current'].includes(phase)){
        const date=document.createElement('time');date.dateTime=next.date;date.textContent=accessDate(next.date)+' · МСК';feature.append(date);
        const topic=document.createElement('p');topic.className='profile-stream-topic';topic.textContent=next.topic||'Ближайшая встреча';feature.append(topic);
      }else{
        const note=document.createElement('p');note.textContent=phase==='completed'?'Ваши личные наблюдения сохранены в Дневнике.':'Расписание встреч появится здесь.';feature.append(note);
      }
      const owner=Api.userId,generation=Api._authGeneration,streamId=stream.id;
      const panel=window.StreamStatePanel?.render({stream:{...stream,phase},now:programNow,refreshAccess:()=>refreshProgramAccess().then(renderProfileTab),
        aiAvailable:programAccess.ai?.canWrite===true,serviceAccess:['host','admin'].includes(programAccess.ai?.reason),
        isCurrent:()=>Api.isAuthed() && !Api.clubBlocked && Api.userId===owner && Api._authGeneration===generation && currentProgram()?.id===streamId,
        openTab:switchTab,appendLink:appendAccessLink,
        postState:()=>window.QuestionnaireCycle?.getPostState(),openSummary:()=>window.QuestionnaireCycle?.openSummary(),
        openAi:history=>{document.getElementById('ai-chat-btn')?.click();if(history){const details=document.querySelector('.ai-history-disclosure');if(details)details.open=true;}}
      });
      el.append(panel||feature);
    }
    if(streams.length>1){
      const label=document.createElement('label');label.textContent='Ваши потоки';label.htmlFor='owned-stream-select';el.append(label);
      const select=document.createElement('select');select.id='owned-stream-select';select.className='access-select';
      streams.forEach(stream=>{const option=document.createElement('option');option.value=stream.id;option.textContent=stream.name+(streamState(stream)==='completed'?' · завершён':'');select.append(option);});
      select.value=selectedProgramId;select.addEventListener('change',()=>selectProgram(select.value));el.prepend(label,select);
    }
  }
  const refresh=document.createElement('button');refresh.className='btn btn--ghost btn--sm program-refresh';refresh.textContent='Обновить расписание';
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
  const item=(label,url,available,explanation)=>{
    if(available&&url){appendAccessLink(container,url,label);return;}
    const status=document.createElement('div');status.className='program-link-status';
    const title=document.createElement('span');title.textContent=label;
    const text=document.createElement('small');text.textContent=explanation;status.append(title,text);container.append(status);
  };
  const phase=stream.phase||streamState(stream);
  item('Чат группы',stream.chatLink,stream.canReadRecordings,stream.canReadRecordings&&!stream.chatLink?'Ссылка на чат ещё не добавлена':phase==='upcoming'?'Откроется с началом потока':phase==='completed'?'Доступ к чату этого потока закрыт':'Доступ к чату сейчас закрыт');
  item('Присоединиться в Zoom',stream.zoomLink,stream.canAttend,stream.canAttend&&!stream.zoomLink?'Ссылка на встречу ещё не добавлена':phase==='upcoming'?'Вход откроется с началом потока':phase==='completed'?'Встречи этого потока завершены':'Вход на встречу сейчас закрыт');
}
function renderProgramMeetingBody(body,stream,meeting){
      const timeOnly=/^\d{1,2}:\d{2}[–—-]\d{1,2}:\d{2} МСК$/.test(meeting.description||'');
      const description=meeting.description&&!timeOnly?meeting.description:meeting.topic==='Психосоматические разборы'?'Анастасия ведёт психосоматические разборы. Разбор каждой участницы проходит в группе по очереди.':meeting.topic==='Телесная практика'?'Практика проходит в прямом эфире. Анастасия объясняет последовательность и сопровождает процесс.':null;
      if(timeOnly){const duration=document.createElement('p');duration.className='program-meeting-duration';duration.textContent=meeting.description;body.append(duration);}
      const sections=[['О встрече',description||'Описание этой встречи ещё не добавлено.']];
      if(typeof meeting.prepare==='string'&&meeting.prepare.trim())sections.push(['Подготовка',meeting.prepare.trim()]);
      for(const [label,text] of sections){
        const heading=document.createElement('h3');heading.textContent=label;const p=document.createElement('p');p.textContent=text;body.append(heading,p);
      }
      if(stream.canAttend)appendAccessLink(body,meeting.zoomLink||stream.zoomLink,'Присоединиться в Zoom');
}
function renderSchedule(){
  const container=document.getElementById('schedule-section');if(!container)return;
  const stream=currentProgram();container.replaceChildren();
  const calendar=document.getElementById('program-calendar');
  if(calendar){
    const scope=[Api.userId,Api._authGeneration,stream?.id].join(':');
    calendar.hidden=!stream;
    if(calendar.dataset.scope!==scope){calendar.open=!document.querySelector('.profile-program--state');calendar.dataset.scope=scope;}
    document.getElementById('program-calendar-title').textContent=stream?.phase==='completed'?'Прошедшие встречи':'Расписание встреч';
  }
  if(stream){
    const heading=document.createElement('h2');heading.className='schedule-title';heading.textContent='Встречи потока';container.append(heading);
    (stream.meetings||[]).forEach(meeting=>{
      const row=document.createElement('div');row.className='program-meeting-row';
      const button=document.createElement('button');button.type='button';button.className='program-meeting-link';button.dataset.programMeeting=String(meeting.id);button.setAttribute('aria-haspopup','dialog');
      const copy=document.createElement('span');copy.className='program-meeting-copy';
      const date=document.createElement('time');date.className='meeting-summary-date';date.dateTime=meeting.date;date.textContent=accessDate(meeting.date)+' · МСК';
      const topic=document.createElement('span');topic.className='meeting-summary-topic';topic.textContent=meeting.topic||'Встреча '+meeting.number;copy.append(date,topic);
      if(Storage.isAttended(meeting.id)){const status=document.createElement('span');status.className='program-meeting-status';status.textContent='Участвовала';copy.append(status);}
      const arrow=document.createElementNS('http://www.w3.org/2000/svg','svg');arrow.setAttribute('viewBox','0 0 24 24');arrow.setAttribute('fill','none');arrow.setAttribute('stroke','currentColor');arrow.setAttribute('stroke-width','1.6');arrow.setAttribute('aria-hidden','true');arrow.innerHTML='<path d="m9 5 7 7-7 7"/>';
      button.append(copy,arrow);button.onclick=()=>window.MeetingPanel.open(meeting.id);row.append(button);container.append(row);
    });
    if(!stream.meetings?.length){const p=document.createElement('p');p.className='program-status';p.textContent='Расписание вашего потока уточняется.';container.append(p);}
  }
  window.MeetingPanel?.sync();
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

  container.innerHTML = DATA.program.hosts.map(original => { const h={...original,tg:original.tg || (original.name==='Альмира Султанова'?'https://t.me/almira_sultanova':original.name==='Анастасия Костылева'?'https://t.me/akhoroshavtseva':null)}; return `
    <div class="host-card-mini">
      <div class="host-avatar-mini">
        ${h.photo
          ? `<img src="${h.photo}" alt="${h.name}" class="host-avatar-img" onerror="this.parentElement.innerHTML='${h.initial}'">`
          : h.initial}
      </div>
      <div>
        <div class="host-name-mini">${h.tg ? `<a href="${h.tg}" data-tg-link="${h.tg}">${h.name}</a>` : h.name}</div>
      </div>
      ${h.tg ? `<a class="host-tg-link" href="${h.tg}" data-tg-link="${h.tg}" aria-label="Написать ${h.name}">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/></svg>
      </a>` : ''}
    </div>`;}).join('');
}

function renderVerifiedAvatar(container) {
  if (!container) return;
  container.replaceChildren();
  const fallback = () => { container.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg>'; };
  fallback();
  const verified = !Api.clubBlocked && Api.isAuthed() && homeUser?.id === String(Api.userId);
  if (!verified || typeof homeUser.photoUrl !== 'string') return;
  let url;
  try { url = new URL(homeUser.photoUrl); } catch { return; }
  if (url.protocol !== 'https:' || url.username || url.password) return;
  const image = document.createElement('img'); image.alt = ''; image.referrerPolicy = 'no-referrer'; image.src = url.href;
  image.onerror = () => { if (container.contains(image)) fallback(); };
  container.replaceChildren(image);
}

function renderUserCard() {
  const container = document.getElementById('profile-user-card');
  if (!container) return;

  const verified = !Api.clubBlocked && Api.isAuthed() && homeUser?.id === String(Api.userId);
  const name = verified && homeUser.name.trim() ? homeUser.name.trim() : 'Участница';
  container.innerHTML = `
    <div class="profile-avatar" aria-hidden="true"></div>
    <div>
      <div class="profile-name">${escapeAccessText(name)}</div>
    </div>`;
  renderVerifiedAvatar(container.querySelector('.profile-avatar'));
}

let profileStatsRequest = 0;
function renderStats() {
  const container = document.getElementById('profile-stats');
  if (!container) return;
  const owner = Api.userId, generation = Api._authGeneration, ticket = ++profileStatsRequest;
  const paint = (streak, total) => {
    const observationLabel = total === null ? 'сохранённых<br>наблюдений'
      : total % 100 >= 11 && total % 100 <= 14 ? 'сохранённых<br>наблюдений'
      : total % 10 === 1 ? 'сохранённое<br>наблюдение'
      : [2, 3, 4].includes(total % 10) ? 'сохранённых<br>наблюдения' : 'сохранённых<br>наблюдений';
    container.innerHTML = `
      <div class="stat-box">
        <span class="profile-stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><use href="/media/app/icons/lucide.svg#chart-no-axes-column-increasing"/></svg></span>
        <div class="stat-box-num">${streak === null ? '—' : streak}</div>
        <div class="stat-box-label">${streak === null ? 'дней подряд' : pluralStreakDays(streak)}</div>
      </div>
      <div class="stat-box">
        <span class="profile-stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><use href="/media/app/icons/lucide.svg#notebook-pen"/></svg></span>
        <div class="stat-box-num">${total === null ? '—' : total}</div>
        <div class="stat-box-label">${observationLabel}</div>
      </div>`;
  };
  paint(null, null);
  if (!owner || !Api.isAuthed()) return;
  const current = () => ticket === profileStatsRequest && Api.userId === owner && Api._authGeneration === generation && !Api.clubBlocked;
  Api.getProfileStats().then(stats => {
    if (!current()) return;
    if (![stats?.visitStreak, stats?.savedObservations].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('Invalid profile statistics');
    paint(stats.visitStreak, stats.savedObservations);
  }).catch(() => {
    if (!current()) return;
    const retry = document.createElement('button');
    retry.type = 'button'; retry.className = 'profile-stats-retry';
    retry.textContent = 'Обновить цифры'; retry.onclick = renderStats; container.append(retry);
  });
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
  window.LaunchSplash?.cancel();
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
        <div class="access-denied-message" style="font-size:15px;color:var(--color-muted);line-height:1.6;">${club ? message+'<br>Это закрытое приложение для одобренного круга участниц.' : code === 'SESSION_EXPIRED' ? 'Сессия завершилась. Откройте приложение заново через бота.' : 'У вас нет доступа к приложению.'}</div>
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
  const actions = document.getElementById('profile-account-actions');
  if (actions) actions.append(button); else if (stats) stats.after(button); else container.append(button);
}
function ensureDataRightsScreen() {
  if (document.getElementById('screen-data-rights')) return;
  const screen = document.createElement('div'); screen.id = 'screen-data-rights'; screen.className = 'screen';
  screen.innerHTML = `<div class="screen-header"><div class="screen-title">Мои данные и приватность</div><button class="screen-header-btn" id="data-rights-close">Назад</button></div><div class="screen-scroll" style="padding:16px;padding-bottom:32px"><p class="access-notice">Здесь можно сохранить дневник или управлять личными данными.</p><p><a href="https://www.telo-pomnit.ru/privacy.html" target="_blank" rel="noopener">Политика обработки данных</a> · <a href="https://www.telo-pomnit.ru/offer.html" target="_blank" rel="noopener">Условия программы</a></p><p id="data-rights-status" role="status">Проверяем владельца данных…</p><button id="data-rights-retry" class="btn btn--outline btn--full mb-8" hidden>Повторить загрузку</button><div id="data-rights-actions" hidden><button id="data-export-pdf" class="btn btn--primary btn--full mb-8">Скачать дневник</button><p class="data-export-caption">PDF с сохранённой историей наблюдений.</p><details class="data-additional"><summary>Дополнительные действия с данными</summary><p>Полная копия включает записи, анкеты и диалоги. Она сохраняется в формате JSON для переноса и резервного хранения.</p><button id="data-export-json" class="btn btn--outline btn--full mb-8">Получить полную копию данных</button><button id="data-export-local" class="btn btn--outline btn--full mb-8">Сохранить записи, ожидающие отправки</button><p class="access-notice">Неотправленные записи и черновики хранятся на этом устройстве и не входят в скачанный дневник.</p></details><button id="data-delete-start" class="btn btn--outline btn--full">Удалить аккаунт и личные записи</button><div id="data-delete-confirm" hidden><p>Вы удалите аккаунт приложения и его личные записи: дневник, оценки состояния, реакции, анкеты, ответы и разговоры с AI. Ещё не отправленные записи и черновики этого аккаунта на устройстве тоже удалятся. Отменить действие нельзя. При необходимости сначала скачайте свои данные. Просто закрыть приложение можно без удаления — все сохранённые записи останутся.</p><p>Необходимые сведения об оплатах и отметка о закрытом аккаунте останутся. Данные в резервных копиях не исчезают сразу; сроки их очистки уточняются.</p><label for="data-delete-phrase">Введите УДАЛИТЬ МОИ ДАННЫЕ</label><input id="data-delete-phrase" class="ai-input" autocomplete="off"><button id="data-delete-submit" class="btn btn--outline btn--full" disabled>Удалить аккаунт и записи навсегда</button><button id="data-delete-cancel" class="btn btn--ghost btn--full">Отмена</button></div></div></div>`;
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
    retry.hidden=true; status.textContent = DataRightsApi.accountDeleted ? 'Аккаунт приложения и личные записи удалены. Сведения об оплатах и отметка о закрытом аккаунте остаются. Данные в резервных копиях не исчезают сразу.' : 'Ваши данные доступны только вам.';
    document.getElementById('data-rights-actions').hidden = false;
    document.getElementById('data-export-local').hidden = DataRightsApi.accountDeleted;
    document.getElementById('data-export-pdf').hidden = DataRightsApi.accountDeleted;
    document.getElementById('data-delete-start').hidden = DataRightsApi.accountDeleted;
  } catch { if (request === rightsRequest) {retry.hidden=false;status.textContent = 'Не удалось загрузить данные. Откройте приложение через Telegram-бота и повторите.';} }
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
      document.getElementById('data-rights-retry').hidden=false;
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
function closePrivatePreview() {
  const preview=document.getElementById('screen-data-export-preview');
  if(screenStack[screenStack.length-1]==='data-rights') screenStack.pop();
  if(Api.clubBlocked) {document.querySelectorAll('.screen').forEach(el=>el.classList.remove('screen--active','screen--enter','screen--exit'));document.getElementById('screen-data-rights').classList.add('screen--active');currentScreen='data-rights';syncTelegramBackNavigation();}
  else goTo('data-rights',true); preview?.remove();
}
function savePrivateFile(contents,type,filename) {
  const url=URL.createObjectURL(new Blob([contents],{type}));
  const link=document.createElement('a');link.href=url;link.download=filename;link.rel='noopener noreferrer';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function downloadPrivateFile(contents,type,filename) {
  if(type!=='application/json') {savePrivateFile(contents,type,filename);return;}
  document.getElementById('screen-data-export-preview')?.remove();
  const screen=document.createElement('div');screen.id='screen-data-export-preview';screen.className='screen';
  screen.innerHTML='<div class="screen-header"><div class="screen-title">Копия данных</div><button class="screen-header-btn" id="private-preview-close">Назад</button></div><div class="screen-scroll"><p>Это ваша личная копия. Сохраните файл, если он вам нужен.</p><button id="private-preview-save" class="btn btn--primary btn--full">Сохранить файл</button><details class="data-additional"><summary>Посмотреть содержимое</summary><pre class="private-preview-content"></pre></details></div>';
  screen.querySelector('pre').textContent=contents; document.body.append(screen);
  const owner=DataRightsApi.userId,generation=Storage._generation;
  screen.querySelector('#private-preview-close').onclick=closePrivatePreview;
  screen.querySelector('#private-preview-save').onclick=()=>{if(owner===DataRightsApi.userId&&generation===Storage._generation)savePrivateFile(contents,type,filename);};
  if(Api.clubBlocked) {document.getElementById('screen-data-rights').classList.remove('screen--active');screen.classList.add('screen--active');screenStack.push('data-rights');currentScreen='data-export-preview';syncTelegramBackNavigation();}
  else goTo('data-export-preview');
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
let aiSendError = '';
function ensureAiDraftScope() {
  const scope = Storage._userId ? Storage._userId + ':' + (aiSessionId || 'new') : null;
  if (scope === aiDraftScope) return;
  aiSendError = ''; aiDraftScope = scope; aiDraftDurable = scope ? Storage.isAiDraftPersistent(aiSessionId) : true;
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
  status.hidden = !text && !aiPending && !aiSendError;
  status.textContent = aiPending ? 'Отправляем сообщение. Ожидаем ответ AI…' : aiSendError || (aiDraftDurable ? 'Черновик сохранён на этом устройстве. Он не отправляется сам.' : 'Черновик не сохранён на устройстве. Не закрывайте приложение: текст пока только в этом окне.');
  window.AiDelivery?.render();
}
function clearPrivateConversationState() {
  window.MeetingPanel?.invalidate();
  window.SaveStatus?.invalidate();
  window.PathDynamics?.reset();
  window.StreamStatePanel?.clear();
  document.querySelector?.('.path-dynamics')?.remove();
  clearAccessManagementState();
  document.getElementById('screen-data-export-preview')?.remove();
  homeUser = null;
  renderMainTab();
  aiScreenRequest++; aiSessionId = null; aiMessages = []; aiPending = false; aiSendError = '';
  aiContext = { mode: 'none', ids: [], preview: null, reviewed: false };
  aiContextLoadRequest++; aiContextLoadState = 'idle';
  aiContextCandidates = []; aiSessionContext = null; aiContextLoading = false; aiDraftScope = null; aiDraftDurable = true;
  clearPreparedDiaryPdf();
  const input = document.getElementById('ai-input'); if (input) input.value = '';
  document.getElementById('ai-messages')?.replaceChildren();
}
function syncAiViewport() {
  const viewport=window.visualViewport;
  document.documentElement.style.setProperty('--ai-viewport-height',(viewport?.height || window.innerHeight)+'px');
  document.documentElement.style.setProperty('--ai-viewport-top',(viewport?.offsetTop || 0)+'px');
}
function initAiChat() {
  window.visualViewport?.addEventListener('resize',syncAiViewport);
  window.visualViewport?.addEventListener('scroll',syncAiViewport);
  window.addEventListener('resize',syncAiViewport); syncAiViewport();
  document.getElementById('ai-send-btn')?.addEventListener('click', sendAiMessage);
  const input = document.getElementById('ai-input');
  input?.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendAiMessage(); } });
  input?.addEventListener('input', () => { aiSendError = ''; input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 100) + 'px'; saveCurrentAiDraft(); });
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
    sessions.forEach(session => select.add(new Option(window.AiDelivery.label(session), session.sessionId)));
    select.value = aiSessionId || '';
  } catch { document.getElementById('ai-access-notice').textContent += ' Историю не удалось загрузить — можно повторить.'; }
}
document.getElementById('ai-access-refresh')?.addEventListener('click', refreshAiScreen);
document.getElementById('ai-questionnaire-btn')?.addEventListener('click', async () => {
  if (aiQuestionnaireSaved()) { await refreshAiScreen(); return; }
  const streamId = programAccess?.ai?.questionnaireStreamId;
  if (!streamId || Api.clubBlocked) return;
  selectProgram(streamId);
  await checkAndShowQuestionnaire(streamId);
  openQuestionnaire();
});
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
  if (bar) bar.style.display = programAccess?.ai?.reason === 'questionnaire_required' ? 'none' : aiAccessGranted === true || document.getElementById('ai-input')?.value ? '' : 'none';
  document.getElementById('ai-send-btn').disabled = aiPending || aiAccessGranted !== true || !aiContextReady();
  window.AiDelivery?.render();
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
  const disclosure = document.createElement('p'); disclosure.className='ai-disclosure'; disclosure.textContent = 'Сообщения обрабатывает OpenAI. Дневник добавляется только с вашего разрешения.'; panel.append(disclosure);
  const information=document.createElement('details');information.className='ai-information';const summary=document.createElement('summary');summary.textContent='О чате и ваших данных';information.append(summary);panel.append(information);
  const limits = document.createElement('p'); limits.textContent = 'Здесь можно обсудить наблюдение или разобрать ситуацию. Отвечает AI: он может ошибаться, не ставит диагнозы и не заменяет помощь специалиста. Если помощь нужна сейчас, обратитесь к человеку — AI не вызывает помощь. Ведущие этот разговор не получают.'; information.append(limits);
  const contact = document.createElement('a'); contact.href = 'https://t.me/almira_sultanova'; contact.target = '_blank'; contact.rel = 'noopener noreferrer'; contact.dataset.tgLink = contact.href; contact.className = 'consent-link'; contact.style.display = 'block'; contact.style.marginBottom = '12px'; contact.textContent = 'Написать Альмире'; contact.id = 'ai-contact-host'; information.append(contact);
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
    if (aiContext.mode === 'none') { const status = document.createElement('p'); status.id = 'ai-context-status'; status.textContent = 'Дневник не добавлен. AI увидит сообщения этого разговора.'; panel.append(status); }
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
        review.onchange = () => { aiContext.reviewed = review.checked; document.getElementById('ai-send-btn').disabled = aiPending || aiAccessGranted !== true || !aiContextReady();
  window.AiDelivery?.render(); };
        const reviewText = document.createElement('span'); reviewText.textContent = 'Я просмотрела записи и разрешаю использовать их в этом разговоре с OpenAI.'; reviewLabel.append(review, reviewText); panel.append(reviewLabel);
      }
    }
  }
  container.append(panel);
}
function renderAiMessages() {
  const container = document.getElementById('ai-messages'); if (!container) return; syncAiViewport();
  const previousScroll = container.scrollTop; container.replaceChildren();
  if (programAccess?.ai?.reason !== 'questionnaire_required' || aiSessionId) renderAiContext(container);
  if (!aiMessages.length && programAccess?.ai?.reason !== 'questionnaire_required') { const welcome = document.createElement('p'); welcome.className = 'ai-welcome-text'; welcome.textContent = aiAccessGranted === true ? 'Можно начать с того, что вы сейчас замечаете в теле, чувствах или мыслях. Что хочется обсудить?' : 'Здесь можно читать сохранённые диалоги. Для нового сообщения нужен действующий доступ к AI.'; container.append(welcome); }
  aiMessages.forEach(message => { const row = document.createElement('div'); row.className = 'ai-msg ai-msg--' + (message.role === 'user' ? 'user' : 'assistant'); const text = document.createElement('div'); text.className = 'ai-msg-text'; text.textContent = String(message.content || ''); row.append(text); container.append(row); });
  container.scrollTop = aiSessionId ? container.scrollHeight : previousScroll;
}
async function sendAiMessage() { return window.AiDelivery.send(); }

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
    if (Storage.getHistoryLoadStatus().triggers === 'idle') void Storage.loadTriggerHistory().catch(() => {});
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
  document.querySelectorAll('.reaction-card--selected').forEach(el => { el.classList.remove('reaction-card--selected'); el.setAttribute('aria-pressed', 'false'); });
  document.querySelectorAll('.zone-chip--selected').forEach(el => { el.classList.remove('zone-chip--selected'); el.setAttribute('aria-pressed', 'false'); });
  document.querySelectorAll('#trigger-sensations-grid .checklist-item--selected').forEach(el => { el.classList.remove('checklist-item--selected'); el.setAttribute('aria-checked', 'false'); });

  updateTriggerSaveBtn();
  window.ObservationDrafts?.openReaction();
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
    return `<button class="reaction-card" data-reaction="${id}" aria-pressed="false" style="--reaction-color:${p.color}; --reaction-bg:${p.colorLight}">
      <span class="reaction-card-emoji">${p.emoji}</span>
      <span class="reaction-card-name">${p.name}</span>
      <span class="reaction-card-sub">${p.subtitle}</span>
    </button>`;
  }).join('');

  grid.querySelectorAll('.reaction-card').forEach(btn => {
    btn.addEventListener('click', () => {
      triggerDraft.reactionType = btn.dataset.reaction;
      grid.querySelectorAll('.reaction-card').forEach(b => { b.classList.remove('reaction-card--selected'); b.setAttribute('aria-pressed', 'false'); });
      btn.classList.add('reaction-card--selected');
      btn.setAttribute('aria-pressed', 'true');
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
    `<button class="zone-chip" data-zone="${z.id}" aria-pressed="false">${z.label}</button>`
  ).join('');

  wrap.querySelectorAll('.zone-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const isSelected = btn.classList.contains('zone-chip--selected');
      wrap.querySelectorAll('.zone-chip').forEach(b => { b.classList.remove('zone-chip--selected'); b.setAttribute('aria-pressed', 'false'); });
      if (!isSelected) {
        btn.classList.add('zone-chip--selected');
        btn.setAttribute('aria-pressed', 'true');
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
    `<div class="checklist-item" role="checkbox" tabindex="0" aria-checked="false" data-id="${escapeAccessText(s.id)}">
      <span class="checklist-check"></span>
      <span class="checklist-emoji">${s.emoji}</span>
      <span class="checklist-label">${escapeAccessText(s.label)}</span>
    </div>`
  ).join('');

  grid.querySelectorAll('.checklist-item').forEach(item => {
    item.addEventListener('keydown', event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); item.click(); } });
    item.addEventListener('click', () => {
      item.classList.toggle('checklist-item--selected');
      item.setAttribute('aria-checked', String(item.classList.contains('checklist-item--selected')));
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

  const saved = Storage.saveTriggerEntry(entry);
  window.ObservationDrafts?.submittedReaction();
  goBack();
  showToast(saved.syncStatus === 'memory-only'
    ? 'Запись пока только в этом окне. Не закрывайте его до отправки.'
    : 'Запись сохранена на устройстве. Отправим при соединении.');
}

function renderTriggerHistory() {
  const container = document.getElementById('trigger-history-list');
  if (!container) return;

  const entries = Storage.getTriggerEntries();
  const loadState = Storage.getHistoryLoadStatus().triggers;
  const statusText = loadState === 'loading' ? (entries.length ? 'Загружаем всю историю. Пока показаны записи с этого устройства.' : 'Загружаем историю реакций…')
    : loadState === 'failed' ? (entries.length ? 'Всю историю загрузить не удалось. Показаны записи с этого устройства.' : 'Историю реакций загрузить не удалось. Проверьте соединение и повторите.')
    : loadState !== 'loaded' ? 'История реакций ещё не загружена.' : '';
  const statusHtml = statusText ? `<div class="access-notice" style="margin:16px"><p role="status">${statusText}</p>${loadState !== 'loading' ? '<button type="button" class="btn btn--outline" id="trigger-history-retry">Загрузить историю</button>' : ''}</div>` : '';
  const bindRetry = () => document.getElementById('trigger-history-retry')?.addEventListener('click', () => { void Storage.loadTriggerHistory().catch(() => {}); });
  if (!entries.length) {
    container.innerHTML = loadState === 'loaded' ? `
      <div style="text-align:center; padding: 48px 24px; color:var(--tg-hint)">
        <div style="font-size:2rem; margin-bottom:12px">⚡</div>
        <div>Записей пока нет.</div>
        <div style="margin-top:4px; font-size:13px">Запишите ситуацию и свою реакцию</div>
      </div>` : statusHtml;
    bindRetry();
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
    const date = new Date(e.date).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'short' });
    const zoneName = e.zone ? DATA.zones.find(z => z.id === e.zone)?.label : null;
    return `<div class="trigger-card">
      <div class="trigger-card-top">
        <span class="trigger-badge" style="background:${p.colorLight}; color:${p.color}">${p.emoji} ${p.name}</span>
        <span class="trigger-card-date">${date}</span>
      </div>
      <div class="trigger-card-situation">${escapeAccessText(e.situation)}</div>
      ${e.clientId ? `<div class="trigger-card-meta">${e.syncStatus === 'synced' ? 'Сохранено' : e.syncStatus === 'memory-only' ? 'Пока только в этом окне — не закрывайте до отправки' : 'На устройстве — ожидает отправки'}</div>` : ''}
      ${zoneName ? `<div class="trigger-card-meta">📍 ${zoneName} · интенсивность ${e.intensity}/10</div>` : `<div class="trigger-card-meta">интенсивность ${e.intensity}/10</div>`}
      ${e.note ? `<div class="trigger-card-note">${escapeAccessText(e.note)}</div>` : ''}
    </div>`;
  }).join('');

  container.innerHTML = statusHtml + `
    <div style="padding: 0 16px 16px">
      <div class="section-label" style="padding-top:16px">Паттерны реакций</div>
      ${statsHtml}
      <div class="section-label mt-16">Все записи</div>
      ${entries.some(e => e.clientId && e.syncStatus !== 'synced') ? '<button class="btn btn--outline" onclick="Storage.flushTriggersPending()">Повторить отправку</button>' : ''}
      ${listHtml}
    </div>`;
  bindRetry();
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
let checkinDraftOwner = null, checkinDraftGeneration = null, checkinDraftDate = null;
const CHECKIN_DRAFT_SCOPE = 'checkin';

function checkinOwnerIsCurrent() {
  return !!checkinDraftOwner && checkinDraftOwner === Storage._userId && checkinDraftGeneration === Storage._generation;
}

function persistCheckinDraft() {
  if (!checkinOwnerIsCurrent()) { renderCheckinScales(); renderCheckinSyncStatus(); return; }
  checkinHasUnsavedChanges = true;
  checkinDraftDate ||= new Date().toISOString();
  Storage.saveFormDraft(CHECKIN_DRAFT_SCOPE, {
    version: 1, date: checkinDraftDate, ...checkinDraft,
    note: document.getElementById('checkin-note')?.value || '',
  });
  renderCheckinSyncStatus();
}

function discardCheckinDraft() {
  if (!checkinOwnerIsCurrent()) return;
  // A null tombstone also masks an older stored draft when removal is blocked.
  const durable = Storage.saveFormDraft(CHECKIN_DRAFT_SCOPE, null);
  renderCheckinScales();
  renderCheckinSyncStatus();
  if (!durable && window.ScreenReviewMode !== true) showToast('Черновик убран в этом окне. Хранилище устройства недоступно.', false);
}

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
    void Storage.ensureCheckinHistory();
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
    persistCheckinDraft();
  });
}

function renderCheckinScales() {
  const container = document.getElementById('checkin-scales');
  if (!container) return;
  savedCheckinDayKey = null;
  checkinHasUnsavedChanges = false;
  checkinDraftOwner = Storage._userId;
  checkinDraftGeneration = Storage._generation;

  const today = Storage.checkinDayKey(new Date());
  const existing = Storage.getCheckins().find(row => row.dayKey === today && !row.legacyScale);
  const stored = Storage.getFormDraft(CHECKIN_DRAFT_SCOPE);
  const restored = stored?.version === 1 && typeof stored.note === 'string' &&
    typeof stored.date === 'string' && Number.isFinite(Date.parse(stored.date)) &&
    CHECKIN_SCALES.every(s => Number.isInteger(stored[s.key]) && stored[s.key] >= 1 && stored[s.key] <= 10) ? stored : null;
  checkinDraftDate = restored?.date || null;
  checkinHasUnsavedChanges = !!restored;
  const note = document.getElementById('checkin-note');
  if (note) note.value = (restored || existing)?.note || '';
  CHECKIN_SCALES.forEach(scale => { checkinDraft[scale.key] = scaleValue(restored || existing || {}, scale.key) ?? 5; });
  container.innerHTML = CHECKIN_SCALES.map(s => `
    <div class="checkin-scale-item">
      <div class="checkin-scale-header">
        <span class="checkin-scale-emoji">${s.emoji}</span>
        <span class="checkin-scale-label">${escapeAccessText(s.label)}</span>
        <span class="checkin-scale-val" id="val-${s.key}">${checkinDraft[s.key]}</span>
      </div>
      <div class="checkin-slider-row">
        <button class="checkin-step-btn" aria-label="Уменьшить: ${escapeAccessText(s.label)}" onclick="stepSlider('${s.key}',-1)">−</button>
        <input type="range" class="intensity-slider" min="1" max="10" value="${checkinDraft[s.key]}" aria-label="${escapeAccessText(s.label)}"
          id="slider-${s.key}" data-key="${s.key}">
        <button class="checkin-step-btn" aria-label="Увеличить: ${escapeAccessText(s.label)}" onclick="stepSlider('${s.key}',1)">+</button>
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
        if (!checkinOwnerIsCurrent()) { renderCheckinScales(); renderCheckinSyncStatus(); return; }
        checkinDraft[s.key] = Number(slider.value);
        persistCheckinDraft();
        const valEl = document.getElementById(`val-${s.key}`);
        if (valEl) valEl.textContent = slider.value;
      });
    }
  });
}

function stepSlider(key, delta) {
  if (!checkinOwnerIsCurrent()) { renderCheckinScales(); renderCheckinSyncStatus(); return; }
  const slider = document.getElementById(`slider-${key}`);
  if (!slider) return;
  const newVal = Math.min(10, Math.max(1, Number(slider.value) + delta));
  slider.value = newVal;
  checkinDraft[key] = newVal;
  persistCheckinDraft();
  const valEl = document.getElementById(`val-${key}`);
  if (valEl) valEl.textContent = newVal;
}

let savedCheckinDayKey = null;
function checkinStatusText(row) {
  if (window.ScreenReviewMode === true) return row.syncStatus === 'synced' ? 'Учебный пример сохранён только в этом просмотре. Ваши настоящие данные не изменены.' : 'Учебные изменения остаются только в этом просмотре.';
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
  if ((document.getElementById('checkin-note')?.value || '').length > 20000) {
    panel.dataset.syncStatus = 'invalid';
    const warning = document.createElement('p'); warning.setAttribute('role', 'alert');
    warning.textContent = 'В заметке больше 20 000 символов. Сократите текст перед сохранением. Исходный текст остался в форме.';
    panel.append(warning); return;
  }
  if (checkinHasUnsavedChanges) {
    panel.dataset.syncStatus = 'draft';
    const text = document.createElement('p');
    const previousDay = checkinDraftDate && Storage.checkinDayKey(checkinDraftDate) !== Storage.checkinDayKey(new Date());
    const date = previousDay ? ' за ' + new Date(checkinDraftDate).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' }) : '';
    text.textContent = window.ScreenReviewMode === true ? 'Учебный черновик остаётся только в этом просмотре.' :
      AppLocalStorage.isPersistent() ? `Черновик${date} сохранён на этом устройстве. Нажмите «Сохранить оценки», чтобы добавить запись.` :
      `Черновик${date} остаётся только в открытом приложении: хранилище устройства недоступно. Не закрывайте окно до сохранения на сервере.`;
    panel.append(text);
    const discard = document.createElement('button');
    discard.id = 'checkin-draft-discard'; discard.type = 'button'; discard.className = 'btn btn--outline';
    discard.textContent = 'Удалить черновик'; discard.onclick = discardCheckinDraft;
    panel.append(discard);
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
  if ((document.getElementById('checkin-note')?.value || '').length > 20000) { renderCheckinSyncStatus(); return; }
  if (!checkinOwnerIsCurrent()) { renderCheckinScales(); renderCheckinSyncStatus(); return; }
  const owner = checkinDraftOwner, generation = checkinDraftGeneration;
  const current = () => owner === Storage._userId && generation === Storage._generation;
  try {
    if (button) button.disabled = true;
    const note = document.getElementById('checkin-note')?.value?.trim() || '';
    const row = Storage.saveCheckin({ ...checkinDraft, note, ...(checkinDraftDate ? { date: checkinDraftDate } : {}) });
    const submittedDraft = Storage.getFormDraft(CHECKIN_DRAFT_SCOPE);
    const clearSubmittedDraft = () => {
      if (current() && JSON.stringify(Storage.getFormDraft(CHECKIN_DRAFT_SCOPE)) === JSON.stringify(submittedDraft)) {
        Storage.saveFormDraft(CHECKIN_DRAFT_SCOPE, null);
      }
    };
    if (row.syncStatus !== 'memory-only') clearSubmittedDraft();
    checkinHasUnsavedChanges = false;
    checkinDraftDate = null;
    savedCheckinDayKey = row.dayKey;
    renderCheckinSyncStatus();
    await Storage.flushCheckinsPending();
    if (!current()) return;
    renderCheckinSyncStatus();
    const actual = Storage.getCheckins().find(item => item.dayKey === row.dayKey);
    if (actual?.syncStatus === 'synced') { clearSubmittedDraft(); hapticNotify('success'); }
  } catch {
    if (current()) showToast('Не удалось сохранить оценки. Ответы остаются в этом окне.', false);
  } finally { if (button) button.disabled = false; }
}

function showToast(msg, ok = true) {
  let t = document.getElementById('app-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'app-toast';
    t.setAttribute('role', 'status');
    t.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:9999;padding:10px 20px;border-radius:24px;font-size:14px;font-weight:500;pointer-events:none;transition:opacity 0.3s;max-width:280px;text-align:center;';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.background = ok ? 'var(--color-action)' : 'var(--color-error)';
  t.style.color = 'var(--color-paper)';
  t.style.opacity = '1';
  clearTimeout(t._hide);
  t._hide = setTimeout(() => { t.style.opacity = '0'; }, 2200);
}

function renderCheckinHistory() {
  const container = document.getElementById('checkin-history-list');
  if (!container) return;
  // Personal history may start from a bounded local copy; comparisons need loaded.
  const checkins = Storage.getCheckins();
  const loadState = Storage.getHistoryLoadStatus().checkins;
  const loading = ['idle', 'loading', 'partial'].includes(loadState);
  const periodRows = loadState === 'loaded' ? selectedCheckins() : [];
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
  const label = loadState === 'loaded' ? 'Все личные наблюдения' : 'Наблюдения на этом устройстве';
  const empty = loadState === 'loaded' ? 'Оценок пока нет. Можно начать с того, что вы замечаете сейчас.' : 'На этом устройстве пока нет сохранённых отметок.';
  const localNotice = loadState !== 'loaded' ? '<p class="access-notice">История на этом устройстве может быть неполной. Полная история отметок доступна после подключения.</p>' : '';
  container.innerHTML = `<div style="padding:0 16px 24px">${loading ? '<p class="access-notice" role="status">Загружаем ваши отметки…</p>' : ''}${localNotice}${comparison}<div class="section-label">${label}</div>${list || (loading ? '' : `<p class="access-notice">${empty}</p>`)}</div>`;
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
let qStatusDone = false;
let qStatusState = 'idle';
let qStatusRequest = 0;
let qStatusIdentity = null;
let qFormIdentity = null;
let qSubmitting = false;

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
  const request = ++qStatusRequest;
  const owner = Api.userId;
  const generation = Api._authGeneration;
  closeQInvite();
  qStreamId = streamId;
  qStatusIdentity = { owner, generation };
  qStatusVerified = false;
  qStatusDone = false;
  window.QuestionnaireCycle?.invalidate();
  qStatusState = 'idle';
  if (Api.isClubAdmin || Api.userRole === 'HOST' || Api.clubBlocked || !streamId || !currentProgram()) {
    renderQuestionnaireBanner();
    return;
  }
  qStatusState = 'loading';
  renderQuestionnaireBanner();
  const current = () => request === qStatusRequest && !Api.clubBlocked && !Api.isClubAdmin &&
    Api.userId === owner && Api._authGeneration === generation && selectedProgramId === streamId;
  try {
    const status = await Api.getQuestionnaireStatus(streamId);
    if (!current()) return;
    if (!status || !Object.prototype.hasOwnProperty.call(status, 'pre')) throw new Error('Unknown questionnaire status');
    qStatusDone = !!status.pre;
    window.QuestionnaireCycle?.setStatus(streamId, status);
    qStatusVerified = true;
    qStatusState = 'loaded';
  } catch {
    if (!current()) return;
    qStatusState = 'error';
    renderQuestionnaireBanner();
    return;
  }
  renderQuestionnaireBanner();
  if (qStatusDone) return;

  // Keep the existing one-time invitation; bind its delayed display to this selection.
  if (!Storage.isQSheetShown()) {
    qInviteTimer = setTimeout(() => {
      qInviteTimer = null;
      if (!current() || qStatusDone || currentScreen !== 'home' || window.MeetingPanel?.isOpen()) return;
      Storage.setQSheetShown();
      showQInvite();
    }, 10000);
  }
}

// ─── Bottom sheet — приглашение ───────────────────────────────────────────

let qInviteReturnFocus = null;
function showQInvite() {
  if (Api.isClubAdmin || Api.clubBlocked || !qStreamId || !qStatusVerified || qStatusDone || qStreamId !== selectedProgramId || Api.userId !== qStatusIdentity?.owner || Api._authGeneration !== qStatusIdentity?.generation) return;
  const overlay = document.getElementById('q-invite-overlay');
  const sheet   = document.getElementById('q-invite-sheet');
  if (!overlay || !sheet) return;
  if (sheet.classList.contains('active')) return;
  qInviteReturnFocus = { element: document.activeElement, owner: Api.userId, generation: Api._authGeneration };
  sheet.inert = false;
  sheet.removeAttribute('aria-hidden');
  overlay.classList.add('active');
  sheet.classList.add('active');
  sheet.focus({ preventScroll: true });
  syncScreenAccessibility();
  updateBackBtn();
  haptic('light');
}

function closeQInvite() {
  clearTimeout(qInviteTimer);
  qInviteTimer = null;
  const overlay = document.getElementById('q-invite-overlay');
  const sheet   = document.getElementById('q-invite-sheet');
  if (!overlay || !sheet) return;
  const wasOpen = sheet.classList.contains('active');
  overlay.classList.remove('active');
  sheet.classList.remove('active');
  const previous = qInviteReturnFocus;
  qInviteReturnFocus = null;
  syncScreenAccessibility();
  if (wasOpen && previous?.owner === Api.userId && previous?.generation === Api._authGeneration && previous.element?.isConnected && document.querySelector('.screen--active')?.contains(previous.element)) {
    previous.element.focus({ preventScroll: true });
  } else if (sheet.contains(document.activeElement)) {
    document.activeElement.blur();
  }
  sheet.inert = true;
  sheet.setAttribute('aria-hidden', 'true');
  updateBackBtn();
}

document.addEventListener('keydown', event => {
  const sheet = document.getElementById('q-invite-sheet');
  if (!sheet?.classList.contains('active')) return;
  if (event.key === 'Escape') { event.preventDefault(); closeQInvite(); return; }
  if (event.key !== 'Tab') return;
  const first = document.getElementById('q-invite-start-btn');
  const last = sheet.querySelector('.q-invite-later');
  if (document.activeElement === sheet || !sheet.contains(document.activeElement)) {
    event.preventDefault(); (event.shiftKey ? last : first)?.focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault(); last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault(); first?.focus();
  }
});

// ─── Открыть / закрыть экран анкеты ──────────────────────────────────────

function openQuestionnaire() {
  if (Api.isClubAdmin || Api.clubBlocked || !qStreamId || !qStatusVerified || qStatusDone || qStreamId !== selectedProgramId || qSubmitting || Api.userId !== qStatusIdentity?.owner || Api._authGeneration !== qStatusIdentity?.generation) return;
  closeQInvite();
  qFormIdentity = { streamId: qStreamId, owner: Api.userId, generation: Api._authGeneration };
  const footer = document.querySelector('.questionnaire-footer');
  if (footer) footer.innerHTML = `<button class="btn btn--outline q-back-btn" id="q-back-btn" onclick="qPrev()">Назад</button><button class="btn btn--accent q-next-btn" id="q-next-btn" onclick="qNext()">Далее</button>`;
  const draft = Storage.getFormDraft('questionnaire:pre:' + qStreamId);
  qStep = draft?.version === 1 && Number.isInteger(draft.step) ? Math.max(0, Math.min(Q_BLOCKS.length - 1, draft.step)) : 0;
  qAnswers = draft?.version === 1 && draft.answers && typeof draft.answers === 'object' && !Array.isArray(draft.answers) ? draft.answers : {};
  renderQBlock();
  goTo('questionnaire');
  focusQuestionnaireBlock();
}

function closeQuestionnaire() {
  goBack();
  if (currentScreen === 'ai-chat') renderAiChat();
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
    <h1 class="q-block-title" tabindex="-1">${block.title}</h1>
    ${fieldsHtml}
  `;
  body.scrollTop = 0;

  // Восстанавливаем сохранённые значения
  block.fields.forEach(f => restoreQField(f));

  // Вешаем обработчики
  block.fields.forEach(f => bindQField(f));
  body.oninput = body.onchange = () => collectQBlock();
  body.onclick = () => saveQuestionnaireDraft();
  saveQuestionnaireDraft();
}

function renderQField(f) {
  const hint = f.hint ? `<div class="q-field-hint">${f.hint}</div>` : '';
  const req  = f.required ? '<span class="q-required">*</span>' : '';

  if (f.type === 'text') {
    return `<div class="q-field">
      <label class="q-label" for="qf-${f.id}">${f.label}${req}</label>${hint}
      <input class="q-input" id="qf-${f.id}" type="text" maxlength="4000" aria-required="${!!f.required}" placeholder="">
    </div>`;
  }

  if (f.type === 'textarea') {
    return `<div class="q-field">
      <label class="q-label" for="qf-${f.id}">${f.label}${req}</label>${hint}
      <textarea class="q-textarea" id="qf-${f.id}" rows="4" maxlength="4000" aria-required="${!!f.required}" placeholder=""></textarea>
    </div>`;
  }

  if (f.type === 'radio') {
    const opts = f.options.map(o => `
      <label class="q-option">
        <input type="radio" name="qf-${f.id}" value="${o}">
        <span class="q-option-label">${o}</span>
      </label>`).join('');
    return `<div class="q-field">
      <div class="q-label" id="q-label-${f.id}">${f.label}${req}</div>${hint}
      <div class="q-options" role="radiogroup" aria-labelledby="q-label-${f.id}" aria-required="${!!f.required}">${opts}</div>
    </div>`;
  }

  if (f.type === 'checkbox') {
    const opts = f.options.map(o => `
      <label class="q-option">
        <input type="checkbox" name="qf-${f.id}" value="${o}">
        <span class="q-option-label">${o}</span>
      </label>`).join('');
    return `<div class="q-field">
      <div class="q-label" id="q-label-${f.id}">${f.label}</div>${hint}
      <div class="q-options" role="group" aria-labelledby="q-label-${f.id}">${opts}</div>
    </div>`;
  }

  if (f.type === 'scale') {
    const nums = Array.from({length: f.max - f.min + 1}, (_,i) => i + f.min);
    const btns = nums.map(n => `<button class="q-scale-btn" aria-pressed="${qAnswers[f.id] === n}" data-val="${n}" data-id="${f.id}">${n}</button>`).join('');
    return `<div class="q-field">
      <div class="q-label" id="q-label-${f.id}">${f.label}</div>${hint}
      <div class="q-scale" role="group" aria-labelledby="q-label-${f.id}" id="qscale-${f.id}">${btns}</div>
      <p class="q-field-hint q-scale-hint">Чтобы снять оценку, нажмите на выбранное число ещё раз.</p>
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
        const value = Number(btn.dataset.val);
        const selected = qAnswers[f.id] === value;
        document.querySelectorAll(`#qscale-${f.id} .q-scale-btn`).forEach(b => {
          b.classList.remove('q-scale-btn--active');
          b.setAttribute('aria-pressed', 'false');
        });
        if (selected) delete qAnswers[f.id];
        else { btn.classList.add('q-scale-btn--active'); qAnswers[f.id] = value; btn.setAttribute('aria-pressed', 'true'); }
        saveQuestionnaireDraft();
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
      qAnswers[f.id] = checked ? checked.value : '';
    }
    if (f.type === 'checkbox') {
      const checked = [...document.querySelectorAll(`input[name="qf-${f.id}"]:checked`)].map(i => i.value);
      qAnswers[f.id] = checked;
    }
    // scale — уже сохраняется при клике
  });
  saveQuestionnaireDraft();
}

function saveQuestionnaireDraft() {
  const identity = qFormIdentity;
  if (!identity || identity.owner !== Api.userId || identity.generation !== Api._authGeneration || qStatusDone) return;
  const durable = Storage.saveFormDraft('questionnaire:pre:' + identity.streamId, { version: 1, step: qStep, answers: qAnswers });
  let status = document.getElementById('q-draft-status');
  if (!status) {
    status = document.createElement('p'); status.id = 'q-draft-status'; status.setAttribute('role', 'status');
    document.getElementById('questionnaire-body')?.append(status);
  }
  status.textContent = durable ? 'Черновик сохранён. Можно вернуться позже.' : 'Черновик пока только в этом окне. После закрытия он может потеряться.';
  document.querySelectorAll('.q-scale-btn').forEach(button => button.setAttribute('aria-pressed', String(qAnswers[button.dataset.id] === Number(button.dataset.val))));
}

function validateQBlock(block) {
  const missing = block.fields.find(field => field.required && !qAnswers[field.id]?.toString().trim());
  if (!missing) { document.getElementById('q-validation-error')?.remove(); return true; }
  let error = document.getElementById('q-validation-error');
  if (!error) {
    error = document.createElement('p'); error.id = 'q-validation-error'; error.setAttribute('role', 'alert');
    document.getElementById('questionnaire-body')?.prepend(error);
  }
  error.textContent = 'Ответьте на вопрос: ' + missing.label;
  const target = document.getElementById('qf-' + missing.id) || document.querySelector(`input[name="qf-${missing.id}"]`);
  target?.setAttribute('aria-describedby', 'q-validation-error');
  target?.focus();
  return false;
}

// ─── Навигация по блокам ─────────────────────────────────────────────────

function focusQuestionnaireBlock() {
  document.querySelector('#questionnaire-body .q-block-title')?.focus({preventScroll:true});
}

function qNext() {
  collectQBlock();
  if (!validateQBlock(Q_BLOCKS[qStep])) return;
  haptic('light');

  if (qStep < Q_BLOCKS.length - 1) {
    qStep++;
    renderQBlock();
    focusQuestionnaireBlock();
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
    focusQuestionnaireBlock();
  }
}

// ─── Отправка на сервер ───────────────────────────────────────────────────

async function submitQuestionnaire() {
  const identity = qFormIdentity;
  const current = () => identity && !Api.clubBlocked && !Api.isClubAdmin && Api.userId === identity.owner &&
    Api._authGeneration === identity.generation && selectedProgramId === identity.streamId && qStreamId === identity.streamId && qStatusVerified && !qStatusDone;
  if (qSubmitting || !current()) return;
  collectQBlock();
  for (let step = 0; step < Q_BLOCKS.length; step++) {
    if (Q_BLOCKS[step].fields.some(field => field.required && !qAnswers[field.id]?.toString().trim())) {
      qStep = step; renderQBlock(); validateQBlock(Q_BLOCKS[step]); return;
    }
  }
  qSubmitting = true;
  const nextBtn = document.getElementById('q-next-btn');
  if (nextBtn) { nextBtn.disabled = true; nextBtn.textContent = 'Отправляем…'; }

  try {
    const savedPre = await Api.saveQuestionnairePre(identity.streamId, { ...qAnswers });
    if (!current()) return;
    qStatusDone = true;
    window.QuestionnaireCycle?.setPre(savedPre);
    Storage.clearFormDraft('questionnaire:pre:' + identity.streamId);
    closeQInvite();
    hapticNotify('success');

    // Показываем благодарность
    const body = document.getElementById('questionnaire-body');
    if (body) {
      body.innerHTML = `
        <div class="q-done">
          <div class="q-done-icon">🌿</div>
          <div class="q-done-title">Спасибо</div>
          <div class="q-done-text">Анкета заполнена.</div>
        </div>`;
    }
    const footer = document.querySelector('.questionnaire-footer');
    if (footer) footer.innerHTML = `<button class="btn btn--accent btn--full" onclick="closeQuestionnaire()">Закрыть</button>`;

    renderQuestionnaireBanner();
    // Refresh server rights only after the questionnaire has been acknowledged.
    const access = await Api.getAccess().catch(() => null);
    if (access && identity.owner === Api.userId && identity.generation === Api._authGeneration && identity.streamId === selectedProgramId && !Api.clubBlocked) {
      applyProgramAccess(access);
      renderAiChat();
    }
    // Обновляем профиль — убираем баннер
    renderProfileTab();
  } catch {
    if (!current()) return;
    if (nextBtn) { nextBtn.disabled = false; nextBtn.textContent = 'Отправить'; }
    alert('Не удалось отправить анкету. Проверьте соединение и попробуйте ещё раз.');
  } finally { qSubmitting = false; }
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
  renderQuestionnaireBannerAt(document.getElementById('q-banner-wrap'));
  const home = document.getElementById('home-q-banner-wrap');
  if (home) {
    home.hidden = Api.isClubAdmin || ['HOST'].includes(Api.userRole) || qStatusDone || !['upcoming','current'].includes(currentProgram()?.phase);
    renderQuestionnaireBannerAt(home);
  }
  window.QuestionnaireCycle?.refreshEntries();
}
function renderQuestionnaireBannerAt(container) {
  if (!container) return;

  if (Api.isClubAdmin) {container.innerHTML='<p class="questionnaire-status">Анкета до потока доступна участницам. Вы вошли как ведущая.</p>';return;}
  if (Api.clubBlocked || !currentProgram() || !qStreamId || qStreamId !== selectedProgramId || Api.userId !== qStatusIdentity?.owner || Api._authGeneration !== qStatusIdentity?.generation) {container.innerHTML='';return;}
  if (qStatusState === 'loading') {container.innerHTML='<p class="questionnaire-status" role="status">Проверяем анкету выбранного потока…</p>';return;}
  if (qStatusState === 'error') {
    container.innerHTML='<p class="questionnaire-status" role="status">Не удалось проверить анкету этого потока.</p><button type="button" class="btn btn--outline btn--full btn--sm q-status-retry">Повторить проверку</button>';
    container.querySelector('.q-status-retry').addEventListener('click', () => checkAndShowQuestionnaire(selectedProgramId));
    if (container.id === 'q-banner-wrap') container.querySelector('.q-status-retry').id = 'q-status-retry';
    return;
  }
  if (!qStatusVerified) {container.innerHTML='';return;}
  if (qStatusDone) {container.innerHTML='<p class="questionnaire-status">Анкета до потока заполнена.</p>';return;}

  container.innerHTML = `
    <button class="q-banner" type="button" onclick="openQuestionnaire()">
      <span class="q-banner-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 4H5v17h14V4h-3M8 3h8v4H8zM8 12h8M8 16h5"/></svg></span>
      <span class="q-banner-body">
        <span class="q-banner-title">Анкета первой недели</span>
        <span class="q-banner-sub">Расскажите, с чем вы пришли и чего ждёте от программы.</span>
        <span class="q-banner-action">Заполнить анкету</span>
      </span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
    </button>`;
}

// ─────────────────────────────────────────────────────────────────────────
// ОБРАТНАЯ СВЯЗЬ
// ─────────────────────────────────────────────────────────────────────────
let feedbackRating = 0;
let feedbackOperation = null;
let feedbackPending = false;
let feedbackIdentity = null;
function persistFeedbackDraft(changed = false) {
  if (!feedbackIdentity || feedbackIdentity.owner !== Api.userId || feedbackIdentity.generation !== Api._authGeneration) return;
  if (changed || !feedbackOperation) feedbackOperation = crypto.randomUUID();
  const durable = Storage.saveFormDraft('feedback', { text: document.getElementById('fb-text')?.value || '', rating: feedbackRating, operationId: feedbackOperation, streamId: document.getElementById('fb-stream')?.value || null, kind: document.getElementById('fb-kind')?.value || 'feedback', needsReply: document.getElementById('fb-reply')?.value === 'yes' });
  let status = document.getElementById('fb-draft-status');
  if (!status) { status = document.createElement('p'); status.id = 'fb-draft-status'; status.setAttribute('role','status'); document.getElementById('feedback-form-wrap')?.append(status); }
  status.textContent = durable ? 'Черновик сохранён.' : 'Черновик пока только в этом окне. Не закрывайте его до отправки.';
}

function openFeedback() {
  feedbackIdentity = { owner: Api.userId, generation: Api._authGeneration };
  const draft = Storage.getFormDraft('feedback');
  feedbackRating = draft?.rating || 0;
  feedbackOperation = draft?.operationId || crypto.randomUUID();
  const text = document.getElementById('fb-text');
  if (text) { text.value = draft?.text || ''; }
  const counter = document.getElementById('fb-counter');
  if (counter) counter.textContent = String(text?.value.length || 0);
  document.querySelectorAll('#fb-stars .fb-star').forEach(s => {
    s.classList.toggle('fb-star--active', Number(s.dataset.star) <= feedbackRating);
    s.setAttribute('aria-pressed', String(Number(s.dataset.star) === feedbackRating));
    s.setAttribute('aria-label', 'Оценка ' + s.dataset.star + ' из 5');
  });
  const submit = document.getElementById('fb-submit');
  if (submit) { submit.disabled = true; submit.textContent = 'Отправить'; }
  const formWrap = document.getElementById('feedback-form-wrap');
  const thanks   = document.getElementById('feedback-thanks');
  if (formWrap) formWrap.style.display = '';
  if (thanks)   thanks.style.display = 'none';
  const scope = document.getElementById('fb-stream');
  scope.innerHTML = '<option value="">Общие вопросы</option>';
  for (const stream of programAccess?.streams || []) {const option = document.createElement('option');option.value=stream.id;option.textContent=stream.name;scope.append(option);}
  if(draft?.streamId && ![...scope.options].some(o=>o.value===draft.streamId)){const option=document.createElement('option');option.value=draft.streamId;option.textContent='Ранее выбранный поток';scope.append(option);}
  scope.value = draft?.streamId || '';
  document.getElementById('fb-kind').value = draft?.kind || 'feedback';
  document.getElementById('fb-reply').value = draft?.needsReply ? 'yes' : 'no';
  updateFeedbackSubmitState();
  goTo('feedback');
}

function initFeedback() {
  document.getElementById('open-feedback-btn')?.addEventListener('click', openFeedback);

  const stars = document.querySelectorAll('#fb-stars .fb-star');
  stars.forEach(star => {
    star.addEventListener('click', () => {
      feedbackRating = Number(star.dataset.star);
      stars.forEach(s => s.setAttribute('aria-pressed', String(Number(s.dataset.star) === feedbackRating)));
      persistFeedbackDraft(true);
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
    persistFeedbackDraft(true);
    updateFeedbackSubmitState();
  });

  for (const id of ['fb-stream','fb-kind','fb-reply']) document.getElementById(id)?.addEventListener('change', () => persistFeedbackDraft(true));
  document.getElementById('fb-submit')?.addEventListener('click', submitFeedback);
}

function updateFeedbackSubmitState() {
  const text = document.getElementById('fb-text');
  const submit = document.getElementById('fb-submit');
  if (!submit) return;
  const hasText = (text?.value || '').trim().length > 0;
  submit.disabled = feedbackPending || !hasText;
}

async function submitFeedback() {
  const text = document.getElementById('fb-text');
  const submit = document.getElementById('fb-submit');
  const value = (text?.value || '').trim();
  if (!value || feedbackPending || !feedbackIdentity || feedbackIdentity.owner !== Api.userId || feedbackIdentity.generation !== Api._authGeneration) return;
  persistFeedbackDraft();
  const identity = { ...feedbackIdentity }, operationId = feedbackOperation, rating = feedbackRating;
  const current = () => Api.userId === identity.owner && Api._authGeneration === identity.generation && !Api.clubBlocked;
  feedbackPending = true;

  submit.disabled = true;
  submit.textContent = 'Отправляем…';
  try {
    await Api.sendFeedback({ rating: rating || null, text: value, operationId, streamId: document.getElementById('fb-stream').value || null, kind: document.getElementById('fb-kind').value, needsReply: document.getElementById('fb-reply').value === 'yes' });
    if (!current()) return;
    if (feedbackOperation !== operationId) {
      const status = document.getElementById('fb-draft-status');
      if (status) status.textContent = 'Предыдущее сообщение отправлено. Новый текст остаётся в черновике.';
      return;
    }
    Storage.clearFormDraft('feedback');
    haptic('medium');
    document.getElementById('feedback-form-wrap').style.display = 'none';
    document.getElementById('feedback-thanks').style.display = '';
  } catch (e) {
    if (!current()) return;
    submit.disabled = false;
    submit.textContent = 'Отправить';
    alert('Не удалось отправить отзыв. Попробуйте ещё раз.');
  } finally {
    feedbackPending = false;
    if (current()) { submit.textContent = 'Отправить'; updateFeedbackSubmitState(); }
  }
}
