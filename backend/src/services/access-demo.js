const m=require('./access-management')
const {noticeMessage}=require('./access-notices')
const button=(text,data)=>({text,callback_data:'ad:'+data})
const demoText='ТЕСТОВАЯ ЗАЯВКА — «Тело помнит»\n\nАнна (вымышленная участница)\nUsername: тестовый пример\nTelegram ID: тестовый\n\nМожно пройти все шаги. Доступ реальных аккаунтов не изменится.'
const demoKeyboard={inline_keyboard:[[button('Настроить и одобрить','open'),button('Отказать','reject')]]}
function registerAccessDemo(bot) {
 bot.callbackQuery(/^ad:/,async ctx=>{
  try {
   if(ctx.callbackQuery.message?.chat.type!=='private')return ctx.answerCallbackQuery({text:'Откройте личный чат с ботом.'})
   const actor=await m.actorByTelegram(ctx.from.id)
   if(!m.isOwner(actor))return ctx.answerCallbackQuery({text:'Тест доступен владельцу.'})
   await ctx.answerCallbackQuery()
   const [,op,role='p',stream='1',basis='f']=ctx.callbackQuery.data.split(':')
   const roles={p:'Участница',h:'Ведущая',a:'Администратор'}
   if(!roles[role])return
   let text='ТЕСТ — реальный доступ не меняется.\n\n',rows=[]
   if(op==='open'){text+='Выберите роль.';rows=[[button('Участница','role:p'),button('Ведущая','role:h')],[button('Администратор','role:a')]]}
   else if(op==='role'){text+='Роль: '+roles[role]+'\nВыберите поток.';rows=[[button('Тестовый поток','stream:'+role+':1')],[button('Без потока','stream:'+role+':0')]]}
   else if(op==='stream'&&stream==='1'){text+='Выберите основание доступа.';rows=[[button('Оплачено онлайн','basis:'+role+':1:p')],[button('Оплачено наличными','basis:'+role+':1:c')],[button('Бесплатно','basis:'+role+':1:f')]]}
   else if(op==='confirm'||op==='reject-confirm'){
    const approved=op==='confirm'
    await ctx.editMessageText(text+(approved?'Тестовое одобрение подтверждено.':'Тестовый отказ подтверждён.'))
    const sample=noticeMessage(approved?'approved':'rejected')
    return ctx.reply('ТЕСТ: так выглядит сообщение человеку после решения.\n\n'+sample.text,sample.reply_markup?{reply_markup:sample.reply_markup}:{})
   }else if(op==='cancel')return ctx.editMessageText('Тест завершён. Реальные аккаунты не изменены.')
   else {
    const rejected=op==='reject'
    text+=rejected?'Решение: отказать во входе.\nПодтвердить тестовый отказ?':`Решение: разрешить вход.\nРоль: ${roles[role]}\nПоток: ${stream==='0'?'без потока':'Тестовый поток'}\nОснование: ${stream==='0'?'без изменения':basis==='p'?'оплачено онлайн':basis==='c'?'оплачено наличными · подтверждаю получение вручную':'бесплатный допуск'}\n\nПодтвердить тестовое одобрение?`
    rows=[[button('Подтвердить',rejected?'reject-confirm':`confirm:${role}:${stream}:${basis}`)]]
   }
   rows.push([button('Отмена','cancel')])
   await ctx.editMessageText(text,{reply_markup:{inline_keyboard:rows}})
  }catch{try{await ctx.reply('Не удалось выполнить тест. Реальные аккаунты не изменены.')}catch{}}
 })
}
module.exports={registerAccessDemo,demoText,demoKeyboard}
