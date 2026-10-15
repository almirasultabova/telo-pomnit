// Exact reminder service and bot scheduling, isolated DB/clock/Telegram/cron.
// No bot polling, .env, network or production data are loaded.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../backend/src'),code=fs.readFileSync(path.join(root,'services/reminders.js'),'utf8');
let now=Date.parse('2026-10-15T05:15:00Z'),users=[],forms=[],sends=[],queries=[],claimHook=null,readHook=null,formHook=null,claimFailure=null,transportFailure=false;
const enrollment=(overrides={})=>({id:'E',streamId:'S',status:'active',createdAt:new Date(now-86400000),...overrides});
const person=(overrides={})=>({id:'A',telegramId:1n,accessStatus:'approved',deletedAt:null,notificationsEnabled:true,notificationsTime:'08:15',dailyReminderAttemptDay:null,questionnaireReminderAttemptDay:null,enrollments:[enrollment()],...overrides});
function matches(row,where){return Object.entries(where).every(([key,value])=>{
 if(key==='OR')return value.some(clause=>matches(row,clause));
 if(key==='enrollments')return row.enrollments.some(e=>e.status===value.some.status);
 if(value && typeof value==='object'){if('gt'in value)return row[key]>value.gt;if('lt'in value)return row[key]!=null&&row[key]<value.lt;}
 return row[key]===value;
});}
const snapshot=user=>user?structuredClone({...user,enrollments:user.enrollments.filter(e=>e.status==='active').sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt)||a.id.localeCompare(b.id))}):null;
const db={user:{
 findMany:async({where,take})=>{queries.push(structuredClone(where));return users.filter(u=>matches(u,where)).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,take).map(snapshot);},
 updateMany:async({where,data})=>{if(claimHook){const fn=claimHook;claimHook=null;fn();}if(claimFailure==='before')throw Error('fixture DB unavailable');const found=users.filter(u=>matches(u,where));found.forEach(u=>Object.assign(u,data));if(claimFailure==='after')throw Error('fixture lost DB ACK');return{count:found.length};},
 findUnique:async({where})=>{if(readHook){const fn=readHook;readHook=null;fn();}return snapshot(users.find(u=>u.id===where.id));}
},questionnaire:{findFirst:async({where})=>{if(formHook)formHook();return forms.find(f=>Object.entries(where).every(([key,value])=>f[key]===value))||null;}}};
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const serviceModule={exports:{}};
vm.runInNewContext(code,{module:serviceModule,require:name=>{assert.equal(name,'../db');return db;},Date:Clock,Intl,Math,setTimeout:fn=>fn()});
const {createReminderService,moscowSlot}=serviceModule.exports;
const transport=async(id,text,options)=>{sends.push({id,text,options});if(transportFailure)throw Error('fixture ambiguous Telegram timeout');};
const make=()=>createReminderService({sendMessage:transport,miniAppUrl:'https://example.invalid/app'});
let service=make(),cases=0;
function reset(){users=[person()];forms=[];sends=[];queries=[];claimHook=null;readHook=null;formHook=null;claimFailure=null;transportFailure=false;service=make();}
async function check(name,fn){reset();await fn();cases++;console.log('PASS '+name);}
(async()=>{
 assert.equal(moscowSlot(new Date('2026-10-14T21:00:00Z')).day,'2026-10-15');assert.equal(moscowSlot(new Date('2026-10-14T21:00:00Z')).time,'00:00');
 await check('saved Moscow minute, repeat tick and next day',async()=>{assert.equal((await service.sendDailyReminder(new Date(now-60000))).sent,0);assert.equal((await service.sendDailyReminder()).sent,1);assert.equal((await service.sendDailyReminder(new Date(now+45000))).sent,0);assert.equal((await service.sendDailyReminder(new Date(now+60000))).sent,0);assert.equal((await service.sendDailyReminder(new Date(now+86400000))).sent,1);assert.equal(sends.length,2);});
 await check('questionnaire follows the saved minute too',async()=>{await service.sendQuestionnaireReminders(new Date(now-60000));assert.equal(sends.length,0);await service.sendQuestionnaireReminders();assert.equal(sends.length,1);await make().sendQuestionnaireReminders(new Date(now+45000));assert.equal(sends.length,1);await service.sendQuestionnaireReminders(new Date(now+60000));assert.equal(sends.length,1);});
 await check('multiple enrollments deduplicated for both reminder types',async()=>{users[0].enrollments.push(enrollment({id:'E2',streamId:'S2'}));await service.sendDailyReminder();await service.sendQuestionnaireReminders();assert.equal(sends.length,2);assert.equal(users[0].dailyReminderAttemptDay,'2026-10-15');assert.equal(users[0].questionnaireReminderAttemptDay,'2026-10-15');});
 await check('restart and concurrent service instances share durable claims',async()=>{await Promise.all(Array.from({length:8},()=>make().sendDailyReminder()));assert.equal(sends.length,1);await make().sendDailyReminder();assert.equal(sends.length,1);});
 await check('concurrent questionnaire runners claim once',async()=>{await Promise.all(Array.from({length:8},()=>make().sendQuestionnaireReminders()));assert.equal(sends.length,1);});
 await check('disabled preference suppresses daily and questionnaire',async()=>{users[0].notificationsEnabled=false;await service.sendDailyReminder();await service.sendQuestionnaireReminders();assert.equal(sends.length,0);users[0].notificationsEnabled=true;await service.sendDailyReminder();await service.sendQuestionnaireReminders();assert.equal(sends.length,2);});
 await check('opt-out race before atomic claim',async()=>{claimHook=()=>users[0].notificationsEnabled=false;await service.sendDailyReminder();assert.equal(sends.length,0);assert.equal(users[0].dailyReminderAttemptDay,null);});
 await check('opt-out race after claim but before transport',async()=>{readHook=()=>users[0].notificationsEnabled=false;await service.sendDailyReminder();assert.equal(sends.length,0);assert.equal(users[0].dailyReminderAttemptDay,'2026-10-15');});
 await check('questionnaire opt-out is rechecked after claim',async()=>{readHook=()=>users[0].notificationsEnabled=false;await service.sendQuestionnaireReminders();assert.equal(sends.length,0);});
 await check('saved time change before claim and before transport',async()=>{claimHook=()=>users[0].notificationsTime='09:15';await service.sendDailyReminder();assert.equal(sends.length,0);await service.sendDailyReminder(new Date(now+3600000));assert.equal(sends.length,1);});
 await check('time change after delivery does not resend that day',async()=>{await service.sendDailyReminder();users[0].notificationsTime='09:15';await service.sendDailyReminder(new Date(now+3600000));assert.equal(sends.length,1);await service.sendDailyReminder(new Date(now+86400000+3600000));assert.equal(sends.length,2);});
 await check('off and on after delivery cannot reset either attempt marker',async()=>{await service.sendDailyReminder();await service.sendQuestionnaireReminders();users[0].notificationsEnabled=false;await service.sendDailyReminder();await service.sendQuestionnaireReminders();users[0].notificationsEnabled=true;await make().sendDailyReminder();await make().sendQuestionnaireReminders();assert.equal(sends.length,2);});
 await check('disabled, denied, deleted and cancelled audience excluded',async()=>{users=[person({id:'disabled',notificationsEnabled:false}),person({id:'denied',accessStatus:'denied'}),person({id:'deleted',deletedAt:new Date()}),person({id:'cancelled',enrollments:[enrollment({status:'cancelled'})]})];await service.sendDailyReminder();await service.sendQuestionnaireReminders();assert.equal(sends.length,0);});
 await check('revocation after claim suppresses transport',async()=>{readHook=()=>users[0].accessStatus='denied';await service.sendDailyReminder();assert.equal(sends.length,0);});
 await check('enrollment cancellation after claim suppresses transport',async()=>{readHook=()=>users[0].enrollments[0].status='cancelled';await service.sendDailyReminder();assert.equal(sends.length,0);});
 await check('clock rollback cannot replay an already claimed later day',async()=>{users[0].dailyReminderAttemptDay='2026-10-16';await service.sendDailyReminder();assert.equal(sends.length,0);});
 await check('ambiguous Telegram error retained across restart until next day',async()=>{transportFailure=true;const result=await service.sendDailyReminder();assert.equal(result.uncertain,1);assert.equal(result.sent,0);transportFailure=false;await make().sendDailyReminder();assert.equal(sends.length,1);await make().sendDailyReminder(new Date(now+86400000));assert.equal(sends.length,2);});
 await check('DB failure and lost claim ACK never send speculatively',async()=>{claimFailure='before';assert.equal((await service.sendDailyReminder()).errors,1);assert.equal(sends.length,0);assert.equal(users[0].dailyReminderAttemptDay,null);claimFailure='after';await service.sendDailyReminder();assert.equal(sends.length,0);claimFailure=null;await make().sendDailyReminder();assert.equal(sends.length,0);});
 await check('questionnaire 1/3/5 full-day rule preserved',async()=>{for(const day of [1,2,3,4,5,6]){users=[person({enrollments:[enrollment({createdAt:new Date(now-day*86400000)})]})];sends=[];await service.sendQuestionnaireReminders();assert.equal(sends.length,[1,3,5].includes(day)?1:0);}users=[person({enrollments:[enrollment({createdAt:new Date(now-10*3600000)})]})];sends=[];await service.sendQuestionnaireReminders();assert.equal(sends.length,0);});
 await check('own completed pre excluded; foreign forms do not suppress',async()=>{forms=[{id:'P',userId:'A',streamId:'S',type:'pre'}];await service.sendQuestionnaireReminders();assert.equal(sends.length,0);forms=[{id:'P',userId:'B',streamId:'S',type:'pre'},{id:'P2',userId:'A',streamId:'other',type:'pre'}];await service.sendQuestionnaireReminders();assert.equal(sends.length,1);});
 await check('pre submitted between selection and send suppresses reminder',async()=>{let reads=0;formHook=()=>{if(++reads===2)forms=[{id:'P',userId:'A',streamId:'S',type:'pre'}];};await service.sendQuestionnaireReminders();assert.equal(sends.length,0);});
 await check('keyset pagination covers more than 200 due users once',async()=>{users=Array.from({length:205},(_,i)=>person({id:'u'+String(i).padStart(4,'0'),telegramId:BigInt(i+1)}));await service.sendDailyReminder();assert.equal(sends.length,205);assert.equal(new Set(sends.map(s=>s.id)).size,205);assert.equal(queries.length,2);assert.equal(queries[1].id.gt,'u0199');});
 await check('Moscow midnight and invalid saved time',async()=>{users=[person({notificationsTime:'00:00'})];await service.sendDailyReminder(new Date('2026-10-14T21:00:00Z'));assert.equal(sends.length,1);assert.equal(users[0].dailyReminderAttemptDay,'2026-10-15');users=[person({notificationsTime:'25:00'})];sends=[];await service.sendDailyReminder();assert.equal(sends.length,0);});
 await check('minute bot job is wired; meeting delivery remains disabled',async()=>{
  const tasks=[],botCode=fs.readFileSync(path.join(root,'bot.js'),'utf8');let meetingQueries=0;
  db.meeting={findMany:async()=>[{number:1,streamId:'S',stream:{}}]};db.enrollment={findMany:async({where})=>{meetingQueries++;assert.equal(where.user.notificationsEnabled,true);return[{user:{telegramId:1n}}];}};
  class Keyboard{webApp(){return this;}}class Bot{constructor(){this.api={sendMessage:async(...args)=>{await transport(...args);now+=120000;},setMyCommands:async()=>{}};}command(){}on(){}callbackQuery(){}catch(){}}
  const ctx={module:{exports:{}},process:{env:{MINI_APP_URL:'https://example.invalid/'}},console:{log(){},error(){},warn(){}},Date:Clock,AbortSignal,setTimeout:fn=>fn(),require:name=>{
   if(name==='dotenv')return{config(){}};if(name==='grammy')return{Bot,InlineKeyboard:Keyboard};if(name==='node-cron')return{schedule:(expression,fn)=>tasks.push({expression,fn})};if(name==='./db')return db;
   if(name==='./services/reminders')return{createReminderService};if(name==='./services/admission')return{drainAdmissionNotifications:async()=>{}};
   if(name==='./services/access-bot')return{registerAccessBot(){}};if(name==='./services/access-demo')return{registerAccessDemo(){}};if(name==='./services/access-notices')return{drainAccessNotices:async()=>{}};
   throw Error('Unexpected import '+name);
  }};vm.runInNewContext(botCode,ctx);
  const job=tasks.find(t=>t.fn.toString().includes('sendQuestionnaireReminders'));assert(job);assert.equal(job.expression,'* * * * *');await job.fn();assert.equal(sends.length,2);
  const meetingsJob=tasks.find(t=>t.fn.name==='sendMeetingReminder');assert(meetingsJob);await meetingsJob.fn();assert.equal(meetingQueries,1);assert.equal(sends.length,2);
 });
 console.log(`PASS ${cases} reminder cases; real Telegram/SMTP/network/production DB calls: 0`);
})().catch(error=>{console.error(error);process.exitCode=1;});
