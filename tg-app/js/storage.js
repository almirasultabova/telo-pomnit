// storage.js — обёртка над localStorage для хранения данных пользователя.
// Все данные хранятся локально на устройстве — backend не нужен.

const KEYS = {
  DIARY:      'tp_diary_entries',   // массив записей дневника
  DIAG:       'tp_diag_result',     // результат диагностики
  ONBOARDING: 'tp_onboarding_done', // флаг завершения онбординга
  OFFER_SEEN: 'tp_offer_seen'       // флаг показа оффера при первом открытии
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
  }
};
