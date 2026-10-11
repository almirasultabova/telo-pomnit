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
    await db.accessAction.deleteMany({where:{expiresAt:{lt:new Date(Date.now()-86400000)}}})
    const adminIds = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(s=>s.trim()).filter(Boolean)
    if (!adminIds.length) return
    const users = await db.user.findMany({ where: { accessStatus: 'pending', accessRequestedAt: { not: null }, accessNotifiedAt: null, deletedAt: null }, take: 20 })
    for (const user of users) {
      const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.name || 'Новый пользователь'
      const username = user.telegramUsername || user.username
      const text = `Заявка на вход в «Тело помнит»\n\n${name}${username ? '\n@'+username : ''}\nTelegram ID: ${user.telegramId}\n\nНажмите кнопку ниже, выберите роль и поток, затем подтвердите решение.`
      const lease = await db.user.updateMany({where:{id:user.id,accessStatus:'pending',accessNotifiedAt:null,OR:[{admissionLeaseUntil:null},{admissionLeaseUntil:{lt:new Date()}}]},data:{admissionLeaseUntil:new Date(Date.now()+60000)}})
      if(!lease.count) continue
      const already = new Set(user.admissionDeliveredIds || [])
      let delivered = true
      for (const chat_id of adminIds) {
        if(already.has(chat_id)) continue
        try {
          const response = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type':'application/json' }, signal: AbortSignal.timeout(5000),
            body: JSON.stringify({chat_id,text,reply_markup:require('./access-bot').entryKeyboard(user.id)})
          })
          const result = await response.json()
          if (!result.ok) delivered = false
          else await db.user.update({where:{id:user.id},data:{admissionDeliveredIds:{push:chat_id}}})
        } catch { delivered = false }
      }
      if (delivered) await db.user.updateMany({ where: { id:user.id,accessNotifiedAt:null }, data:{accessNotifiedAt:new Date(),admissionLeaseUntil:null} })
    }
  } catch { console.error('[admission] notification retry pending') }
  finally { draining = false }
}
module.exports = { isClubAdmin, admissionError, requestAdmission, drainAdmissionNotifications }
