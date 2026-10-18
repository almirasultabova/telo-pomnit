const db = require('../db')
const m = require('./access-management')
const roles = {PARTICIPANT:'Участница',HOST:'Ведущая',ADMIN:'Администратор'}
const bases = {none:'Без изменения потока',free:'Бесплатный допуск',paid:'Оплачено онлайн',cash:'Оплачено наличными · подтверждаю получение вручную',revoke:'Закрыть доступ к потоку'}
const button = (text,data) => ({text,callback_data:data})
const card = u => [u.name || [u.firstName,u.lastName].filter(Boolean).join(' ') || 'Новый пользователь',(u.telegramUsername || u.username) ? '@'+(u.telegramUsername || u.username) : '',`Telegram ID: ${u.telegramId}`,`Роль: ${roles[u.role] || u.role}`].filter(Boolean).join('\n')
const entryKeyboard = id => ({inline_keyboard:[[button('Настроить и одобрить','am:o:'+id),button('Отказать','am:x:'+id)]]})
async function render(ctx,id,step) {
  const {action:a,actor,target} = await m.readAction((await m.actorByTelegram(ctx.from.id)).id,id)
  const prefix='am:'
  let text=card(target)+'\n\n', rows=[]
  if(step==='role') {
    text+='Выберите роль. Изменения применятся после подтверждения.'
    rows=[[button('Участница',prefix+'r:'+id+':p'),button('Ведущая',prefix+'r:'+id+':h')]]
    if(m.isOwner(actor)) rows.push([button('Администратор',prefix+'r:'+id+':a')])
  } else if(step==='stream') {
    text+='Роль: '+roles[a.role]+'\nВыберите поток или оставьте только приложение.'
    rows=a.streamChoices.slice(0,20).map((s,i)=>[button(s.name.slice(0,50),prefix+'s:'+id+':'+i)])
    rows.push([button('Без потока',prefix+'s:'+id+':n')])
  } else if(step==='basis') {
    text+='Основание доступа к выбранному потоку:'
    rows=[[button('Оплачено онлайн',prefix+'b:'+id+':p')],[button('Оплачено наличными',prefix+'b:'+id+':c')],[button('Бесплатно',prefix+'b:'+id+':f')],[button('Закрыть доступ к потоку',prefix+'b:'+id+':r')]]
  } else {
    const stream=a.streamChoices.find(s=>s.id===a.streamId)
    text+=`Решение: ${a.status==='approved'?'разрешить вход':'отказать во входе'}\nРоль: ${roles[a.role]}\nПоток: ${stream?.name || 'без изменения'}\n${bases[a.basis]}\n\nПодтвердить? Личная история не удаляется.${a.role==='HOST'?' Ведущей доступны служебный AI постоянно и все активные потоки.':''}`
    rows=[[button('Подтвердить',prefix+'c:'+id)],[button('Изменить выбор',prefix+'v:'+id)]]
  }
  rows.push([button('Отмена',prefix+'q:'+id)])
  await ctx.editMessageText(text,{reply_markup:{inline_keyboard:rows}})
}
function registerAccessBot(bot) {
  bot.command('requests',async ctx=>{
    if(ctx.chat?.type!=='private') return
    try {
      await m.actorByTelegram(ctx.from.id)
      const users=await db.user.findMany({where:{accessStatus:'pending',deletedAt:null,accessRequestedAt:{not:null}},orderBy:{accessRequestedAt:'asc'},take:10})
      if(!users.length) return ctx.reply('Новых заявок нет.')
      for(const user of users) await ctx.reply(card(user),{reply_markup:entryKeyboard(user.id)})
      await ctx.reply('Показаны первые 10 заявок. Все заявки и поиск — в панели управления.')
    } catch(e) { await ctx.reply(e.statusCode ? e.message : 'Не удалось загрузить заявки. Повторите позже.') }
  })
  bot.command('access',async ctx=>{
    if(ctx.chat?.type!=='private') return
    try {
      await m.actorByTelegram(ctx.from.id)
      const search=(ctx.message.text.split(/\s+/)[1]||'').replace(/^@/,'')
      if(!search) return ctx.reply('Укажите /access @username или Telegram ID.')
      const where=/^\d+$/.test(search)?{telegramId:BigInt(search)}:{OR:[{telegramUsername:{equals:search,mode:'insensitive'}},{username:{equals:search,mode:'insensitive'}}]}
      const users=await db.user.findMany({where:{...where,deletedAt:null},take:2})
      if(users.length!==1) return ctx.reply('Однозначно найти аккаунт не удалось. Используйте Telegram ID.')
      await ctx.reply(card(users[0]),{reply_markup:entryKeyboard(users[0].id)})
    } catch(e) {await ctx.reply(e.statusCode?e.message:'Не удалось открыть аккаунт.')}
  })
  bot.callbackQuery(/^am:/,async ctx=>{
    try {
      if(ctx.callbackQuery.message?.chat.type!=='private') return ctx.answerCallbackQuery({text:'Откройте личный чат с ботом.'})
      const actor=await m.actorByTelegram(ctx.from.id)
      await ctx.answerCallbackQuery()
      const [,op,id,value]=ctx.callbackQuery.data.split(':')
      if(['o','x'].includes(op)) {
        const a=await m.openAction(actor.id,id)
        if(op==='x') await m.changeAction(actor.id,a.id,{status:'rejected'})
        return render(ctx,a.id,op==='x'?'review':'role')
      }
      if(op==='r') {const role={p:'PARTICIPANT',h:'HOST',a:'ADMIN'}[value];await m.changeAction(actor.id,id,{role});return render(ctx,id,'stream')}
      if(op==='s') {
        const {action}=await m.readAction(actor.id,id)
        const stream=value==='n'?null:action.streamChoices[Number(value)]?.id
        if(value!=='n'&&!stream) throw Object.assign(new Error('Поток не найден'),{statusCode:400})
        await m.changeAction(actor.id,id,{streamId:stream,basis:stream?'free':'none'})
        return render(ctx,id,stream?'basis':'review')
      }
      if(op==='b') {await m.changeAction(actor.id,id,{basis:{p:'paid',c:'cash',f:'free',r:'revoke'}[value]});return render(ctx,id,'review')}
      if(op==='v') return render(ctx,id,'role')
      if(op==='q') {await m.readAction(actor.id,id);await db.accessAction.update({where:{id},data:{usedAt:new Date()}});return ctx.editMessageText('Изменения отменены. Доступ сохранён.')}
      if(op==='c') {
        const result=await m.confirmAction(actor.id,id)
        await ctx.editMessageText(card(result.user)+'\n\n'+(result.after.status==='approved'?'Вход разрешён.':'Вход закрыт.')+' Решение сохранено в истории.')
      }
    } catch(e) {
      try {await ctx.answerCallbackQuery({text:e.statusCode?e.message.slice(0,180):'Не удалось сохранить решение. Обновите список.',show_alert:true})}catch{}
      if(e.statusCode) try {await ctx.reply(e.message)}catch{}
    }
  })
}
module.exports={registerAccessBot,entryKeyboard}
