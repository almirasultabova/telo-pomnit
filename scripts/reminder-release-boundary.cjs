// One-time rollout reservation: old fixed cron has no durable history.
// Suppress only slots that might already have run today; never mark them delivered.
async function reserveLegacyReminderSlots(db, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = type => parts.find(p => p.type === type).value;
  const day = `${get('year')}-${get('month')}-${get('day')}`, time = `${get('hour')}:${get('minute')}`;
  const result = { day, time, dailyReserved: 0, questionnaireReserved: 0 };
  for (const [field, threshold, key] of [['dailyReminderAttemptDay', '20:00', 'dailyReserved'], ['questionnaireReminderAttemptDay', '10:00', 'questionnaireReserved']]) {
    if (time >= threshold) result[key] = (await db.user.updateMany({ where: { [field]: null }, data: { [field]: day } })).count;
  }
  return result;
}
module.exports = { reserveLegacyReminderSlots };
