// Exercise the real access calculation with synthetic enrollments, no runtime or writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
let rows=[],managed=[];
const db={enrollment:{findMany:async q=>{assert.equal(q.where.userId,'self');return rows}},stream:{findMany:async()=>managed},questionnaire:{findMany:async()=>[]}};
const ctx={module:{exports:{}},process:{env:{ADMIN_TELEGRAM_IDS:'123'}},require:p=>p==='../db'?db:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../backend/src/routes/me.js'),'utf8'),ctx);
const {getProgramAccess:access,streamBounds:bounds}=ctx.module.exports;
const user={id:'self',telegramId:456,createdAt:'2026-10-01'};
const stream={id:'owned',name:'Synthetic',startDate:'2026-10-15',endDate:'2026-11-12',meetings:[],chatLink:'https://t.me/synthetic',zoomLink:'https://example.invalid/zoom'};
const enrollment={status:'active',createdAt:'2026-10-01',paidAt:'2026-10-01',accessExpires:null,stream};
(async()=>{
 rows=[enrollment];let r=await access(user,Date.parse('2026-11-12T20:59:59.999Z'));assert(r.streams[0].canAttend);assert(r.streams[0].canReadRecordings);
 r=await access(user,Date.parse('2026-11-12T21:00:00Z'));assert.equal(r.streams[0].phase,'completed');assert(!r.streams[0].canAttend);assert(!r.streams[0].canUseAi);assert(!r.ai.canWrite);assert(r.streams[0].canReadRecordings);assert.equal(r.streams[0].zoomLink,null);assert.equal(r.streams[0].chatLink,stream.chatLink);assert(r.diary&&r.checkins&&r.aiHistory&&r.reactions);
 r=await access(user,Date.parse('2027-02-12T20:59:59.999Z'));assert(r.streams[0].canReadRecordings);
 r=await access(user,Date.parse('2027-02-12T21:00:00Z'));assert(!r.streams[0].canReadRecordings);assert.equal(r.streams[0].chatLink,null);assert(r.diary&&r.aiHistory);
 assert.equal(new Date(bounds({...stream,endDate:'2026-01-31'}).recordingsEnd).toISOString(),'2026-04-30T21:00:00.000Z');
 assert.equal(new Date(bounds({...stream,endDate:'2027-11-30'}).recordingsEnd).toISOString(),'2028-02-29T21:00:00.000Z');
 rows=[{...enrollment,accessExpires:'2026-12-01T00:00:00Z'}];r=await access(user,Date.parse('2026-12-02T12:00:00Z'));assert(!r.streams[0].canReadRecordings);assert(r.streams[0].accessExpired);assert.equal(r.streams[0].chatLink,null);
 for(const status of ['pending','cancelled']){rows=[{...enrollment,status}];r=await access(user,Date.parse('2026-11-13T12:00:00Z'));assert.equal(r.streams.length,0)}
 rows=[{...enrollment,paidAt:null}];assert.equal((await access(user,Date.parse('2026-11-13T12:00:00Z'))).streams.length,0);
 rows=[{...enrollment,paidAt:null,accessBasis:'free'}];assert((await access(user,Date.parse('2026-11-13T12:00:00Z'))).streams[0].canReadRecordings);
 rows=[{...enrollment,status:'completed'}];assert((await access(user,Date.parse('2026-11-13T12:00:00Z'))).streams[0].canReadRecordings);
 r=await access(user,Date.parse('2026-10-14T20:59:59Z'));assert(!r.streams[0].canReadRecordings);assert.equal(r.streams[0].chatLink,null);
 rows=[];managed=[stream];r=await access({...user,role:'HOST'},Date.parse('2027-02-13T10:00:00Z'));assert(r.ai.canWrite);assert.equal(r.ai.reason,'host');assert(!r.streams[0].canReadRecordings);
 console.log('PASS exact end/3-month boundaries, calendar clamp/leap/year, paid/completed/free scope, expiry override, cancelled/unpaid/upcoming denied, personal tools and HOST AI preserved; synthetic only, sends=0');
})().catch(e=>{console.error(e);process.exitCode=1});
