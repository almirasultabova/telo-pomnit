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

  // Only a server-confirmed identity may select a cache. Unowned legacy keys
  // stay untouched for explicit export; they are never attributed to this user.
  bindUser(userId) {
    if (userId === undefined || userId === null || userId === '') throw new Error('USER_REQUIRED');
    if (this._deletedUsers.has(String(userId))) throw new Error('ACCOUNT_DELETED');
    this._userId = String(userId);
    this._generation++;
    clearTimeout(this._retryTimer);
    clearTimeout(this._checkinRetryTimer);
  },
  clearUser() {
    this._userId = null;
    this._generation++;
    clearTimeout(this._retryTimer);
    clearTimeout(this._checkinRetryTimer);
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
    return { ...(status || { diary: 'idle', checkins: 'idle' }) };
  },
  exportPendingForUser(verifiedUserId) {
    const userId = String(verifiedUserId);
    return { format: 'telo-local-pending-v1', userId, exportedAt: new Date().toISOString(),
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
        if (candidate.syncStatus === 'synced') continue;
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
            if (this._userId === userId) this._emit(row);
          }
          // Invalid payload/conflict need explicit correction, not busy retry.
          if (![400, 409, 422].includes(error.status)) this._scheduleRetry(userId);
          break;
        }
      }
    };
    const promise = run();
    this._flushing.set(flushKey, promise);
    try { await promise; } finally { this._flushing.delete(flushKey); }
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
    const clientId = crypto.randomUUID();
    const row = { ...entry, clientId, id: clientId, date: entry.date || new Date().toISOString(), syncStatus: 'pending' };
    const rows = [row, ...this._state()];
    if (!this._writeDiary(rows)) row.syncStatus = 'memory-only';
    this._emit(row);
    // Defer network until the caller has rendered the initial honest status.
    Promise.resolve().then(() => this.flushPending());
    return row;
  },

  /** Запись за сегодня (или null) */
  getTodayEntry() {
    const today = new Date().toDateString();
    return this.getDiaryEntries().find(
      e => new Date(e.date).toDateString() === today
    ) || null;
  },

  /** Последние N записей (исключая сегодня, если нужна история) */
  getRecentEntries(n = 5) {
    return this.getDiaryEntries().slice(0, n);
  },

  // ─── Стрик ────────────────────────────────────────────────────────────────

  /** Подсчёт серии дней подряд */
  getStreak() {
    const entries = this.getDiaryEntries();
    if (!entries.length) return 0;

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 90; i++) {
      const day = new Date(today);
      day.setDate(today.getDate() - i);
      const dayStr = day.toDateString();
      const hasEntry = entries.some(e => new Date(e.date).toDateString() === dayStr);

      if (hasEntry) {
        streak++;
      } else if (i > 0) {
        // Разрыв в серии — стоп
        break;
      }
      // i === 0 и нет записи сегодня: продолжаем (учитываем вчера)
    }
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
      return JSON.parse(this._get(KEYS.TRIGGERS)) || [];
    } catch {
      return [];
    }
  },

  /** Формат: { id, date, situation, reactionType, intensity, zone, sensations, note } */
  saveTriggerEntry(entry) {
    const entries = this.getTriggerEntries();
    entries.unshift({ ...entry, id: Date.now(), date: new Date().toISOString() });
    if (entries.length > 90) entries.splice(90);
    this._set(KEYS.TRIGGERS, JSON.stringify(entries));
    if (typeof Api !== 'undefined' && Api.isAuthed()) {
      Api.saveTrigger(entry).catch(() => {});
    }
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
        if (candidate.syncStatus === 'synced' || candidate.legacyScale) continue;
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
            if (this._userId === userId && this._generation === generation) this._emit(row);
          }
          if (![400,409,422].includes(error.status)) this._scheduleCheckinRetry(userId);
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
   *  Ответы дневника/реакций ограничены страницей; локальную очередь сохраняем.
   *  Повтор отправки идёт в фоне и не задерживает переход с заставки. */
  async initFromApi() {
    if (typeof Api === 'undefined' || !Api.isAuthed()) return;
    const userId = this._userId;
    const generation = this._generation;
    if (!userId) return;
    this._historyLoads.set(userId, { diary: 'loading', checkins: 'loading' });
    try {
      const [diary, diag, triggers, checkins, habitual] = await Promise.allSettled([
        Api.getDiary(),
        Api.getDiagResult(),
        Api.getTriggers(),
        Api.getCheckins(),
        Api.getHabitualResult(),
      ]);
      if (this._userId !== userId || this._generation !== generation) return;
      this._historyLoads.set(userId, {
        diary: diary.status === 'fulfilled' && (Array.isArray(diary.value) || Array.isArray(diary.value?.entries)) ? 'loaded' : 'failed',
        checkins: checkins.status === 'fulfilled' && Array.isArray(checkins.value) ? 'loaded' : 'failed'
      });
      if (diary.status === 'fulfilled') {
        const entries = Array.isArray(diary.value) ? diary.value : diary.value?.entries;
        if (Array.isArray(entries)) {
          const remote = entries.map(entry => ({
            ...entry, date: entry.date || entry.createdAt,
            sensations: entry.sensations || [], note: entry.note || '', syncStatus: 'synced'
          }));
          const byIdentity = new Map(remote.map(row => [row.clientId || String(row.id), row]));
          // A paginated/empty GET is never a deletion instruction. Keep cached
          // history and every pending row; server echoes replace its client ID.
          for (const row of this._state(userId)) {
            const identity = row.clientId || String(row.id);
            if (!byIdentity.has(identity)) byIdentity.set(identity, row);
          }
          this._writeDiary([...byIdentity.values()], userId);
        }
      }
      if (diag.status === 'fulfilled' && diag.value) {
        this._set(KEYS.DIAG, JSON.stringify({ ...diag.value, date: diag.value.date || diag.value.createdAt }));
      }
      const localHabitual = this.getHabitualResult();
      if (habitual.status === 'fulfilled' && habitual.value && (!localHabitual || (localHabitual.syncStatus === 'synced' && Date.parse(habitual.value.date) > Date.parse(localHabitual.date)))) {
        try { Habitual.calculate(habitual.value.answers); this._set('habitual_result_v2', JSON.stringify({ ...habitual.value, syncStatus: 'synced' })); } catch {}
      }
      if (localHabitual?.syncStatus === 'pending') this.flushHabitualResult();
      if (triggers.status === 'fulfilled' && triggers.value?.length) {
        const entries = triggers.value.map(t => ({
          id: new Date(t.createdAt).getTime(),
          date: t.createdAt,
          situation: t.situation,
          reactionType: t.reactionType,
          zone: t.zone,
          sensations: t.sensations || [],
          intensity: t.intensity,
          note: t.note || ''
        }));
        this._set(KEYS.TRIGGERS, JSON.stringify(entries));
      }
      if (checkins.status === 'fulfilled' && Array.isArray(checkins.value)) {
        const identity = row => row.dayKey || String(row.id);
        const merged = new Map(checkins.value.map(row => {
          const normalized = { ...this._normalizeCheckin(row), syncStatus: 'synced' };
          return [identity(normalized), normalized];
        }));
        const remoteDates = new Set([...merged.values()].map(row => new Date(row.date).getTime()));
        for (const row of this._checkinState(userId)) {
          // Stage1's cache used a timestamp ID; the server supplies a UUID.
          // Its exact original date identifies that cached copy, never its fake scales.
          if (row.legacyCache && remoteDates.has(new Date(row.date).getTime())) continue;
          const remote = merged.get(identity(row));
          if (!remote || (row.syncStatus !== 'synced' && new Date(row.clientUpdatedAt).getTime() > new Date(remote.clientUpdatedAt || 0).getTime())) merged.set(identity(row), row);
        }
        this._writeCheckins([...merged.values()], userId);
      }
    } catch {
      // Нет связи — работаем с локальным кэшем
      if (this._userId === userId && this._generation === generation) this._historyLoads.set(userId, { diary: 'failed', checkins: 'failed' });
    }
    if (this._userId === userId && this._generation === generation) {
      void this.flushPending().catch(() => this._scheduleRetry(userId));
      void this.flushCheckinsPending().catch(() => this._scheduleCheckinRetry(userId));
    }
  }
};

window.addEventListener?.('online', () => { Storage.flushPending(); Storage.flushCheckinsPending(); });
