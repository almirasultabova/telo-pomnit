const db = require('../db')
const { requireAuth } = require('../services/auth')
const management = require('../services/access-management')
async function guard(request,reply) {
  await requireAuth(request,reply)
  if (!reply.sent && !management.canManage(request.user)) return reply.code(403).send({error:'Нет прав на управление доступом'})
}
async function routes(app) {
  app.addHook('onSend',async (req,reply,payload)=>{reply.header('Cache-Control','private, no-store');return payload})
  app.get('/access-admin/session',{preHandler:guard},async req=>({owner:management.isOwner(req.user),id:req.user.id}))
  app.get('/access-admin/users',{preHandler:guard,schema:{querystring:{type:'object',additionalProperties:false,properties:{search:{type:'string',maxLength:100},status:{type:'string',enum:['pending','approved','rejected']},role:{type:'string',enum:['HOST','ADMIN','PARTICIPANT']},stream:{type:'string',maxLength:40},page:{type:'integer',minimum:1,default:1}}}}},async req=>{
    const {search,status,role,stream,page=1}=req.query
    const where={deletedAt:null,...(status?{accessStatus:status}:{}),...(role?{role}:{}),...(stream?{enrollments:{some:{streamId:stream,status:{in:['active','completed']}}}}:{})}
    if(search) where.OR=['name','firstName','telegramUsername','username'].map(key=>({[key]:{contains:search.replace(/^@/,''),mode:'insensitive'}}))
    const [rows,total]=await Promise.all([db.user.findMany({where,select:{...management.publicSelect,enrollments:{select:{streamId:true,status:true,paidAt:true,accessBasis:true,accessExpires:true,stream:{select:{name:true}}}}},orderBy:[{accessRequestedAt:'desc'},{id:'asc'}],take:30,skip:(page-1)*30}),db.user.count({where})])
    return {items:rows.map(management.publicUser),total,page,pageSize:30}
  })
  app.get('/access-admin/streams',{preHandler:guard},async()=>db.stream.findMany({select:{id:true,name:true,startDate:true,endDate:true,isActive:true},orderBy:{startDate:'desc'}}))
  app.get('/access-admin/audit',{preHandler:guard},async()=>{
    const rows=await db.accessAudit.findMany({orderBy:{createdAt:'desc'},take:100})
    const ids=[...new Set(rows.flatMap(r=>[r.actorId,r.targetId]))]
    const users=await db.user.findMany({where:{id:{in:ids}},select:{id:true,name:true,firstName:true,lastName:true,deletedAt:true}})
    const names=new Map(users.map(u=>[u.id,u.deletedAt?'Удалённый аккаунт':u.name || [u.firstName,u.lastName].filter(Boolean).join(' ') || u.id]))
    return rows.map(r=>({...r,actorName:names.get(r.actorId)||r.actorId,targetName:names.get(r.targetId)||r.targetId}))
  })
  app.get('/access-admin/stats',{preHandler:guard},async()=>{
    const [pending,approved,rejected,entered,diary,checkins,triggers,paid,free,errors]=await Promise.all([
      ...['pending','approved','rejected'].map(accessStatus=>db.user.count({where:{deletedAt:null,accessStatus}})),
      db.user.count({where:{deletedAt:null,lastSeenAt:{not:null}}}),db.diaryEntry.count(),db.checkin.count(),db.triggerEntry.count(),
      db.enrollment.count({where:{paidAt:{not:null},status:{in:['active','completed']}}}),db.enrollment.count({where:{paidAt:null,accessBasis:'free',status:{in:['active','completed']}}}),
      db.operationalMetric.findMany({where:{day:{gte:new Date(Date.now()-6*86400000).toISOString().slice(0,10)}},orderBy:{day:'desc'}})
    ])
    return {pending,approved,rejected,entered,diary,checkins,triggers,paid,free,errors,measuredSince:'2026-10-11',serverTime:new Date().toISOString()}
  })
  app.post('/access-admin/actions',{preHandler:guard,schema:{body:{type:'object',additionalProperties:false,required:['targetId'],properties:{targetId:{type:'string',format:'uuid'}}}}},req=>management.openAction(req.user.id,req.body.targetId))
  app.patch('/access-admin/actions/:id',{preHandler:guard,schema:{body:{type:'object',additionalProperties:false,properties:{status:{type:'string',enum:['approved','rejected']},role:{type:'string',enum:['PARTICIPANT','HOST','ADMIN']},streamId:{type:['string','null'],maxLength:40},basis:{type:'string',enum:['none','free','paid','cash','revoke']}}}}},req=>management.changeAction(req.user.id,req.params.id,req.body))
  app.post('/access-admin/actions/:id/confirm',{preHandler:guard},async req=>{
    const result=await management.confirmAction(req.user.id,req.params.id)
    return {ok:true,after:result.after}
  })
}
module.exports=routes
