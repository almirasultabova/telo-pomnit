const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const ctx={window:{},console,Map,Set,Date,clearTimeout(){},setTimeout(){}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'app/js/storage.js'),'utf8')+'\nthis.storage=Storage;',ctx);
let entries=[];ctx.storage.getDiaryEntries=()=>entries;
const calc=(rows,time)=>{entries=rows.map(date=>({date}));return ctx.storage.getStreak(new Date(time))};
assert.equal(calc(['2026-10-14T22:00:00Z','2026-10-13T22:00:00Z'],'2026-10-14T21:30:00Z'),2);
assert.equal(calc(['2026-10-14T10:00:00Z'],'2026-10-15T09:00:00Z'),1);
assert.equal(calc(['2026-10-13T10:00:00Z'],'2026-10-15T09:00:00Z'),0);
assert.equal(calc(['bad','2026-10-16T10:00:00Z','2026-10-15T10:00:00Z','2026-10-15T11:00:00Z','2026-10-13T10:00:00Z'],'2026-10-15T12:00:00Z'),1);
const now='2026-10-15T10:00:00Z';assert.equal(calc(Array.from({length:120},(_,i)=>new Date(Date.parse(now)-i*86400000).toISOString()),now),120);
assert.equal(calc(['2024-02-29T10:00:00Z','2024-02-28T10:00:00Z'],'2024-03-01T10:00:00Z'),2);
const source=fs.readFileSync(path.join(root,'app/js/app.js'),'utf8');
const start=source.indexOf('async function refreshProgramAccess(){'),end=source.indexOf('\nfunction renderNextMeeting()',start);
let calls=0,cleared=0;const access={streams:[{id:'owned'}]};
const env={Api:{userId:'A',_authGeneration:1,clubBlocked:false,getAccess:async()=>{throw Error('offline')}},programAccess:access,programRefreshError:false,
applyProgramAccess(value){env.programAccess=value},checkAndShowQuestionnaire(){cleared++},renderAccessNotice(){},renderMainTab(){calls++}};
vm.createContext(env);vm.runInContext(source.slice(start,end),env);
(async()=>{
 await env.refreshProgramAccess();assert.equal(env.programAccess,access);assert(env.programRefreshError);assert.equal(cleared,0);
 let resolve;env.Api.getAccess=()=>new Promise(r=>resolve=r);const pending=env.refreshProgramAccess();env.Api.userId='B';env.Api._authGeneration++;resolve({streams:[{id:'other'}]});await pending;assert.equal(env.programAccess,access,'Late access response cannot overwrite another account');
 assert(!source.includes('<div class="host-role-mini">${h.name'));
 const hosts=source.slice(source.indexOf('function renderHosts()'),source.indexOf('function renderVerifiedAvatar'));
 assert(hosts.includes('aria-label="Написать ${h.name}"'));assert(hosts.includes('M22 2 11 13'));assert(!hosts.includes('lucide.svg#send'));
 console.log('PASS: Moscow day boundaries, dedupe/gaps/invalid/future/leap/>90, offline schedule retention, late-account response denied, inline contact and no rejected role captions');
})().catch(e=>{console.error(e);process.exitCode=1});
