const { isOwner } = require('./access-management')
const fail = (message, statusCode = 403) => Object.assign(new Error(message), { statusCode })
const name = u => u?.name || [u?.firstName,u?.lastName].filter(Boolean).join(' ') || 'Без имени'
const day = x => new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'}).format(new Date(x))
const midnight = x => new Date(day(x)+'T00:00:00+03:00')
const endDay = x => new Date(+midnight(x)+86400000)
const entitled = e => ['active','completed'].includes(e.status) && Boolean(e.paidAt || e.accessBasis==='free' || +e.createdAt<Date.parse('2026-09-22T16:00:00+03:00'))
const memberSelect = {id:true,name:true,firstName:true,lastName:true,analyticsExcluded:true,role:true,accessStatus:true,deletedAt:true,telegramId:true,telegramUsername:true,username:true}
async function permission(db, user, streamId, lock=false) {
  const current=user&&await db.user.findUnique({where:{id:user.id}})
  if(!current||current.tokenVersion!==user.tokenVersion) throw fail('Сессия изменилась')
  user=current
  if(!user || user.deletedAt) throw fail('Доступ к обзору закрыт')
  if(isOwner(user)) return {owner:true,triage:true}
  if(user.role!=='HOST' || user.accessStatus!=='approved') throw fail('Доступ к обзору закрыт')
  if(lock) await db.$queryRawUnsafe('SELECT user_id FROM stream_overview_grants WHERE user_id=$1 AND stream_id=$2 FOR UPDATE',user.id,streamId)
  const grants=await db.streamOverviewGrant.findMany({where:{userId:user.id,...(streamId?{streamId}:{})}})
  if(!grants.length) throw fail('Этот поток недоступен')
  return {owner:false,triage:false,streamIds:grants.map(g=>g.streamId)}
}
async function session(db,user) {
  const rights=await permission(db,user)
  const streams=await db.stream.findMany({where:rights.owner?{}:{id:{in:rights.streamIds}},select:{id:true,name:true,startDate:true,endDate:true},orderBy:{startDate:'desc'}})
  return {id:user.id,name:name(user),triage:rights.triage,streams}
}
function compare(pre,post,paired,field) {
  const r={field,n:0,up:0,same:0,down:0,missing:0}
  const valid=n=>Number.isInteger(n)&&n>=1&&n<=10
  for(const id of paired){const a=pre.get(id),b=post.get(id),x=a.answers?.[field],y=b.answers?.[field]
    if(a.formVersion!==1 || b.formVersion!==2 || !valid(x)||!valid(y)){r.missing++;continue}
    r.n++;r[y>x?'up':y<x?'down':'same']++
  } return r
}
async function overview(db,user,streamId,now=new Date()) {
  const rights=await permission(db,user,streamId)
  const stream=await db.stream.findUnique({where:{id:streamId},select:{id:true,name:true,startDate:true,endDate:true}})
  if(!stream) throw fail('Поток не найден',404)
  const rows=await db.enrollment.findMany({where:{streamId,status:{in:['active','completed']}},select:{userId:true,status:true,paidAt:true,accessBasis:true,createdAt:true,user:{select:memberSelect}}})
  const members=[...new Map(rows.filter(e=>entitled(e)&&e.user.accessStatus==='approved'&&!e.user.deletedAt&&!e.user.analyticsExcluded&&e.user.role==='PARTICIPANT'&&!isOwner(e.user)).map(e=>[e.userId,{id:e.userId,name:name(e.user)}])).values()]
  const ids=members.map(u=>u.id),idSet=new Set(ids)
  // Only the two agreed scales and fixed-choice fields are used. No personal texts leave this service.
  const qs=await db.questionnaire.findMany({where:{streamId,userId:{in:ids},submittedAt:{lte:now}},select:{userId:true,type:true,submittedAt:true,formVersion:true,answers:true},orderBy:[{submittedAt:'asc'},{id:'asc'}]})
  const pre=new Map(),post=new Map();for(const q of qs)(q.type==='pre'?pre:post).set(q.userId,q)
  const paired=[...pre.keys()].filter(id=>post.has(id)),experience={}
  const schema=require('../questionnaire-post-schema.json').properties
  for(const key of ['benefit_group','benefit_body','benefit_recordings','benefit_practice','benefit_app','difficulties','appBarrier','nextStep']){
    const counts=new Map();let missing=0
    for(const q of post.values()){const v=q.answers?.[key];if(!v||q.formVersion!==2||!schema[key]?.enum?.includes(v)){missing++;continue}counts.set(v,(counts.get(v)||0)+1)}
    experience[key]={counts:[...counts],missing,answered:post.size-missing,total:post.size}
  }
  const coverage=await db.overviewHistory.findUnique({where:{id:'eligibility-v1'}})
  const since=coverage?.startedAt || now,windows=[]
  for(let start=+midnight(stream.startDate);start+7*86400000<=Math.min(+now,+endDay(stream.endDate));start+=7*86400000){
    const end=start+7*86400000
    if(start<+since){windows.push({start:new Date(start),end:new Date(end),known:false});continue}
    const spans=await db.overviewMembership.findMany({where:{streamId,user:{deletedAt:null,role:'PARTICIPANT',analyticsExcluded:false},startedAt:{lt:new Date(end)},OR:[{endedAt:null},{endedAt:{gt:new Date(start)}}],eligibleUntil:{gt:new Date(start)}},select:{userId:true,startedAt:true,endedAt:true,eligibleUntil:true,user:{select:{telegramId:true}}},orderBy:{startedAt:'asc'}})
    const covered=new Map()
    for(const r of spans){if(isOwner(r.user))continue;const cursor=covered.get(r.userId)??start,until=Math.min(r.endedAt?+r.endedAt:Infinity,+r.eligibleUntil);if(+r.startedAt<=cursor&&until>cursor)covered.set(r.userId,until)}
    const eligibleIds=[...covered].filter(([,until])=>until>=end).map(([id])=>id)
    const active=await db.diaryEntry.findMany({where:{streamId,userId:{in:eligibleIds},savedAt:{gte:new Date(start),lt:new Date(end)}},distinct:['userId'],select:{userId:true}})
    windows.push({start:new Date(start),end:new Date(end),known:true,eligibleIds,activeIds:active.map(r=>r.userId)})
  }
  const current=windows.at(-1),previous=windows.at(-2)
  const base=previous?.known&&current?.known?previous.activeIds.filter(id=>current.eligibleIds.includes(id)):[]
  const returned=current?.known?base.filter(id=>current.activeIds.includes(id)):[]
  const weekly=windows.map(w=>({start:w.start,end:w.end,known:w.known,eligibleCount:w.known?w.eligibleIds.length:null,activeCount:w.known?w.activeIds.length:null}))
  const feedbackSelect={id:true,userId:true,streamId:true,text:true,createdAt:true,needsReply:true,kind:true,status:true,revision:true,assigneeId:true,takenAt:true,answeredById:true,answeredAt:true,user:{select:memberSelect}}
  const requests=await db.feedback.findMany({where:{streamId,user:{deletedAt:null}},select:feedbackSelect,orderBy:[{createdAt:'asc'},{id:'asc'}]})
  const legacy=rights.triage?await db.feedback.findMany({where:{status:'unclassified',user:{deletedAt:null},OR:[{streamId:null},{needsReply:null}]},select:feedbackSelect,orderBy:[{createdAt:'asc'},{id:'asc'}]}):[]
  const actorIds=[...new Set([...requests,...legacy].flatMap(r=>[r.assigneeId,r.answeredById]).filter(Boolean))]
  const actors=await db.user.findMany({where:{id:{in:actorIds}},select:{id:true,name:true,firstName:true,lastName:true,deletedAt:true}})
  const actorName=id=>{const actor=actors.find(a=>a.id===id);return actor?(actor.deletedAt?'Прежний сотрудник':name(actor)):null}
  function publicRequest(r){const username=r.user.telegramUsername||r.user.username;return {id:r.id,userId:r.userId,author:name(r.user),streamId:r.streamId,text:r.text,subject:r.text.slice(0,110),createdAt:r.createdAt,needsReply:r.needsReply,kind:r.kind,status:r.status,revision:r.revision,assignee:r.assigneeId,assigneeName:actorName(r.assigneeId),takenAt:r.takenAt,answeredBy:actorName(r.answeredById),answeredAt:r.answeredAt,contact:username&&/^[A-Za-z0-9_]{5,32}$/.test(username)?'https://t.me/'+username:null}}
  return {data:{...stream,endDate:endDay(stream.endDate),postOpensAt:endDay(stream.endDate),asOf:now,members,requests:requests.map(publicRequest),legacy:legacy.map(publicRequest),historySince:since},summary:{pre:[...pre].map(([id,q])=>[id,{submittedAt:q.submittedAt}]),post:[...post].map(([id,q])=>[id,{submittedAt:q.submittedAt}]),pairedCount:paired.length,contact:compare(pre,post,paired,'bodyContactScale'),anxiety:compare(pre,post,paired,'anxietyScale'),experience,weeks:weekly,baseCount:base.length,returnedCount:returned.length,newlyActive:previous?.known&&current?.known?current.activeIds.filter(id=>!previous.activeIds.includes(id)).length:null,excludedPrevious:previous?.known&&current?.known?previous.activeIds.length-base.length:0},rights:{triage:rights.triage}}
}
async function mutate(db,expectedUser,id,body) {
  return db.$transaction(async tx=>{
    await tx.$queryRawUnsafe('SELECT id FROM users WHERE id=$1 FOR UPDATE',expectedUser.id)
    const user=await tx.user.findUnique({where:{id:expectedUser.id}})
    if(!user||user.deletedAt||user.tokenVersion!==expectedUser.tokenVersion) throw fail('Сессия изменилась')
    const item=await tx.feedback.findUnique({where:{id},include:{user:{select:{deletedAt:true}}}})
    if(!item||item.user.deletedAt) throw fail('Обращение не найдено',404)
    const classify=body.action==='classify',streamId=classify?body.streamId:item.streamId
    if(!classify&&!streamId) throw fail('Сначала уточните поток',409)
    const rights=await permission(tx,user,streamId,true)
    if(classify&&!rights.triage) throw fail('Разбор прежних сообщений доступен владельцу')
    if(!streamId) throw fail('Сначала уточните поток',409)
    if(!await tx.stream.findUnique({where:{id:streamId},select:{id:true}})) throw fail('Поток не найден',404)
    if(item.revision!==body.revision) throw fail('Обращение уже изменилось. Откройте его заново.',409)
    let data
    if(classify){
      if(item.status!=='unclassified'||body.confirmed!==true||typeof body.needsReply!=='boolean') throw fail('Подтвердите поток и необходимость ответа',400)
      if(!['technical','programme','schedule','feedback','unknown'].includes(body.kind)) throw fail('Укажите тему',400)
      data={streamId,needsReply:body.needsReply,kind:body.kind,status:body.needsReply?'new':'no-reply'}
    } else {
      if(!item.needsReply||!['new','in-progress'].includes(item.status)) throw fail('Ответ не ожидается',409)
      if(item.assigneeId&&item.assigneeId!==user.id) throw fail('Обращение уже взяла другая ведущая',409)
      if(body.action==='answer'&&body.confirmed!==true) throw fail('Сначала подтвердите отправленный ответ',400)
      if(body.action==='take'&&item.assigneeId) throw fail('Обращение уже в работе',409)
      data={assigneeId:user.id,status:body.action==='take'?'in-progress':'answered',...(body.action==='take'?{takenAt:new Date()}:{answeredAt:new Date(),answeredById:user.id})}
    }
    const changed=await tx.feedback.updateMany({where:{id,revision:body.revision},data:{...data,revision:{increment:1}}})
    if(!changed.count) throw fail('Обращение уже изменилось. Откройте его заново.',409)
    await tx.feedbackAction.create({data:{feedbackId:id,actorId:user.id,action:body.action,revision:body.revision+1,details:classify?{streamId,needsReply:body.needsReply,kind:body.kind}:{}}})
    return {ok:true}
  })
}
module.exports={permission,session,overview,mutate,entitled,midnight,endDay}
