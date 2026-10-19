const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const memory=new Map(),calls={},pending={};
const store={getItem:k=>memory.get(k)??null,setItem:(k,v)=>{memory.set(k,String(v));return true},removeItem:k=>memory.delete(k)};
const Api={isAuthed:()=>true};
const names=['Diary','Checkins','Triggers','DiagResult','HabitualResult'];
function setup(){for(const name of names){pending[name]={};pending[name].promise=new Promise((resolve,reject)=>Object.assign(pending[name],{resolve,reject}));Api['get'+name]=()=>{calls[name]=(calls[name]||0)+1;return pending[name].promise}}}
const ctx=vm.createContext({Api,window:{localStorage:store,addEventListener(){}},AppLocalStorage:store,console,setTimeout:()=>1,clearTimeout(){},crypto:require('node:crypto')});
vm.runInContext(fs.readFileSync('app/js/storage.js','utf8')+'\nglobalThis.storage=Storage',ctx);const S=ctx.storage;
for(const name of ['flushPending','flushCheckinsPending','flushTriggersPending','flushHabitualResult'])S[name]=async()=>{};
const tick=()=>new Promise(r=>setImmediate(r));
const row={id:'remote',clientId:'remote-client',zone:'chest',sensations:['tension'],createdAt:'2026-10-18T12:00:00Z',note:'Synthetic diary'};
async function finish(){pending.Diary.resolve([]);pending.Checkins.resolve([]);pending.Triggers.resolve([]);pending.DiagResult.resolve(null);pending.HabitualResult.resolve(null);await tick()}
(async()=>{
 S.bindUser('A');S._writeDiary([{id:'pending',clientId:'local',date:'2026-10-18T11:00:00Z',note:'Synthetic pending',syncStatus:'pending'}]);
 setup();const one=S.initFromApi(),two=S.initFromApi();assert.equal(calls.Diary,1);assert.equal(calls.Triggers||0,0);
 pending.Diary.resolve([row]);await tick();assert.equal(S.getHistoryLoadStatus().diary,'loaded');assert.equal(S.getHistoryLoadStatus().checkins,'loading');assert.equal(S.getHistoryLoadStatus().triggers,'idle');assert.equal(S.getDiaryEntries().length,2);assert(S.getDiaryEntries().some(r=>r.clientId==='local'&&r.syncStatus==='pending'));
 pending.DiagResult.resolve({score:7,createdAt:row.createdAt});await tick();assert.equal(S.getDiagResult().score,7);
 pending.Checkins.reject(Error('Synthetic checkin failure'));await tick();assert.equal(S.getHistoryLoadStatus().checkins,'failed');assert.equal(S.getHistoryLoadStatus().diary,'loaded');
 pending.Triggers.resolve([]);pending.HabitualResult.resolve(null);await Promise.all([one,two]);assert.equal(S.getHistoryLoadStatus().triggers,'idle');
 setup();const retry=S.initFromApi();pending.Checkins.resolve([{id:'c',dayKey:'2026-10-18',createdAt:row.createdAt,tension:4,anxiety:3,energy:6,safety:7,bodyContact:5,note:'Synthetic checkin'}]);await tick();assert.equal(S.getHistoryLoadStatus().checkins,'loaded');assert.equal(S.getHistoryLoadStatus().diary,'loading');assert.equal(S.getCheckins()[0].tension,4);await finish();await retry;assert.equal(S.getDiaryEntries().length,2);
 setup();const invalid=S.initFromApi();pending.Diary.resolve({invalid:true});pending.Checkins.resolve({invalid:true});await finish();await invalid;assert.equal(S.getHistoryLoadStatus().diary,'failed');assert.equal(S.getHistoryLoadStatus().checkins,'failed');assert.equal(S.getDiaryEntries().length,2);assert.equal(S.getCheckins().length,1);
 setup();const stale=S.initFromApi();S.clearUser();S.bindUser('B');await finish();await stale;assert.equal(S.getDiaryEntries().length,0);assert.equal(S.getHistoryLoadStatus().diary,'idle');assert.equal(S.getDiagResult(),null);
 setup();const fresh=S.initFromApi();await finish();await fresh;assert.equal(S.getHistoryLoadStatus().diary,'loaded');assert.equal(S.getDiaryEntries().length,0);
 setup();const opened=S.loadTriggerHistory();assert.equal(S.getHistoryLoadStatus().triggers,'loading');pending.Triggers.resolve([]);await opened;assert.equal(S.getHistoryLoadStatus().triggers,'loaded');setup();const later=S.initFromApi();await finish();await later;assert.equal(S.getHistoryLoadStatus().triggers,'loaded');
 S.bindUser('B');assert.equal(S.getHistoryLoadStatus().triggers,'idle');
 console.log(JSON.stringify({passed:true,groups:11,independentDiary:true,independentCheckins:true,diagnosticEarly:true,inFlightDedup:true,cachePendingPreserved:true,independentFailureRetry:true,invalidShapes:true,lateOwnerIgnored:true,confirmedEmpty:true,network:0,deferredTriggerReads:true,loadedStatePreserved:true,reauthResetsLoadState:true}));
})().catch(e=>{console.error(e);process.exitCode=1});
