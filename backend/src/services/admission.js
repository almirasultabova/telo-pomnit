const db = require('../db')
function isClubAdmin(user) {
  return (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(s => s.trim()).filter(Boolean).includes(String(user.telegramId))
}
function admissionError(user) {
  if (isClubAdmin(user) || user.accessStatus === 'approved') return null
  const rejected = user.accessStatus === 'rejected'
  return { code: rejected ? 'CLUB_ACCESS_REJECTED' : 'CLUB_ACCESS_PENDING', accessStatus: rejected ? 'rejected' : 'pending',
    error: rejected ? 'Доступ не разрешён.' : 'Заявка отправлена. Ожидайте подтверждения.' }
}
async function requestAdmission(user) {
  if (isClubAdmin(user) || user.deletedAt || user.accessStatus !== 'pending') return
  const requested = await db.user.updateMany({ where: { id: user.id, accessStatus: 'pending', accessRequestedAt: null }, data: { accessRequestedAt: new Date() } })
  if (requested.count) void drainAdmissionNotifications()
}
let draining = false
async function drainAdmissionNotifications() {
  if (draining) return
  draining = true
  try {
    const adminIds = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(s=>s.trim()).filter(Boolean)
    if (!adminIds.length) return
    const users = await db.user.findMany({ where: { accessStatus: 'pending', accessRequestedAt: { not: null }, accessNotifiedAt: null, deletedAt: null }, take: 20 })
    for (const user of users) {
      const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.name || 'Новый пользователь'
      const username = user.telegramUsername || user.username
      const text = `Заявка на вход в «Тело помнит»\n\n${name}${username ? '\n@'+username : ''}\nTelegram ID: ${user.telegramId}\n\nРазрешить или отказать можно в разделе «Заявки на доступ» вашего приложения.`
      let delivered = true
      for (const chat_id of adminIds) {
        try {
          const response = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type':'application/json' }, signal: AbortSignal.timeout(5000),
            body: JSON.stringify({chat_id,text,reply_markup:{inline_keyboard:[[{text:'Открыть заявки',web_app:{url:process.env.MINI_APP_URL || 'https://tg-app-telo-pomnit.vercel.app/?v=club-20261006'}}]]}})
          })
          const result = await response.json()
          if (!result.ok) delivered = false
        } catch { delivered = false }
      }
      if (delivered) await db.user.updateMany({ where: { id:user.id,accessNotifiedAt:null }, data:{accessNotifiedAt:new Date()} })
    }
  } catch { console.error('[admission] notification retry pending') }
  finally { draining = false }
}
module.exports = { isClubAdmin, admissionError, requestAdmission, drainAdmissionNotifications }
