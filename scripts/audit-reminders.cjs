// Historical J-APP-025 baseline audit, not the J-APP-026 regression suite.
// Does not import bot.js, start cron/polling, load .env or contact production services.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const file=path.resolve(__dirname,'../backend/src/bot.js'),bytes=fs.readFileSync(file),source=bytes.toString('utf8');
if(createHash('sha256').update(bytes).digest('hex')!=='42bb1e811acfd62ff5757df78df33d21850ab83d5a84cc6d0e2a6e36d7926150'){
 console.log('SKIP historical J-APP-025 audit: bot source changed. Run node scripts/test-reminders.cjs for current regression tests.');
 process.exit(0);
}
const daily=source.slice(source.indexOf('async function sendDailyReminder()'),source.indexOf('async function sendMeetingReminder()'));
const meeting=source.slice(source.indexOf('async function sendMeetingReminder()'),source.indexOf('// ─── Cron: 20:00'));
const questionnaire=source.slice(source.indexOf('async function sendQuestionnairReminder('),source.indexOf('// Cron: каждый день в 10:00'));
assert(daily && meeting && questionnaire);
let rows=[],forms=[],meetings=[],sent=[],now=Date.parse('2026-10-15T17:00:00Z');
const user={id:'A',telegramId:1n,accessStatus:'approved',deletedAt:null,notificationsEnabled:true,notificationsTime:'08:15'};
const stream={id:'S',startDate:'2026-10-01',endDate:'2026-10-31'};
const enrollment={userId:user.id,streamId:stream.id,user,stream,status:'active',createdAt:'2026-10-14T07:00:00Z',accessExpires:null};
const db={enrollment:{findMany:async({where,take})=>rows.filter(row=>{
 if(where.status && row.status!==where.status)return false;
 if(where.streamId && row.streamId!==where.streamId)return false;
 return Object.entries(where.user||{}).every(([key,value])=>row.user[key]===value);
}).slice(0,take||rows.length)},questionnaire:{findFirst:async({where})=>forms.find(row=>Object.entries(where).every(([key,value])=>row[key]===value))||null},meeting:{findMany:async({where})=>meetings.filter(row=>new Date(row.date)>=where.date.gte && new Date(row.date)<=where.date.lte)}};
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const ctx={db,Date:Clock,bot:{api:{sendMessage:async(id,text)=>sent.push({id,text})}},InlineKeyboard:class{webApp(){return this;}},MINI_APP_URL:'https://example.invalid/',console:{log(){},warn(){}},setTimeout:fn=>fn()};
vm.createContext(ctx);vm.runInContext(daily+meeting+questionnaire+'\nthis.functions={sendDailyReminder,sendMeetingReminder,sendQuestionnairReminder};',ctx);
const f=ctx.functions,results=[];
async function check(name,run,expected){sent=[];await run();assert.equal(sent.length,expected,name);results.push({name,observedMockSends:sent.length});}
(async()=>{
 rows=[enrollment];await check('daily-selected-08:15-still-sends-at-20:00-MSK',()=>f.sendDailyReminder(),1);
 rows=[{...enrollment,user:{...user,notificationsEnabled:false}}];await check('daily-disabled-is-respected',()=>f.sendDailyReminder(),0);
 rows=[enrollment,{...enrollment,streamId:'other',stream:{...stream,id:'other'}}];await check('daily-two-enrollments-one-person-two-messages',()=>f.sendDailyReminder(),2);await check('daily-repeat-run-sends-again',()=>f.sendDailyReminder(),2);
 rows=[{...enrollment,stream:{...stream,endDate:'2026-10-10'}}];await check('daily-ended-stream-still-sends-with-active-status',()=>f.sendDailyReminder(),1);
 rows=[{...enrollment,stream:{...stream,startDate:'2026-10-20'}}];await check('daily-future-stream-still-sends',()=>f.sendDailyReminder(),1);
 rows=[{...enrollment,accessExpires:'2026-10-10'}];await check('daily-explicit-access-expiry-not-checked',()=>f.sendDailyReminder(),1);
 rows=[{...enrollment,user:{...user,accessStatus:'denied'}}];await check('daily-denied-account-is-excluded',()=>f.sendDailyReminder(),0);
 rows=[{...enrollment,user:{...user,deletedAt:'2026-10-10'}}];await check('daily-deleted-account-is-excluded',()=>f.sendDailyReminder(),0);
 rows=[{...enrollment,status:'cancelled'}];await check('daily-cancelled-enrollment-is-excluded',()=>f.sendDailyReminder(),0);
 rows=[{...enrollment,user:{...user,notificationsEnabled:false}}];await check('questionnaire-disabled-preference-is-not-checked',()=>f.sendQuestionnairReminder(1),1);
 rows=[{...enrollment,stream:{...stream,startDate:'2026-10-20'}}];await check('questionnaire-future-stream-still-sends',()=>f.sendQuestionnairReminder(1),1);
 rows=[enrollment];forms=[{userId:'A',streamId:'S',type:'pre'}];await check('questionnaire-already-submitted-is-excluded',()=>f.sendQuestionnairReminder(1),0);forms=[];
 rows=[{...enrollment,createdAt:'2026-10-14T23:30:00+03:00'}];now=Date.parse('2026-10-15T10:00:00+03:00');await check('questionnaire-full-24-hours-used-instead-of-next-calendar-day',()=>f.sendQuestionnairReminder(1),0);
 rows=[enrollment];meetings=[{id:'M',streamId:'S',date:new Date(now+3600000),stream,number:1,topic:'Synthetic'}];await check('meeting-reminder-send-loop-is-disabled',()=>f.sendMeetingReminder(),0);
 assert(source.includes("cron.schedule('0 17 * * *', sendDailyReminder, { timezone: 'UTC' })"));
 const report={source:'backend/src/bot.js',sha256:createHash('sha256').update(bytes).digest('hex'),mode:'audit-current-behavior-not-a-passing-correctness-suite',fixedDailyTime:'20:00 Europe/Moscow',realNotifications:0,networkCalls:0,cases:results};
 console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
