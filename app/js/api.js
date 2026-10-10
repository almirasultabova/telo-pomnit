// api.js — клиент для работы с бэкендом «Тело помнит»
// Заменяет прямые обращения к localStorage через API-запросы.

const API_URL = '/api';

// ─── JWT токен ────────────────────────────────────────────────────────────

const Api = {
  // A token from another Telegram account must never authorize cached writes.
  _token: null,
  userId: null,
  _authGeneration: 0,
  isClubAdmin: false,
  clubBlocked: false,

  _setToken(token) {
    this._token = token;
    AppLocalStorage.setItem('tp_jwt', token);
  },

  _headers() {
    const h = { 'Content-Type': 'application/json' };
    if (this._token) h['Authorization'] = 'Bearer ' + this._token;
    return h;
  },

  async _request(method, path, body, timeoutMs = 8000) {
    const generation = this._authGeneration;
    const assertCurrent = () => {
      if (generation !== this._authGeneration) {
        const error = new Error('Сессия изменилась');
        error.code = 'SESSION_CHANGED';
        throw error;
      }
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(API_URL + path, {
        method,
        headers: this._headers(),
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      assertCurrent();
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        assertCurrent();
        const error = new Error(err.error || 'Ошибка сервера');
        error.status = res.status;
        error.code = err.code;
        error.access = err.access;
        if (err.code?.startsWith('CLUB_ACCESS_')) {
          this.clubBlocked = true;
          this.logout();
          showAccessDenied(err.code);
        }
        if (res.status === 401 && path !== '/auth/telegram') {
          this.clubBlocked = true;
          this.logout();
          showAccessDenied('SESSION_EXPIRED');
        }
        throw error;
      }
      const data = res.status === 204 ? null : await res.json();
      assertCurrent();
      return data;
    } catch (e) {
      console.error('[API]', method, path, e.message);
      throw e;
    } finally {
      clearTimeout(timer);
    }
  },

  // ─── Авторизация ─────────────────────────────────────────────────────────

  async auth() {
    this.logout();
    const tg = window.Telegram?.WebApp;
    const initData = tg?.initData || '';
    const data = await this._request('POST', '/auth/telegram', { initData });
    if (!data.token || !data.user?.id) throw new Error('Сервер не подтвердил аккаунт');
    const previousOwner = Storage._userId;
    Storage.bindUser(data.user.id);
    if (previousOwner !== String(data.user.id) && typeof clearPrivateConversationState === 'function') clearPrivateConversationState();
    this.userId = data.user.id;
    this._setToken(data.token);
    this.clubBlocked = false;
    this.isClubAdmin = data.user?.isClubAdmin === true;
    // Синхронизируем согласие и онбординг: если на сервере уже зафиксировано — ставим флаги локально
    Storage.setConsentFromServer(Boolean(data.user.consentGivenAt));
    return data.user;
  },

  isAuthed() {
    return !!this._token;
  },

  logout() {
    this._authGeneration++;
    this._token = null;
    this.userId = null;
    this.isClubAdmin = false;
    AppLocalStorage.removeItem('tp_jwt');
    if (typeof Storage !== 'undefined') Storage.clearUser();
  },

  // ─── Профиль ──────────────────────────────────────────────────────────────

  async getMe() {
    return this._request('GET', '/me');
  },

  async updateMe(data) {
    return this._request('PATCH', '/me', data);
  },

  async giveConsent() {
    return this._request('PATCH', '/me/consent');
  },

  async getAccess() {
    return this._request('GET', '/me/enrollment/access');
  },
  async getAdmissions() { return this._request('GET', '/admin/admissions'); },
  async decideAdmission(id, status) { return this._request('PATCH', '/admin/admissions/' + encodeURIComponent(id), { status }); },

  // ─── Дневник ──────────────────────────────────────────────────────────────

  async getDiary() {
    return this._getAll('/diary', 90);
  },
  async _getAll(path, pageSize) {
    const generation = this._authGeneration, rows = [], seen = new Set();
    for (let page = 0; page < 100; page++) {
      if (generation !== this._authGeneration) throw Object.assign(new Error('Сессия изменилась'), { code: 'SESSION_CHANGED' });
      const offset = page * pageSize;
      const result = await this._request('GET', path + '?limit=' + pageSize + (offset ? '&offset=' + offset : ''));
      if (generation !== this._authGeneration) throw Object.assign(new Error('Сессия изменилась'), { code: 'SESSION_CHANGED' });
      const entries = Array.isArray(result) ? result : result?.entries;
      if (!Array.isArray(entries)) throw Object.assign(new Error('Неверный ответ истории'), { code: 'INVALID_HISTORY' });
      for (const row of entries) {
        if (!row?.id) throw Object.assign(new Error('Запись истории без идентификатора'), { code: 'INVALID_HISTORY' });
        if (!seen.has(row.id)) { seen.add(row.id); rows.push(row); }
      }
      if (entries.length < pageSize) return rows;
    }
    throw Object.assign(new Error('История слишком велика для одной загрузки'), { code: 'HISTORY_TOO_LARGE' });
  },

  async saveDiaryEntry(entry) {
    return this._request('POST', '/diary', entry);
  },

  async getDiaryStats() {
    return this._request('GET', '/diary/stats');
  },

  // ─── Чекины ───────────────────────────────────────────────────────────────

  async getTodayCheckin() {
    return this._request('GET', '/checkins/today');
  },

  async getCheckins() {
    return this._getAll('/checkins', 200);
  },

  async saveCheckin(data) {
    // Send five original answers/date/edit version, never replace them with an average.
    return this._request('POST', '/checkins', data);
  },

  // ─── Триггеры ─────────────────────────────────────────────────────────────

  async getTriggers() {
    return this._request('GET', '/triggers?limit=90');
  },

  async saveTrigger(data) {
    return this._request('POST', '/triggers', data);
  },

  // ─── Диагностика ──────────────────────────────────────────────────────────

  async getDiagResult() {
    return this._request('GET', '/diagnostic/result');
  },

  async getHabitualResult() { return this._request('GET', '/habitual/result'); },
  async saveHabitualResult(data) { return this._request('POST', '/habitual/result', data); },

  async saveDiagResult(data) {
    return this._request('POST', '/diagnostic/result', data);
  },

  // ─── AI чат ───────────────────────────────────────────────────────────────

  async aiChat(message, sessionId, context = {}) {
    const body = { message };
    if (sessionId) body.sessionId = sessionId;
    else {
      body.contextMode = context.contextMode || 'none';
      body.contextVersion = 'diary-selection-v1';
      if (body.contextMode === 'selected') {
        body.diaryEntryIds = context.diaryEntryIds || [];
        body.contextPreviewHash = context.contextPreviewHash;
      }
    }
    return this._request('POST', '/ai/chat', body, 60000);
  },

  async getAiSessions() { return this._request('GET', '/ai/sessions'); },
  async getAiSession(sessionId) { return this._request('GET', '/ai/sessions/' + encodeURIComponent(sessionId)); },
  async previewAiContext(ids) { return this._request('POST', '/ai/context-preview', { diaryEntryIds: ids }); },

  // ─── Анкеты ───────────────────────────────────────────────────────────────

  async getQuestionnaireStatus(streamId) {
    return this._request('GET', `/questionnaires/${streamId}`);
  },

  async saveQuestionnairePre(streamId, answers) {
    return this._request('POST', '/questionnaires/pre', { streamId, answers });
  },

  // ─── Обратная связь ──────────────────────────────────────────────────────

  async sendFeedback({ rating, text }) {
    const body = { text };
    if (rating) body.rating = rating;
    return this._request('POST', '/feedback', body);
  },
};

// Purpose-limited token is kept only in this WebView memory. It never replaces
// the club JWT or binds the personal cache, including for rejected applicants.
const DataRightsApi = {
  _token: null, userId: null, accountDeleted: false, expiresAt: 0, _generation: 0,
  clear() { this._generation++; this._token = null; this.userId = null; this.expiresAt = 0; },
  async auth() {
    const generation = ++this._generation;
    if (typeof clearPreparedDiaryPdf === 'function') clearPreparedDiaryPdf();
    const data = await this.request('POST', '/auth/data-rights', { initData: window.Telegram?.WebApp?.initData || '' }, true);
    if (generation !== this._generation) throw new Error('Проверка личности изменилась. Откройте раздел заново.');
    if (!data.token || !data.user?.id) throw new Error('Сервер не подтвердил владельца данных.');
    this._token = data.token; this.userId = String(data.user.id); this.accountDeleted = data.accountDeleted === true;
    this.expiresAt = Date.now() + (data.expiresIn || 600) * 1000;
    return data;
  },
  async request(method, path, body, unauthenticated = false) {
    if (!unauthenticated && (!this._token || Date.now() >= this.expiresAt)) await this.auth();
    const generation = this._generation;
    const assertCurrent = () => { if (generation !== this._generation) throw new Error('Проверка личности изменилась. Откройте раздел заново.'); };
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(API_URL + path, { method, headers: { 'Content-Type': 'application/json', ...(!unauthenticated ? { Authorization: 'Bearer ' + this._token } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: controller.signal });
      assertCurrent();
      const data = res.status === 204 ? null : await res.json();
      assertCurrent();
      if (!res.ok) throw new Error(data?.error || 'Не удалось выполнить действие с данными.');
      return data;
    } finally { clearTimeout(timer); }
  },
  exportAll() { return this.request('GET', '/gdpr/my-data'); },
  async downloadDiaryPdf() {
    const expectedOwner = this.userId;
    if (!this._token || Date.now() >= this.expiresAt) await this.auth();
    if (expectedOwner && expectedOwner !== this.userId) throw new Error('Владелец данных изменился. Откройте раздел заново.');
    const generation = this._generation, owner = this.userId;
    const check = () => { if (generation !== this._generation || owner !== this.userId) throw new Error('Проверка личности изменилась. Повторите загрузку.'); };
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 60000);
    try {
      check();
      const response = await fetch(API_URL + '/gdpr/diary.pdf', { headers: { Authorization: 'Bearer ' + this._token }, signal: controller.signal });
      check();
      if (!response.ok) { const error = await response.json().catch(() => ({})); check(); throw new Error(error.error || 'Не удалось подготовить PDF. Можно повторить.'); }
      if (!response.headers.get('content-type')?.includes('application/pdf')) throw new Error('Сервер не вернул PDF. Можно повторить.');
      const buffer = await response.arrayBuffer(); check();
      const prefix = new Uint8Array(buffer, 0, Math.min(5, buffer.byteLength));
      if (String.fromCharCode(...prefix) !== '%PDF-') throw new Error('Файл PDF не подтверждён. Можно повторить.');
      return new Blob([buffer], { type: 'application/pdf' });
    } finally { clearTimeout(timer); }
  },
  deleteMe() { return this.request('DELETE', '/gdpr/delete-me', { confirm: 'DELETE_MY_DATA' }); }
};
