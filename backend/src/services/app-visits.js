// Confirmed application openings, separate from diary activity. The caller holds the user row lock.
function dayIndex(value) { return Math.floor((new Date(value).getTime() + 10800000) / 86400000) }
function currentVisitStreak(user, now = new Date()) {
  const day = dayIndex(now), last = user.appVisitDay ? dayIndex(user.appVisitDay + 'T12:00:00+03:00') : NaN
  return (last === day || last === day - 1) ? user.appVisitStreak : 0
}
async function recordAppVisit(tx, user, now = new Date()) {
  const today = dayIndex(now), last = user.appVisitDay ? dayIndex(user.appVisitDay + 'T12:00:00+03:00') : NaN
  const streak = last === today ? user.appVisitStreak : last === today - 1 ? user.appVisitStreak + 1 : 1
  return tx.user.update({ where: { id: user.id }, data: {
    lastSeenAt: now, appVisitDay: new Date(today * 86400000).toISOString().slice(0, 10), appVisitStreak: streak
  } })
}
module.exports = { dayIndex, currentVisitStreak, recordAppVisit }
