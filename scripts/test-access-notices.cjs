const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const root=path.resolve(__dirname,'..');let passed=0;
const service=fs.readFileSync(path.join(root,'backend/src/services/access-notices.js'),'utf8');
async function run(status,scenario){
 const row={id:'notice',targetId:'synthetic',status,attempts:0};let sends=0,updates=[];
 const db={accessNotice:{findMany:async()=>[row],updateMany:async()=>({count:scenario==='claimed'?0:1}),update:async p=>updates.push(p.data)},user:{findUnique:async()=>({telegramId:123n,accessStatus:scenario==='stale'?'pending':status,deletedAt:scenario==='deleted'?new Date():null,preferredAppUrl:'https://app.telo-pomnit.ru/recovery/test'})}};
 const module={exports:{}};
 vm.runInNewContext(service,{module,require:()=>db,process:{env:{BOT_TOKEN:'synthetic'}},console,AbortSignal,fetch:async(url,options)=>{sends++;const body=JSON.parse(options.body);assert.equal(body.chat_id,'123');if(status==='approved')assert.equal(body.reply_markup.inline_keyboard[0][0].web_app.url,'https://app.telo-pomnit.ru/recovery/test');else assert.ok(!body.reply_markup);if(scenario==='timeout')throw Error('fixture');return{json:async()=>scenario==='blocked'?{ok:false,error_code:403}:scenario==='rate-limit'?{ok:false,error_code:429,parameters:{retry_after:90}}:{ok:true}}}});
 await module.exports.drainAccessNotices();
 if(['deleted','stale','claimed'].includes(scenario))assert.equal(sends,0);else assert.equal(sends,1);
 if(scenario==='claimed')assert.equal(updates.length,0);
 else if(['deleted','stale'].includes(scenario))assert.equal(updates[0].delivery,'obsolete');
 else if(scenario==='blocked')assert.equal(updates[0].delivery,'unreachable');
 else if(['timeout','rate-limit'].includes(scenario)){assert.equal(updates[0].attempts,1);assert.ok(updates[0].nextAttemptAt.getTime()>Date.now()+59000);assert.ok(!updates[0].sentAt)}
 else{assert.equal(updates[0].delivery,'delivered');assert.ok(updates[0].sentAt)}
 passed++;
}
(async()=>{for(const [s,c]of[['approved','success'],['rejected','success'],['approved','timeout'],['approved','blocked'],['approved','deleted'],['approved','stale'],['approved','claimed'],['approved','rate-limit']])await run(s,c);
 let callback;let messages=[];let writes=0;
 const module={exports:{}};const demo=fs.readFileSync(path.join(root,'backend/src/services/access-demo.js'),'utf8');
 const owner={id:'owner'};const dbguard={actorByTelegram:async()=>owner,isOwner:()=>true};
 vm.runInNewContext(demo,{module,require:p=>p==='./access-management'?dbguard:{noticeMessage:status=>({text:status})}});
 module.exports.registerAccessDemo({callbackQuery:(pattern,handler)=>{callback=handler}});
 const ctx={from:{id:1},callbackQuery:{message:{chat:{type:'private'}},data:''},answerCallbackQuery:async()=>{},editMessageText:async(text,options)=>{messages.push(text);for(const row of options?.reply_markup?.inline_keyboard||[])for(const b of row)assert.ok(Buffer.byteLength(b.callback_data)<=64)},reply:async text=>messages.push(text)};
 for(const data of ['ad:open','ad:role:p','ad:stream:p:1','ad:basis:p:1:f','ad:confirm:p:1:f','ad:reject','ad:reject-confirm']){ctx.callbackQuery.data=data;await callback(ctx)}
 assert.ok(messages.includes('ТЕСТ: так выглядит сообщение человеку после решения.\n\napproved'));assert.ok(messages.includes('ТЕСТ: так выглядит сообщение человеку после решения.\n\nrejected'));assert.equal(writes,0);passed++;
 console.log(JSON.stringify({passed,realTelegramSends:0,realAccessChanges:0}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
