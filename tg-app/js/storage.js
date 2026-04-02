// storage.js — обёртка над localStorage для хранения данных пользователя.
// Локальный кэш + фоновая синхронизация с бэкендом через Api.

const KEYS = {
  DIARY:          'tp_diary_entries',      // массив записей дневника
  DIAG:           'tp_diag_result',        // результат диагностики
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

  // ─── Дневник ──────────────────────────────────────────────────────────────

  /** Получить все записи, от новых к старым */
  getDiaryEntries() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.DIARY)) || [];
    } catch {
      return [];
    }
  },

  /** Сохранить новую запись. Формат:
   *  { id, date (ISO), zone (id), sensations ([id,...]), note (string) }
   */
  saveDiaryEntry(entry) {
    const entries = this.getDiaryEntries();
    entries.unshift({ ...entry, id: Date.now() });
    // Хранить не более 90 записей (~6 недель)
    if (entries.length > 90) entries.splice(90);
    localStorage.setItem(KEYS.DIARY, JSON.stringify(entries));
    // Фоновая синхронизация с бэкендом
    if (typeof Api !== 'undefined' && Api.isAuthed()) {
      Api.saveDiaryEntry(entry).catch(() => {});
    }
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

  /** Сохранить результат диагностики. Формат: { patternId, date, scores } */
  saveDiagResult(result) {
    localStorage.setItem(KEYS.DIAG, JSON.stringify(result));
    // Фоновая синхронизация с бэкендом
    if (typeof Api !== 'undefined' && Api.isAuthed()) {
      Api.saveDiagResult(result).catch(() => {});
    }
  },

  /** Получить сохранённый результат или null */
  getDiagResult() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.DIAG)) || null;
    } catch {
      return null;
    }
  },

  /** Сбросить результат (пройти заново) */
  clearDiagResult() {
    localStorage.removeItem(KEYS.DIAG);
  },

  // ─── Онбординг ────────────────────────────────────────────────────────────

  isOnboardingDone() {
    return localStorage.getItem(KEYS.ONBOARDING) === 'true';
  },

  setOnboardingDone() {
    localStorage.setItem(KEYS.ONBOARDING, 'true');
  },

  // ─── Оффер ────────────────────────────────────────────────────────────────

  isOfferSeen() {
    return localStorage.getItem(KEYS.OFFER_SEEN) === 'true';
  },

  setOfferSeen() {
    localStorage.setItem(KEYS.OFFER_SEEN, 'true');
  },

  // ─── Дневник реакций (Стоп-реакция) ─────────────────────────────────────

  getTriggerEntries() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.TRIGGERS)) || [];
    } catch {
      return [];
    }
  },

  /** Формат: { id, date, situation, reactionType, intensity, zone, sensations, note } */
  saveTriggerEntry(entry) {
    const entries = this.getTriggerEntries();
    entries.unshift({ ...entry, id: Date.now(), date: new Date().toISOString() });
    if (entries.length > 90) entries.splice(90);
    localStorage.setItem(KEYS.TRIGGERS, JSON.stringify(entries));
    if (typeof Api !== 'undefined' && Api.isAuthed()) {
      Api.saveTrigger(entry).catch(() => {});
    }
  },

  // ─── Посещаемость встреч ──────────────────────────────────────────────────

  getAttended() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.ATTENDED)) || [];
    } catch {
      return [];
    }
  },

  /** Переключить отметку: была / не была. Возвращает новое состояние (true = отмечена) */
  toggleAttended(meetingId) {
    const list = this.getAttended();
    const idx  = list.indexOf(meetingId);
    if (idx >= 0) { list.splice(idx, 1); } else { list.push(meetingId); }
    localStorage.setItem(KEYS.ATTENDED, JSON.stringify(list));
    return idx < 0; // true = только что добавлена
  },

  isAttended(meetingId) {
    return this.getAttended().includes(meetingId);
  },

  // ─── Трекер изменений (чекины) ───────────────────────────────────────────

  getCheckins() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.CHECKINS)) || [];
    } catch {
      return [];
    }
  },

  /** Формат: { id, date, tension, anxiety, energy, safety, bodyContact, note } */
  saveCheckin(checkin) {
    const list = this.getCheckins();
    list.push({ ...checkin, id: Date.now(), date: new Date().toISOString() });
    localStorage.setItem(KEYS.CHECKINS, JSON.stringify(list));
    if (typeof Api !== 'undefined' && Api.isAuthed()) {
      const avg = Math.round(
        (checkin.tension + checkin.anxiety + checkin.energy + checkin.safety + checkin.bodyContact) / 5
      );
      Api.saveCheckin({ bodyScore: avg, note: checkin.note || '' }).catch(() => {});
    }
  },

  // ─── Анкета ───────────────────────────────────────────────────────────────

  isQuestionnaireDone() {
    return localStorage.getItem(KEYS.QUESTIONNAIRE) === 'true';
  },

  setQuestionnaireDone() {
    localStorage.setItem(KEYS.QUESTIONNAIRE, 'true');
  },

  isQSheetShown() {
    return localStorage.getItem(KEYS.Q_SHEET_SHOWN) === 'true';
  },

  setQSheetShown() {
    localStorage.setItem(KEYS.Q_SHEET_SHOWN, 'true');
  },

  // ─── Согласие на обработку данных (ФЗ-152) ───────────────────────────────

  isConsentGiven() {
    return localStorage.getItem(KEYS.CONSENT) === 'true';
  },

  setConsentGiven() {
    localStorage.setItem(KEYS.CONSENT, 'true');
  },

  // ─── Синхронизация с бэкендом ─────────────────────────────────────────────

  /** Загрузить данные с сервера и положить в localStorage.
   *  Вызывается при старте приложения после авторизации. */
  async initFromApi() {
    if (typeof Api === 'undefined' || !Api.isAuthed()) return;
    try {
      const [diary, diag] = await Promise.allSettled([
        Api.getDiary(),
        Api.getDiagResult(),
      ]);
      if (diary.status === 'fulfilled' && diary.value?.entries?.length) {
        localStorage.setItem(KEYS.DIARY, JSON.stringify(diary.value.entries));
      }
      if (diag.status === 'fulfilled' && diag.value) {
        localStorage.setItem(KEYS.DIAG, JSON.stringify(diag.value));
      }
    } catch {
      // Нет связи — работаем с локальным кэшем
    }
  }
};
