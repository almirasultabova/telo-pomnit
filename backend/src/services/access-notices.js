const db = require('../db')
function noticeMessage(status,user={}) {
  if(status==='approved') return {
    text:'Доступ к приложению «Тело помнит» открыт.\n\nНажмите «Открыть приложение», чтобы войти.',
    reply_markup:{inline_keyboard:[[{text:'Открыть приложение',web_app:{url:user.preferredAppUrl || process.env.MINI_APP_URL || 'https://tg-app-telo-pomnit.vercel.app/'}}]]}
  }
  return {text:'Сейчас доступ к приложению «Тело помнит» не разрешён.\n\nЕсли хотите уточнить решение, напишите Альмире: @almira_sultanova.'}
}
let draining=false
async function drainAccessNotices() {
  if(draining) return
  draining=true
  try {
    const due={delivery:'pending',nextAttemptAt:{lte:new Date()},OR:[{leaseUntil:null},{leaseUntil:{lt:new Date()}}]}
    const rows=await db.accessNotice.findMany({where:due,orderBy:{createdAt:'asc'},take:20})
    for(const row of rows) {
      const claimed=await db.accessNotice.updateMany({where:{id:row.id,...due},data:{leaseUntil:new Date(Date.now()+60000)}})
      if(!claimed.count)continue
      const user=await db.user.findUnique({where:{id:row.targetId},select:{telegramId:true,accessStatus:true,deletedAt:true,preferredAppUrl:true}})
      if(!user || user.deletedAt || user.accessStatus!==row.status) {
        await db.accessNotice.update({where:{id:row.id},data:{delivery:'obsolete',leaseUntil:null}});continue
      }
      let outcome
      try {
        const response=await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(5000),body:JSON.stringify({chat_id:String(user.telegramId),...noticeMessage(row.status,user)})})
        outcome=await response.json()
      } catch {}
      const attempts=row.attempts+1
      if(outcome?.ok)await db.accessNotice.update({where:{id:row.id},data:{delivery:'delivered',sentAt:new Date(),leaseUntil:null,attempts}})
      else if([400,403].includes(outcome?.error_code))await db.accessNotice.update({where:{id:row.id},data:{delivery:'unreachable',leaseUntil:null,attempts}})
      else await db.accessNotice.update({where:{id:row.id},data:{leaseUntil:null,attempts,nextAttemptAt:new Date(Date.now()+Math.max(Number(outcome?.parameters?.retry_after)||0,Math.min(3600,60*2**Math.min(attempts-1,6)))*1000)}})
    }
  }catch{console.error('[access-notices] delivery retry pending')}
  finally{draining=false}
}
module.exports={noticeMessage,drainAccessNotices}
