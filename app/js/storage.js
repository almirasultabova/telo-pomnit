// storage.js — обёртка над localStorage для хранения данных пользователя.
// Локальный кэш + фоновая синхронизация с бэкендом через Api.

const KEYS = {
  DIARY:          'tp_diary_entries',      // массив записей дневника
  DIAG:           'tp_diag_result',        // результат диагностики
  HABITUAL:       'habitual_result_v2',
  HABITUAL_DRAFT: 'habitual_draft_v2',
  ONBOARDING:     'tp_onboarding_done',    // флаг завершения онбординга
  OFFER_SEEN:     'tp_offer_seen',         // флаг показа оффера при первом открытии
  ATTENDED:       'tp_attended',           // массив id посещённых встреч
  TRIGGERS:       'tp_trigger_entries',    // дневник реакций (стоп-реакция)
  CHECKINS:       'tp_checkins',           // трекер изменений (недельные чекины)
  QUESTIONNAIRE:  'tp_questionnaire_done', // флаг заполненной анкеты
  Q_SHEET_SHOWN:  'tp_q_sheet_shown',      // флаг показа bottom sheet анкеты
  CONSENT:        'tp_consent_given'       // флаг согласия на обработку данных (ФЗ-152)
};

const Storage = {

  _userId: null,
  _generation: 0,
  _diaries: new Map(),
  _listeners: new Set(),
  _flushing: new Map(),
  _retryTimer: null,
  _checkins: new Map(),
  _checkinFlushing: new Map(),
  _checkinRetryTimer: null,
  _historyLoads: new Map(),
  _deletedUsers: new Set(),
  _aiDrafts: new Map(),
  _triggerFlushing: new Map(),
  _triggerRetryTimer: null,
  _triggerHistoryLoading: new Map(),
  _historyInitializing: new Map(),
  _historyRestoring: new Map(),

  // Only a server-confirmed identity may select a cache. Unowned legacy keys
  // stay untouched for explicit export; they are never attributed to this user.
  bindUser(userId) {
    if (userId === undefined || userId === null || userId === '') throw new Error('USER_REQUIRED');
    if (this._deletedUsers.has(String(userId))) throw new Error('ACCOUNT_DELETED');
    this._userId = String(userId);
    this._generation++;
    this._historyLoads.set(this._userId, { diary: 'idle', checkins: 'idle', triggers: 'idle' });
    clearTimeout(this._retryTimer);
    clearTimeout(this._checkinRetryTimer);
    clearTimeout(this._triggerRetryTimer);
  },
  clearUser() {
    this._userId = null;
    this._generation++;
    clearTimeout(this._retryTimer);
    clearTimeout(this._checkinRetryTimer);
    clearTimeout(this._triggerRetryTimer);
  },
  key(name, userId = this._userId) {
    if (!userId) return 'tp_unbound:' + name;
    return 'tp_user:' + encodeURIComponent(userId) + ':' + name;
  },
  _get(name) { return this._userId ? AppLocalStorage.getItem(this.key(name)) : null; },
  _set(name, value) {
    if (!this._userId) throw new Error('USER_REQUIRED');
    AppLocalStorage.setItem(this.key(name), value);
  },
  _remove(name) { if (this._userId) AppLocalStorage.removeItem(this.key(name)); },
  getFormDraft(scope) {
    if (!this._userId || this._deletedUsers.has(this._userId)) return null;
    try { return JSON.parse(this._get('form_draft_v1:' + scope) || 'null'); } catch { return null; }
  },
  saveFormDraft(scope, value) {
    if (!this._userId || this._deletedUsers.has(this._userId)) return false;
    return AppLocalStorage.setItem(this.key('form_draft_v1:' + scope), JSON.stringify(value));
  },
  clearFormDraft(scope) { this._remove('form_draft_v1:' + scope); },
  subscribe(listener) { this._listeners.add(listener); return () => this._listeners.delete(listener); },
  _emit(row) {
    for (const listener of this._listeners) { try { listener(row); } catch {} }
  },
  getLegacyDataExport() {
    const result = {};
    for (const name of [...Object.values(KEYS), 'tp_custom_sensations']) {
      const value = AppLocalStorage.getItem(name);
      if (value !== null) result[name] = value;
    }
    return result;
  },
  getHistoryLoadStatus() {
    const status = this._userId && this._historyLoads.get(this._userId);
    return { triggers: 'idle', ...(status || { diary: 'idle', checkins: 'idle' }) };
  },
  exportPendingForUser(verifiedUserId) {
    const userId = String(verifiedUserId);
    const formDrafts = {}, prefix = this.key('form_draft_v1:', userId);
    if (!this._deletedUsers.has(userId)) {
      for (const name of AppLocalStorage.keys?.(prefix) || []) {
        try { formDrafts[name.slice(prefix.length)] = JSON.parse(AppLocalStorage.getItem(name)); } catch {}
      }
    }
    let triggers = [];
    if (!this._deletedUsers.has(userId)) {
      try { triggers = JSON.parse(AppLocalStorage.getItem(this.key(KEYS.TRIGGERS, userId)) || '[]').filter(row => row.clientId && row.syncStatus !== 'synced'); } catch {}
    }
    return { format: 'telo-local-pending-v1', userId, exportedAt: new Date().toISOString(),
      triggers, formDrafts,
      diary: this._state(userId).filter(row => row.syncStatus !== 'synced'),
      checkins: this._checkinState(userId).filter(row => row.syncStatus !== 'synced' && !row.legacyScale),
      aiDrafts: { ...this._aiDraftState(userId) },
      habitualDraft: this._deletedUsers.has(userId) ? null : this._ownHabitualExport(userId, KEYS.HABITUAL_DRAFT),
      habitualPending: this._deletedUsers.has(userId) ? null : this._ownHabitualExport(userId, KEYS.HABITUAL, true) };
  },
  _ownHabitualExport(userId, name, pendingOnly = false) {
    try {
      const value = JSON.parse(AppLocalStorage.getItem(this.key(name, userId)) || 'null');
      return value?.version === Habitual.version && (!pendingOnly || value.syncStatus !== 'synced') ? value : null;
    } catch { return null; }
  },
  _aiDraftState(userId = this._userId) {
    if (!userId || this._deletedUsers.has(userId)) return {};
    if (!this._aiDrafts.has(userId)) {
      let drafts = {};
      try { const value = JSON.parse(AppLocalStorage.getItem(this.key('ai_drafts_v1', userId)) || '{}'); if (value && !Array.isArray(value) && typeof value === 'object') drafts = value; } catch {}
      this._aiDrafts.set(userId, drafts);
    }
    return this._aiDrafts.get(userId);
  },
  getAiDraft(sessionId = null) {
    const value = this._aiDraftState()[sessionId ? 'session:' + sessionId : 'new'];
    return typeof value === 'string' ? value : '';
  },
  isAiDraftPersistent(sessionId = null) {
    const text = this.getAiDraft(sessionId);
    if (!text) return true;
    if (!this._userId) return false;
    try {
      const durable = JSON.parse(window.localStorage.getItem(this.key('ai_drafts_v1')) || '{}');
      return durable[sessionId ? 'session:' + sessionId : 'new'] === text;
    } catch { return false; }
  },
  saveAiDraft(sessionId, text, owner = this._userId, generation = this._generation) {
    if (!owner || owner !== this._userId || generation !== this._generation || this._deletedUsers.has(owner)) return false;
    const drafts = { ...this._aiDraftState(owner) }, conversation = sessionId ? 'session:' + sessionId : 'new';
    if (text) drafts[conversation] = String(text); else delete drafts[conversation];
    return this._persistAiDrafts(drafts, owner);
  },
  _persistAiDrafts(drafts, owner) {
    this._aiDrafts.set(owner, drafts);
    const name = this.key('ai_drafts_v1', owner), value = JSON.stringify(drafts);
    try {
      window.localStorage.setItem(name, value);
      if (window.localStorage.getItem(name) !== value) throw new Error('STORAGE_FAILED');
      AppLocalStorage.setItem(name, value); return true;
    } catch { return false; }
  },
  moveAiDraftIfMatches(fromSession, toSession, text, owner, generation) {
    if (!owner || owner !== this._userId || generation !== this._generation || this._deletedUsers.has(owner) || this.getAiDraft(fromSession) !== text) return false;
    const drafts = { ...this._aiDraftState(owner) };
    const source = fromSession ? 'session:' + fromSession : 'new';
    const target = toSession ? 'session:' + toSession : 'new';
    // One snapshot write: a quota failure preserves the old durable scope.
    // Memory retains the renamed draft, whose status remains non-durable.
    drafts[target] = text;
    if (source !== target) delete drafts[source];
    return this._persistAiDrafts(drafts, owner);
  },
  clearAiDraftIfMatches(sessionId, text, owner, generation) {
    if (owner !== this._userId || generation !== this._generation || this.getAiDraft(sessionId) !== text) return false;
    return this.saveAiDraft(sessionId, '', owner, generation);
  },
  purgeUser(verifiedUserId) {
    const userId = String(verifiedUserId), prefix = this.key('', userId);
    this._deletedUsers.add(userId);
    const names = new Set([...Object.values(KEYS), 'diary_v2', 'checkins_v2', 'ai_drafts_v1', 'tp_custom_sensations'].map(name => this.key(name, userId)));
    for (const name of AppLocalStorage.keys?.(prefix) || []) names.add(name);
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const name = window.localStorage.key(i);
        if (name?.startsWith(prefix)) names.add(name);
      }
    } catch {}
    for (const name of names) AppLocalStorage.removeItem(name);
    this._diaries.delete(userId); this._checkins.delete(userId); this._historyLoads.delete(userId);
    this._aiDrafts.delete(userId);
    if (this._userId === userId) this.clearUser();
  },
  hasLegacyData() { return Object.keys(this.getLegacyDataExport()).length > 0; },
  _state(userId = this._userId) {
    if (!userId || this._deletedUsers.has(userId)) return [];
    if (!this._diaries.has(userId)) {
      let rows = [];
      try {
        const stored = JSON.parse(AppLocalStorage.getItem(this.key('diary_v2', userId)) || '[]');
        if (Array.isArray(stored)) rows = stored;
      } catch {}
      this._diaries.set(userId, rows);
    }
    return this._diaries.get(userId);
  },
  _writeDiary(rows, userId = this._userId) {
    if (this._deletedUsers.has(userId)) return false;
    this._diaries.set(userId, rows);
    const name = this.key('diary_v2', userId);
    const value = JSON.stringify(rows);
    // AppLocalStorage deliberately falls back to memory. Verify actual durable
    // storage here so the UI never promises survival after closing a WebView.
    try {
      window.localStorage.setItem(name, value);
      if (window.localStorage.getItem(name) !== value) throw new Error('STORAGE_FAILED');
      AppLocalStorage.setItem(name, value);
      return true;
    } catch { return false; }
  },
  getDiarySyncStatus(clientId) {
    return this._state().find(row => row.clientId === clientId)?.syncStatus || null;
  },
  _scheduleRetry(userId) {
    clearTimeout(this._retryTimer);
    if (this._userId !== userId) return;
    this._retryTimer = setTimeout(() => this.flushPending(), 15000);
  },
  async flushPending() {
    const userId = this._userId;
    if (!userId || typeof Api === 'undefined' || !Api.isAuthed()) return;
    const generation = this._generation;
    const flushKey = userId + ':' + generation;
    if (this._flushing.has(flushKey)) return this._flushing.get(flushKey);
    const run = async () => {
      for (const candidate of [...this._state(userId)]) {
        if (candidate.syncStatus === 'synced' || candidate.retryBlocked) continue;
        if (this._userId !== userId || this._generation !== generation || !Api.isAuthed()) break;
        try {
          const saved = await Api.saveDiaryEntry({
            clientId: candidate.clientId, createdAt: candidate.date,
            zone: candidate.zone, sensations: candidate.sensations, note: candidate.note
          });
          // Do not let a late response switch the visible account or schedule
          // another request using its token. Persist only its original owner.
          if (!saved?.id || saved.clientId !== candidate.clientId) throw new Error('INVALID_SAVE_ACK');
          const row = { ...candidate, id: saved.id, date: saved.createdAt || candidate.date, syncStatus: 'synced' };
          delete row.syncError;
          const rows = this._state(userId).map(item => item.clientId === candidate.clientId ? row : item);
          this._writeDiary(rows, userId);
          if (this._userId === userId) this._emit(row);
        } catch (error) {
          const row = this._state(userId).find(item => item.clientId === candidate.clientId);
          if (row) {
            row.syncError = error.code || (error.status ? 'HTTP_' + error.status : 'NETWORK');
            row.retryBlocked = [400, 409, 422].includes(error.status);
            row.rejectedStatus = row.retryBlocked ? error.status : null;
            this._writeDiary(this._state(userId), userId);
            if (this._userId === userId && this._generation === generation) this._emit(row);
          }
          // Independent valid entries may proceed; rejected payloads never retry unchanged.
          if ([400, 409, 422].includes(error.status)) continue;
          if (![401, 403].includes(error.status)) this._scheduleRetry(userId);
          break;
        }
      }
    };
    const promise = run();
    this._flushing.set(flushKey, promise);
    try { await promise; } finally {
      this._flushing.delete(flushKey);
      if (this._userId === userId && this._generation === generation && Api.isAuthed() &&
          this._state(userId).some(row => row.syncStatus !== 'synced' && !row.retryBlocked)) this._scheduleRetry(userId);
    }
  },

  // ─── Дневник ──────────────────────────────────────────────────────────────

  /** Получить все записи, от новых к старым */
  getDiaryEntries() {
    return [...this._state()].sort((a, b) => new Date(b.date) - new Date(a.date));
  },

  /** Сохранить новую запись. Формат:
   *  { id, date (ISO), zone (id), sensations ([id,...]), note (string) }
   */
  saveDiaryEntry(entry) {
    if (!this._userId) throw new Error('USER_REQUIRED');
    if ((entry.note || '').length > 20000) throw new Error('NOTE_TOO_LONG');
    const clientId = crypto.randomUUID();
    const row = { ...entry, clientId, id: clientId, date: entry.date || new Date().toISOString(), syncStatus: 'pending' };
    const rows = [row, ...this._state()];
    if (!this._writeDiary(rows)) row.syncStatus = 'memory-only';
    this._emit(row);
    // Defer network until the caller has rendered the initial honest status.
    Promise.resolve().then(() => this.flushPending());
    return row;
  },

  // Only a definite validation rejection may change its payload under the same clientId.
  // Conflicts and unknown network outcomes retain their original immutable request.
  repairDiaryEntry(clientId, entry) {
    if (!this._userId) throw new Error('USER_REQUIRED');
    const previous = this._state().find(row => row.clientId === clientId);
    if (!previous?.retryBlocked || ![400, 422].includes(previous.rejectedStatus)) throw new Error('REPAIR_NOT_ALLOWED');
    if ((entry.note || '').length > 20000) throw new Error('NOTE_TOO_LONG');
    const row = { ...previous, zone: entry.zone, sensations: [...entry.sensations], note: entry.note || '', syncStatus: 'pending' };
    delete row.syncError; delete row.retryBlocked; delete row.rejectedStatus;
    const rows = this._state().map(item => item.clientId === clientId ? row : item);
    if (!this._writeDiary(rows)) row.syncStatus = 'memory-only';
    this._emit(row);
    Promise.resolve().then(() => this.flushPending());
    return row;
  },

  /** Запись за сегодня (или null) */
  getTodayEntries(now = new Date()) {
    if (!Number.isFinite(new Date(now).getTime())) return [];
    const today = this.checkinDayKey(now);
    return this.getDiaryEntries().filter(entry => Number.isFinite(Date.parse(entry.date)) && this.checkinDayKey(entry.date) === today);
  },
  getTodayEntry(now = new Date()) { return this.getTodayEntries(now)[0] || null; },

  /** Последние N записей (исключая сегодня, если нужна история) */
  getRecentEntries(n = 5) {
    return this.getDiaryEntries().slice(0, n);
  },

  // ─── Стрик ────────────────────────────────────────────────────────────────

  /** Подсчёт серии дней подряд */
  getStreak(now = new Date()) {
    const dayKey = time => this.checkinDayKey(time);
    const time = new Date(now).getTime();
    if (!Number.isFinite(time)) return 0;
    const todayKey = dayKey(time);
    let day = Date.parse(todayKey+'T00:00:00+03:00');
    const dates = new Set(this.getDiaryEntries().map(e => Date.parse(e.date || e.createdAt))
      .filter(Number.isFinite).map(dayKey).filter(key => key <= todayKey));
    if(!dates.has(todayKey))day-=86400000;
    let streak=0;
    while(dates.has(dayKey(day))){streak++;day-=86400000;}
    return streak;
  },

  // ─── Диагностика ──────────────────────────────────────────────────────────

  getHabitualDraft() {
    try { const d = JSON.parse(this._get('habitual_draft_v2')); return d?.version === Habitual.version && Array.isArray(d.answers) && d.answers.length === 16 && d.answers.every(x => x === null || (Number.isInteger(x) && x >= 0 && x <= 6)) ? d : null; } catch { return null; }
  },
  saveHabitualDraft(answers) { this._set('habitual_draft_v2', JSON.stringify({ version: Habitual.version, answers })); },
  getHabitualResult() {
    try { const r = JSON.parse(this._get('habitual_result_v2')); return r?.version === Habitual.version ? { ...r, ...Habitual.calculate(r.answers) } : null; } catch { return null; }
  },
  async saveHabitualResult(answers) {
    const r = { ...Habitual.calculate(answers), clientId: crypto.randomUUID(), date: new Date().toISOString(), syncStatus: 'pending' };
    this._set('habitual_result_v2', JSON.stringify(r));
    this._remove('habitual_draft_v2');
    return this.flushHabitualResult();
  },
  async flushHabitualResult() {
    const r = this.getHabitualResult(), userId = this._userId, generation = this._generation;
    if (!r || r.syncStatus === 'synced' || !Api.isAuthed()) return r;
    try {
      const saved = await Api.saveHabitualResult({ version: r.version, clientId: r.clientId, answers: r.answers });
      if (this._userId !== userId || this._generation !== generation) return null;
      if (this.getHabitualResult()?.clientId !== r.clientId) return this.getHabitualResult();
      this._set('habitual_result_v2', JSON.stringify({ ...saved, syncStatus: 'synced' }));
    } catch (error) {
      if (this._userId !== userId || this._generation !== generation) return null;
      if (this.getHabitualResult()?.clientId === r.clientId) this._set('habitual_result_v2', JSON.stringify({ ...r, syncStatus: 'pending' }));
    }
    return this.getHabitualResult();
  },

  /** Сохранить результат диагностики. Формат: { patternId, date, scores } */
  saveDiagResult(result) {
    this._set(KEYS.DIAG, JSON.stringify(result));
    // Фоновая синхронизация с бэкендом
    if (typeof Api !== 'undefined' && Api.isAuthed()) {
      Api.saveDiagResult(result).catch(() => {});
    }
  },

  /** Получить сохранённый результат или null */
  getDiagResult() {
    try {
      return JSON.parse(this._get(KEYS.DIAG)) || null;
    } catch {
      return null;
    }
  },

  /** Сбросить результат (пройти заново) */
  clearDiagResult() {
    this._remove(KEYS.DIAG);
  },

  // ─── Онбординг ────────────────────────────────────────────────────────────

  isOnboardingDone() {
    return this._get(KEYS.ONBOARDING) === 'true';
  },

  setOnboardingDone() {
    this._set(KEYS.ONBOARDING, 'true');
  },

  // ─── Оффер ────────────────────────────────────────────────────────────────

  isOfferSeen() {
    return this._get(KEYS.OFFER_SEEN) === 'true';
  },

  setOfferSeen() {
    this._set(KEYS.OFFER_SEEN, 'true');
  },

  // ─── Дневник реакций (Стоп-реакция) ─────────────────────────────────────

  getTriggerEntries() {
    try {
      const rows = JSON.parse(this._get(KEYS.TRIGGERS));
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  },

  async loadTriggerHistory() {
    const owner = this._userId, generation = this._generation;
    if (!owner || !Api.isAuthed()) return;
    const key = owner + ':' + generation;
    if (this._triggerHistoryLoading.has(key)) return this._triggerHistoryLoading.get(key);
    const current = () => owner === this._userId && generation === this._generation && !this._deletedUsers.has(owner);
    const status = value => {
      this._historyLoads.set(owner, { ...this.getHistoryLoadStatus(), triggers: value });
      this._emit();
    };
    const run = async () => {
      status('loading');
      try {
        const remote = await Api.getTriggers();
        if (!current()) return;
        if (!Array.isArray(remote) || remote.some(row => !row?.id || !Number.isFinite(Date.parse(row.createdAt || row.date)) ||
            typeof row.situation !== 'string' || !['freeze','fight','flight','fawn'].includes(row.reactionType) ||
            !Number.isInteger(row.intensity) || row.intensity < 1 || row.intensity > 10)) throw new Error('INVALID_TRIGGER_HISTORY');
        const entries = remote.map(row => ({ ...row, date: row.createdAt || row.date, sensations: row.sensations || [], note: row.note || '', syncStatus: 'synced' }));
        const merged = new Map(entries.map(row => [row.clientId || String(row.id), row]));
        for (const row of this.getTriggerEntries()) {
          if (!row.clientId && entries.some(saved => saved.date === row.date && saved.situation === row.situation && saved.reactionType === row.reactionType && saved.intensity === row.intensity && (saved.note || '') === (row.note || ''))) continue;
          const identity = row.clientId || String(row.id);
          if (!merged.has(identity)) merged.set(identity, row);
        }
        const rows = [...merged.values()].sort((a,b) => Date.parse(b.date) - Date.parse(a.date) || String(b.id).localeCompare(String(a.id)));
        this._set(KEYS.TRIGGERS, JSON.stringify(rows));
        status('loaded');
        return rows;
      } catch (error) {
        if (current()) status('failed');
        throw error;
      }
    };
    const promise = run();
    this._triggerHistoryLoading.set(key, promise);
    try { return await promise; } finally { this._triggerHistoryLoading.delete(key); }
  },

  /** Формат: { id, date, situation, reactionType, intensity, zone, sensations, note } */
  saveTriggerEntry(entry) {
    if (!this._userId) throw new Error('USER_REQUIRED');
    const clientId = crypto.randomUUID();
    const row = { ...entry, clientId, id: clientId, date: new Date().toISOString(), syncStatus: 'pending' };
    const entries = [row, ...this.getTriggerEntries()];
    if (!AppLocalStorage.setItem(this.key(KEYS.TRIGGERS), JSON.stringify(entries))) {
      row.syncStatus = 'memory-only';
      AppLocalStorage.setItem(this.key(KEYS.TRIGGERS), JSON.stringify(entries));
    }
    this._emit(row);
    Promise.resolve().then(() => this.flushTriggersPending());
    return row;
  },
  async flushTriggersPending() {
    const owner = this._userId, generation = this._generation;
    if (!owner || typeof Api === 'undefined' || !Api.isAuthed()) return;
    const key = owner + ':' + generation;
    if (this._triggerFlushing.has(key)) return this._triggerFlushing.get(key);
    const run = async () => {
      for (const row of this.getTriggerEntries().filter(row => row.clientId && row.syncStatus !== 'synced')) {
        if (owner !== this._userId || generation !== this._generation || !Api.isAuthed()) break;
        try {
          const saved = await Api.saveTrigger({ clientId: row.clientId, createdAt: row.date,
            situation: row.situation, reactionType: row.reactionType, intensity: row.intensity,
            ...(row.zone ? { zone: row.zone } : {}), sensations: row.sensations || [], ...(row.note ? { note: row.note } : {}) });
          if (!saved?.id || saved.clientId !== row.clientId) throw new Error('INVALID_SAVE_ACK');
          if (owner !== this._userId || generation !== this._generation || this._deletedUsers.has(owner)) break;
          const updated = { ...row, id: saved.id, syncStatus: 'synced' };
          this._set(KEYS.TRIGGERS, JSON.stringify(this.getTriggerEntries().map(item => item.clientId === row.clientId ? updated : item)));
          this._emit(updated);
        } catch (error) {
          if (owner === this._userId && generation === this._generation && ![400,401,403,409,422].includes(error.status)) {
            clearTimeout(this._triggerRetryTimer);
            this._triggerRetryTimer = setTimeout(() => this.flushTriggersPending(), 15000);
          }
          break;
        }
      }
    };
    const promise = run();
    this._triggerFlushing.set(key, promise);
    try { await promise; } finally { this._triggerFlushing.delete(key); }
  },

  // ─── Посещаемость встреч ──────────────────────────────────────────────────

  getAttended() {
    try {
      return JSON.parse(this._get(KEYS.ATTENDED)) || [];
    } catch {
      return [];
    }
  },

  /** Переключить отметку: была / не была. Возвращает новое состояние (true = отмечена) */
  toggleAttended(meetingId) {
    const list = this.getAttended();
    const idx  = list.indexOf(meetingId);
    if (idx >= 0) { list.splice(idx, 1); } else { list.push(meetingId); }
    this._set(KEYS.ATTENDED, JSON.stringify(list));
    return idx < 0; // true = только что добавлена
  },

  isAttended(meetingId) {
    return this.getAttended().includes(meetingId);
  },

  // ─── Трекер изменений (чекины) ───────────────────────────────────────────

  getCheckins() {
    return [...this._checkinState()].sort((a, b) => new Date(a.date) - new Date(b.date));
  },
  checkinDayKey(date) { return new Date(new Date(date).getTime() + 10800000).toISOString().slice(0, 10); },
  _checkinState(userId = this._userId) {
    if (this._deletedUsers.has(userId)) return [];
    if (!userId) return [];
    if (!this._checkins.has(userId)) {
      let rows = [];
      try {
        const durable = AppLocalStorage.getItem(this.key('checkins_v2', userId));
        const stored = JSON.parse(durable ?? AppLocalStorage.getItem(this.key(KEYS.CHECKINS, userId)) ?? '[]');
        if (Array.isArray(stored)) rows = durable !== null ? stored : stored.map(row => this._normalizeCheckin({
          ...row, tension: null, anxiety: null, energy: null, safety: null, bodyContact: null,
          bodyScore: Number.isInteger(row.bodyScore) ? row.bodyScore : null,
          legacyCache: true, syncStatus: 'synced'
        }));
      } catch {}
      this._checkins.set(userId, rows);
    }
    return this._checkins.get(userId);
  },
  _writeCheckins(rows, userId = this._userId) {
    if (this._deletedUsers.has(userId)) return false;
    this._checkins.set(userId, rows);
    const key = this.key('checkins_v2', userId), value = JSON.stringify(rows);
    try {
      window.localStorage.setItem(key, value);
      if (window.localStorage.getItem(key) !== value) throw new Error('STORAGE_FAILED');
      AppLocalStorage.setItem(key, value);
      return true;
    } catch { return false; }
  },
  _normalizeCheckin(row) {
    const keys = ['tension','anxiety','energy','safety','bodyContact'];
    const complete = keys.every(key => Number.isInteger(row[key]) && row[key] >= 1 && row[key] <= 10);
    return { ...row, date: row.date || row.createdAt, kind: 'checkin', legacyScale: !complete,
      ...Object.fromEntries(keys.map(key => [key, complete ? row[key] : null])) };
  },
  _scheduleCheckinRetry(userId) {
    clearTimeout(this._checkinRetryTimer);
    if (userId !== this._userId) return;
    this._checkinRetryTimer = setTimeout(() => this.flushCheckinsPending(), 15000);
  },
  async flushCheckinsPending() {
    const userId = this._userId, generation = this._generation;
    if (!userId || typeof Api === 'undefined' || !Api.isAuthed()) return;
    const flushKey = userId + ':' + generation;
    if (this._checkinFlushing.has(flushKey)) return this._checkinFlushing.get(flushKey);
    const run = async () => {
      for (const candidate of [...this._checkinState(userId)]) {
        if (candidate.syncStatus === 'synced' || candidate.legacyScale || candidate.retryBlocked) continue;
        if (this._userId !== userId || this._generation !== generation || !Api.isAuthed()) break;
        try {
          const saved = await Api.saveCheckin({ createdAt: candidate.date, clientUpdatedAt: candidate.clientUpdatedAt,
            tension: candidate.tension, anxiety: candidate.anxiety, energy: candidate.energy,
            safety: candidate.safety, bodyContact: candidate.bodyContact, note: candidate.note || '' });
          const acknowledgedAt = typeof saved?.clientUpdatedAt === 'string' ? new Date(saved.clientUpdatedAt).getTime() : NaN;
          if (!saved?.id || saved.dayKey !== candidate.dayKey || !Number.isFinite(acknowledgedAt) || acknowledgedAt < new Date(candidate.clientUpdatedAt).getTime() || this._normalizeCheckin(saved).legacyScale) throw new Error('INVALID_CHECKIN_ACK');
          const current = this._checkinState(userId).find(row => row.dayKey === candidate.dayKey);
          // A response to the previous edit cannot replace a newer local draft.
          if (current?.clientUpdatedAt !== candidate.clientUpdatedAt) continue;
          const row = { ...this._normalizeCheckin(saved), syncStatus: 'synced' };
          this._writeCheckins(this._checkinState(userId).map(item => item.dayKey === candidate.dayKey ? row : item), userId);
          if (this._userId === userId && this._generation === generation) this._emit(row);
        } catch (error) {
          const row = this._checkinState(userId).find(item => item.dayKey === candidate.dayKey);
          if (row?.clientUpdatedAt === candidate.clientUpdatedAt) {
            row.syncError = error.code || (error.status ? 'HTTP_' + error.status : 'NETWORK');
            row.retryBlocked = [400,409,422].includes(error.status);
            this._writeCheckins(this._checkinState(userId), userId);
            if (this._userId === userId && this._generation === generation) this._emit(row);
          }
          if ([400,409,422].includes(error.status)) continue;
          if (![401,403].includes(error.status)) this._scheduleCheckinRetry(userId);
          break;
        }
      }
    };
    const promise = run(); this._checkinFlushing.set(flushKey, promise);
    try { await promise; } finally {
      this._checkinFlushing.delete(flushKey);
      if (this._userId === userId && this._generation === generation && this._checkinState(userId).some(row => row.syncStatus !== 'synced' && !row.legacyScale && !row.retryBlocked)) this._scheduleCheckinRetry(userId);
    }
  },
  /** All five original answers are queued together; one editable observation per Moscow day. */
  saveCheckin(checkin) {
    if (!this._userId) throw new Error('USER_REQUIRED');
    if ((checkin.note || '').length > 20000) throw new Error('NOTE_TOO_LONG');
    const date = checkin.date || new Date().toISOString(), dayKey = this.checkinDayKey(date);
    const previous = this._checkinState().find(row => row.dayKey === dayKey);
    const clientUpdatedAt = new Date(Math.max(Date.now(), new Date(previous?.clientUpdatedAt || 0).getTime() + 1)).toISOString();
    const row = this._normalizeCheckin({ ...checkin, id: previous?.id || crypto.randomUUID(), date: previous?.date || date, dayKey, clientUpdatedAt, syncStatus: 'pending' });
    if (row.legacyScale) throw new Error('FIVE_SCALES_REQUIRED');
    const rows = [...this._checkinState().filter(item => item.dayKey !== dayKey), row];
    if (!this._writeCheckins(rows)) row.syncStatus = 'memory-only';
    this._emit(row);
    Promise.resolve().then(() => this.flushCheckinsPending());
    return row;
  },

  // ─── Анкета ───────────────────────────────────────────────────────────────

  isQuestionnaireDone() {
    return this._get(KEYS.QUESTIONNAIRE) === 'true';
  },

  setQuestionnaireDone() {
    this._set(KEYS.QUESTIONNAIRE, 'true');
  },

  isQSheetShown() {
    return this._get(KEYS.Q_SHEET_SHOWN) === 'true';
  },

  setQSheetShown() {
    this._set(KEYS.Q_SHEET_SHOWN, 'true');
  },

  // ─── Согласие на обработку данных (ФЗ-152) ───────────────────────────────

  isConsentGiven() {
    return this._get(KEYS.CONSENT) === 'true';
  },

  setConsentGiven() {
    this._set(KEYS.CONSENT, 'true');
  },

  setConsentFromServer(given) {
    if (given) {
      this.setConsentGiven(); this.setOnboardingDone(); this.setOfferSeen();
    } else {
      this._remove(KEYS.CONSENT); this._remove(KEYS.ONBOARDING); this._remove(KEYS.OFFER_SEEN);
    }
  },

  // ─── Синхронизация с бэкендом ─────────────────────────────────────────────

  /** Восстановить доступные серверные данные после авторизации.
   *  Истории загружаются страницами; локальную очередь сохраняем.
   *  Повтор отправки идёт в фоне и не задерживает переход с заставки. */
  async initFromApi({ fields } = {}) {
    if (typeof Api === 'undefined' || !Api.isAuthed()) return;
    const userId = this._userId;
    const generation = this._generation;
    if (!userId) return;
    const kinds = ['diary', 'checkins', 'diagnostic', 'habitual'];
    if (fields !== undefined && (!Array.isArray(fields) || fields.some(kind => !kinds.includes(kind)))) throw new Error('INVALID_HISTORY_KIND');
    const selected = new Set(fields || kinds);
    if (!selected.size) return;
    const key = userId + ':' + generation + ':' + [...selected].sort().join(',');
    if (this._historyInitializing.has(key)) return this._historyInitializing.get(key);
    const current = () => this._userId === userId && this._generation === generation && !this._deletedUsers.has(userId);
    const status = (kind, value) => {
      if (!current()) return;
      this._historyLoads.set(userId, { ...this.getHistoryLoadStatus(), [kind]: value });
      this._emit();
    };
    const restore = async (kind, load, apply) => {
      if (!selected.has(kind)) return;
      const resourceKey = userId + ':' + generation + ':' + kind;
      if (this._historyRestoring.has(resourceKey)) return this._historyRestoring.get(resourceKey);
      const tracked = kind === 'diary' || kind === 'checkins';
      if (tracked) status(kind, 'loading');
      const attempt = (async () => {
        try {
          const value = await load();
          if (!current()) return;
          apply(value);
          if (tracked) status(kind, 'loaded');
          else this._emit();
        } catch {
          if (tracked) status(kind, 'failed');
        }
      })();
      this._historyRestoring.set(resourceKey, attempt);
      try { await attempt; } finally { this._historyRestoring.delete(resourceKey); }
    };
    const run = async () => {
      await Promise.allSettled([
        restore('diary', () => Api.getDiary(), value => {
          const entries = Array.isArray(value) ? value : value?.entries;
          if (!Array.isArray(entries)) throw new Error('INVALID_DIARY_HISTORY');
          const remote = entries.map(entry => ({
            ...entry, date: entry.date || entry.createdAt,
            sensations: entry.sensations || [], note: entry.note || '', syncStatus: 'synced'
          }));
          const byIdentity = new Map(remote.map(row => [row.clientId || String(row.id), row]));
          // Empty GET is never a deletion instruction; keep cache and pending rows.
          for (const row of this._state(userId)) {
            const identity = row.clientId || String(row.id);
            if (!byIdentity.has(identity)) byIdentity.set(identity, row);
          }
          this._writeDiary([...byIdentity.values()], userId);
        }),
        restore('diagnostic', () => Api.getDiagResult(), value => {
          if (value) this._set(KEYS.DIAG, JSON.stringify({ ...value, date: value.date || value.createdAt }));
        }),
        restore('checkins', () => Api.getCheckins(), value => {
          if (!Array.isArray(value)) throw new Error('INVALID_CHECKIN_HISTORY');
          const identity = row => row.dayKey || String(row.id);
          const merged = new Map(value.map(row => {
            const normalized = { ...this._normalizeCheckin(row), syncStatus: 'synced' };
            return [identity(normalized), normalized];
          }));
          const remoteDates = new Set([...merged.values()].map(row => new Date(row.date).getTime()));
          for (const row of this._checkinState(userId)) {
            // Old timestamp cache identifies its original date, never fake scales.
            if (row.legacyCache && remoteDates.has(new Date(row.date).getTime())) continue;
            const remote = merged.get(identity(row));
            if (!remote || (row.syncStatus !== 'synced' && new Date(row.clientUpdatedAt).getTime() > new Date(remote.clientUpdatedAt || 0).getTime())) merged.set(identity(row), row);
          }
          this._writeCheckins([...merged.values()], userId);
        }),
        restore('habitual', () => Api.getHabitualResult(), value => {
          const local = this.getHabitualResult();
          if (value && (!local || (local.syncStatus === 'synced' && Date.parse(value.date) > Date.parse(local.date)))) {
            try { Habitual.calculate(value.answers); this._set('habitual_result_v2', JSON.stringify({ ...value, syncStatus: 'synced' })); } catch {}
          }
          if (local?.syncStatus === 'pending') this.flushHabitualResult();
        })
      ]);
      if (current()) {
        void this.flushPending().catch(() => this._scheduleRetry(userId));
        void this.flushCheckinsPending().catch(() => this._scheduleCheckinRetry(userId));
        void this.flushTriggersPending();
      }
    };
    const promise = run();
    this._historyInitializing.set(key, promise);
    try { await promise; } finally { this._historyInitializing.delete(key); }
  }
};

window.addEventListener?.('online', () => { Storage.flushPending(); Storage.flushCheckinsPending(); Storage.flushTriggersPending(); });
