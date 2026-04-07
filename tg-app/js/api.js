// api.js — клиент для работы с бэкендом «Тело помнит»
// Заменяет прямые обращения к localStorage через API-запросы.

const API_URL = 'https://api.telo-pomnit.ru';

// ─── JWT токен ────────────────────────────────────────────────────────────

const Api = {
  _token: localStorage.getItem('tp_jwt') || null,

  _setToken(token) {
    this._token = token;
    localStorage.setItem('tp_jwt', token);
  },

  _headers() {
    const h = { 'Content-Type': 'application/json' };
    if (this._token) h['Authorization'] = 'Bearer ' + this._token;
    return h;
  },

  async _request(method, path, body) {
    try {
      const res = await fetch(API_URL + path, {
        method,
        headers: this._headers(),
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Ошибка сервера');
      }
      return res.status === 204 ? null : res.json();
    } catch (e) {
      console.error('[API]', method, path, e.message);
      throw e;
    }
  },

  // ─── Авторизация ─────────────────────────────────────────────────────────

  async auth() {
    const tg = window.Telegram?.WebApp;
    const initData = tg?.initData || '';
    const data = await this._request('POST', '/auth/telegram', { initData });
    this._setToken(data.token);
    // Синхронизируем согласие и онбординг: если на сервере уже зафиксировано — ставим флаги локально
    if (data.user?.consentGivenAt) {
      Storage.setConsentGiven();
      Storage.setOnboardingDone(); // пользователь уже проходил онбординг — не показывать повторно
    }
    return data.user;
  },

  isAuthed() {
    return !!this._token;
  },

  logout() {
    this._token = null;
    localStorage.removeItem('tp_jwt');
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

  // ─── Дневник ──────────────────────────────────────────────────────────────

  async getDiary() {
    return this._request('GET', '/diary');
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

  async saveCheckin(data) {
    return this._request('POST', '/checkins', data);
  },

  // ─── Триггеры ─────────────────────────────────────────────────────────────

  async getTriggers() {
    return this._request('GET', '/triggers');
  },

  async saveTrigger(data) {
    return this._request('POST', '/triggers', data);
  },

  // ─── Диагностика ──────────────────────────────────────────────────────────

  async getDiagResult() {
    return this._request('GET', '/diagnostic/result');
  },

  async saveDiagResult(data) {
    return this._request('POST', '/diagnostic/result', data);
  },

  // ─── AI чат ───────────────────────────────────────────────────────────────

  async aiChat(message, sessionId) {
    const body = { message };
    if (sessionId) body.sessionId = sessionId;
    return this._request('POST', '/ai/chat', body);
  },

  // ─── Анкеты ───────────────────────────────────────────────────────────────

  async getQuestionnaireStatus(streamId) {
    return this._request('GET', `/questionnaires/${streamId}`);
  },

  async saveQuestionnairePre(streamId, answers) {
    return this._request('POST', '/questionnaires/pre', { streamId, answers });
  },
};
