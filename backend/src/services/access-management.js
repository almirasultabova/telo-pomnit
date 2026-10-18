const db = require('../db')
const ownerIds = () => (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(s => s.trim()).filter(Boolean)
const isOwner = u => Boolean(u && ownerIds().includes(String(u.telegramId)))
const canManage = u => Boolean(u && !u.deletedAt && (isOwner(u) || (u.role === 'ADMIN' && u.accessStatus === 'approved')))
const error = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode })
const publicSelect = { id:true, telegramId:true, name:true, firstName:true, lastName:true, telegramUsername:true, username:true, role:true, accessStatus:true, accessRevision:true, accessRequestedAt:true, accessDecidedAt:true, lastSeenAt:true }
const publicUser = u => ({ ...u, telegramId:String(u.telegramId), owner:isOwner(u) })
function authorize(actor, target, role) {
  if (!canManage(actor)) throw error('Нет прав на управление доступом', 403)
  if (!target || target.deletedAt) throw error('Аккаунт не найден', 404)
  if (isOwner(target) || actor.id === target.id) throw error('Собственный доступ и владельца здесь менять нельзя', 403)
  if (!isOwner(actor) && (target.role === 'ADMIN' || role === 'ADMIN')) throw error('Администраторов назначает и изменяет только владелец', 403)
}
async function actorByTelegram(id) {
  const actor = await db.user.findUnique({ where:{ telegramId:BigInt(id) } })
  if (!canManage(actor)) throw error('Нет прав на управление доступом', 403)
  return actor
}
async function openAction(actorId, targetId) {
  const [actor,target] = await Promise.all([db.user.findUnique({where:{id:actorId}}),db.user.findUnique({where:{id:targetId}})])
  authorize(actor,target,target?.role)
  const streamChoices = await db.stream.findMany({where:{isActive:true},select:{id:true,name:true},orderBy:[{startDate:'desc'},{id:'asc'}],take:20})
  return db.accessAction.create({data:{actorId,targetId,expectedRevision:target.accessRevision,role:target.role,streamChoices,expiresAt:new Date(Date.now()+15*60000)}})
}
async function readAction(actorId, id) {
  const action = await db.accessAction.findUnique({where:{id}})
  if (!action || action.actorId !== actorId) throw error('Решение не найдено',404)
  if (action.usedAt || action.expiresAt <= new Date()) throw error('Решение уже принято или устарело. Откройте карточку заново.')
  const [actor,target] = await Promise.all([db.user.findUnique({where:{id:actorId}}),db.user.findUnique({where:{id:action.targetId}})])
  authorize(actor,target,action.role)
  if (target.accessRevision !== action.expectedRevision) throw error('Доступ уже изменён. Откройте карточку заново.')
  return {action,actor,target}
}
async function changeAction(actorId,id,changes) {
  const {action,actor,target} = await readAction(actorId,id)
  if ((changes.status || action.status) === 'rejected') changes = {...changes,role:target.role,streamId:null,basis:'none'}
  const next = {...action,...changes}
  if (!['approved','rejected'].includes(next.status) || !['HOST','ADMIN','PARTICIPANT'].includes(next.role) || !['none','paid','cash','free','revoke'].includes(next.basis)) throw error('Неверные параметры решения',400)
  authorize(actor,target,next.role)
  if (next.basis !== 'none' && !next.streamId) throw error('Выберите поток',400)
  if (next.streamId && !await db.stream.findUnique({where:{id:next.streamId}})) throw error('Поток не найден',404)
  const changed = await db.accessAction.updateMany({where:{id,actorId,usedAt:null,expiresAt:{gt:new Date()}},data:changes})
  if (!changed.count) throw error('Решение уже принято или устарело')
  return db.accessAction.findUnique({where:{id}})
}
async function confirmAction(actorId,id) {
  const result = await db.$transaction(async tx => {
    const action = await tx.accessAction.findUnique({where:{id}})
    if (!action || action.actorId !== actorId) throw error('Решение не найдено',404)
    // Shared row locks serialize decisions, deletion and permission revocation.
    await tx.$queryRawUnsafe('SELECT id FROM users WHERE id IN ($1,$2) ORDER BY id FOR UPDATE',actorId,action.targetId)
    const [actor,target] = await Promise.all([tx.user.findUnique({where:{id:actorId}}),tx.user.findUnique({where:{id:action.targetId}})])
    authorize(actor,target,action.role)
    if (target.accessRevision !== action.expectedRevision || action.usedAt || action.expiresAt <= new Date()) throw error('Решение устарело или уже принято. Обновите список.')
    const claimed = await tx.accessAction.updateMany({where:{id,usedAt:null,expiresAt:{gt:new Date()},status:action.status,role:action.role,streamId:action.streamId,basis:action.basis,expectedRevision:action.expectedRevision},data:{usedAt:new Date()}})
    if (!claimed.count) throw error('Решение уже принято или выбор изменился. Откройте карточку заново.')
    let enrollment = null, enrollmentBefore = null
    if (action.status === 'approved' && action.streamId && action.basis !== 'none') {
      const stream = await tx.stream.findUnique({where:{id:action.streamId}})
      if (!stream) throw error('Поток не найден',404)
      const all = await tx.enrollment.findMany({where:{userId:target.id,streamId:stream.id},orderBy:{createdAt:'desc'}})
      enrollmentBefore = all.map(e=>({id:e.id,status:e.status,basis:e.accessBasis,paidAt:e.paidAt?new Date(e.paidAt).toISOString():null,paymentId:e.paymentId}))
      const paid = all.find(e=>e.paidAt && ['active','completed'].includes(e.status))
      if (action.basis === 'paid') {
        const verified = paid?.paymentId && await tx.paymentOrder.findFirst({where:{paymentId:paid.paymentId,streamId:stream.id,processedAt:{not:null}}})
        if (!verified) throw error('Онлайн-оплата этого потока не подтверждена. Если деньги получены наличными, выберите «Оплачено наличными».',400)
        enrollment = {streamId:stream.id,basis:'paid'}
      } else if (action.basis === 'cash') {
        if (all.some(e=>e.paidAt && e.paymentId && ['active','completed'].includes(e.status))) throw error('Для этого потока уже есть онлайн-оплата. Выберите «Оплачено онлайн».',400)
        const previous = all.find(e=>e.accessBasis==='cash' && !e.paymentId) || all.find(e=>!e.paymentId && ['active','pending','completed'].includes(e.status) && (!e.paidAt || !e.accessBasis || e.accessBasis==='free'))
        const data = {status:'active',accessBasis:'cash',paidAt:previous?.paidAt || new Date(),accessExpires:null}
        let saved
        if (previous) {
          const changed = await tx.enrollment.updateMany({where:{id:previous.id,status:previous.status,accessBasis:previous.accessBasis,paidAt:previous.paidAt,paymentId:null},data})
          if (!changed.count) throw error('Оплата уже изменилась. Откройте карточку заново.')
          saved = {id:previous.id,...data}
        } else saved = await tx.enrollment.create({data:{...data,userId:target.id,streamId:stream.id}})
        enrollment = {id:saved.id,streamId:stream.id,basis:'cash',paidAt:new Date(saved.paidAt).toISOString(),confirmation:'manual_cash'}
      } else if (action.basis === 'revoke') {
        await tx.enrollment.updateMany({where:{userId:target.id,streamId:stream.id,status:{in:['active','completed']}},data:{status:'cancelled'}})
        enrollment = {streamId:stream.id,basis:'revoke'}
      } else {
        if (paid) throw error('Для этого потока уже есть оплата. Выберите подтверждённую оплату.',400)
        const free = all.find(e=>e.accessBasis === 'free')
        const data = {status:'active',accessBasis:'free',accessExpires:null}
        if (free) await tx.enrollment.update({where:{id:free.id},data})
        else await tx.enrollment.create({data:{...data,userId:target.id,streamId:stream.id}})
        enrollment = {streamId:stream.id,basis:'free'}
      }
    }
    const before = {role:target.role,status:target.accessStatus,revision:target.accessRevision,...(enrollmentBefore?{enrollments:enrollmentBefore}:{})}
    const updated = await tx.user.update({where:{id:target.id},data:{role:action.status==='approved'?action.role:target.role,accessStatus:action.status,accessDecidedAt:new Date(),accessDecidedBy:actorId,accessRevision:{increment:1},tokenVersion:{increment:1}}})
    const after = {role:updated.role,status:updated.accessStatus,revision:updated.accessRevision,enrollment}
    await tx.accessAudit.create({data:{actorId,targetId:target.id,actionId:id,before,after}})
    if(target.accessStatus!==updated.accessStatus) await tx.accessNotice.create({data:{actionId:id,targetId:target.id,status:updated.accessStatus}})
    return {user:publicUser({...updated,telegramId:updated.telegramId}),after}
  })
  void require('./access-notices').drainAccessNotices()
  return result
}
module.exports = {isOwner,canManage,actorByTelegram,openAction,readAction,changeAction,confirmAction,publicSelect,publicUser}
