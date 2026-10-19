const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const backing=new Map(),counts={},waiting={};
const store={getItem:k=>backing.get(k)??null,setItem:(k,v)=>backing.set(k,String(v)),removeItem:k=>backing.delete(k)};
const Api={isAuthed:()=>true};
const names=['Diary','Checkins','DiagResult','HabitualResult'];
function setup(){for(const name of names){waiting[name]={};waiting[name].promise=new Promise((resolve,reject)=>Object.assign(waiting[name],{resolve,reject}));Api['get'+name]=()=>{counts[name]=(counts[name]||0)+1;return waiting[name].promise}}}
const ctx=vm.createContext({Api,window:{localStorage:store,addEventListener(){}},AppLocalStorage:store,console,setTimeout:()=>1,clearTimeout(){},crypto:require('node:crypto')});
vm.runInContext(fs.readFileSync('app/js/storage.js','utf8')+'\nglobalThis.S=Storage',ctx);const S=ctx.S;
for(const name of ['flushPending','flushCheckinsPending','flushTriggersPending','flushHabitualResult'])S[name]=async()=>{};
const tick=()=>new Promise(r=>setImmediate(r));const clone=()=>({...counts});
const diary=Array.from({length:2000},(_,i)=>({id:'d-'+i,clientId:'dc-'+i,zone:'chest',createdAt:'2026-10-18T12:00:00Z',sensations:[],note:'Synthetic '+i}));
const checkins=[{id:'c1',dayKey:'2026-10-18',createdAt:'2026-10-18T12:00:00Z',tension:4,anxiety:3,energy:6,safety:7,bodyContact:5}];
(async()=>{let groups=0;S.bindUser('A');setup();const initial=S.initFromApi();waiting.Diary.resolve(diary);waiting.Checkins.reject(Error('synthetic checkin failure'));waiting.DiagResult.resolve(null);waiting.HabitualResult.resolve(null);await initial;assert.equal(S.getDiaryEntries().length,2000);assert.equal(S.getHistoryLoadStatus().checkins,'failed');groups++;
 const before=clone();setup();const retry=S.initFromApi({fields:['checkins']});assert.equal(S.getHistoryLoadStatus().diary,'loaded');assert.equal(counts.Diary,before.Diary);assert.equal(counts.DiagResult,before.DiagResult);assert.equal(counts.HabitualResult,before.HabitualResult);waiting.Checkins.resolve(checkins);await retry;assert.equal(S.getCheckins().length,1);assert.equal(S.getDiaryEntries().length,2000);assert.equal(S.getHistoryLoadStatus().checkins,'loaded');groups++;
 setup();const emptyBefore=clone();await S.initFromApi({fields:[]});assert.deepEqual(counts,emptyBefore);await assert.rejects(()=>S.initFromApi({fields:['triggers']}),/INVALID_HISTORY_KIND/);assert.deepEqual(counts,emptyBefore);groups++;
 setup();const againBefore=clone(),one=S.initFromApi({fields:['diary']}),two=S.initFromApi({fields:['diary','checkins']}),three=S.initFromApi();assert.equal(counts.Diary,againBefore.Diary+1);assert.equal(counts.Checkins,againBefore.Checkins+1);waiting.Diary.resolve([]);waiting.Checkins.resolve(checkins);await tick();assert.equal(S.getHistoryLoadStatus().diary,'loaded');assert.equal(S.getHistoryLoadStatus().checkins,'loaded');await Promise.all([one,two]);assert.equal(S._historyInitializing.size,1);groups++;
 const batchWaiting={...waiting};const separateBefore=clone();setup();const independent=S.initFromApi({fields:['checkins']});waiting.Checkins.resolve(checkins);await independent;assert.equal(counts.Checkins,separateBefore.Checkins+1);assert.equal(counts.Diary,separateBefore.Diary);assert.equal(S._historyInitializing.size,1);groups++;
 // The older default batch is deliberately still waiting for unrelated diagnostic/habitual promises.
 for(const resource of S._historyRestoring.keys())assert(/diagnostic|habitual/.test(resource));
 batchWaiting.DiagResult.resolve(null);batchWaiting.HabitualResult.resolve(null);await three;assert.equal(S._historyInitializing.size,0);assert.equal(S._historyRestoring.size,0);
 S.clearUser();S.bindUser('B');setup();const stale=S.initFromApi({fields:['diary']});const oldDiary=waiting.Diary;S.clearUser();S.bindUser('C');setup();const fresh=S.initFromApi({fields:['diary']});waiting.Diary.resolve([]);await fresh;oldDiary.resolve(diary);await stale;assert.equal(S.getDiaryEntries().length,0);assert.equal(S.getHistoryLoadStatus().diary,'loaded');assert.equal(S.getHistoryLoadStatus().checkins,'idle');groups++;
 setup();S._writeDiary([{id:'p',clientId:'p',date:'2026-10-19T10:00:00Z',note:'Synthetic pending',syncStatus:'pending'}]);const failed=S.initFromApi({fields:['diary']});waiting.Diary.resolve({invalid:true});await failed;assert.equal(S.getHistoryLoadStatus().diary,'failed');assert.equal(S.getDiaryEntries()[0].syncStatus,'pending');groups++;
 setup();const repaired=S.initFromApi({fields:['diary']});waiting.Diary.resolve([]);await repaired;assert.equal(S.getHistoryLoadStatus().diary,'loaded');assert.equal(S.getDiaryEntries()[0].syncStatus,'pending');groups++;
 assert.equal(S._historyInitializing.size,0);assert.equal(S._historyRestoring.size,0);
 console.log(JSON.stringify({passed:true,groups,initialRows:2000,repeatDiaryRequests:0,diagnosticRepeatRequests:0,selectedRetry:true,overlapDeduplicated:true,unrelatedPendingDoesNotBlock:true,lateOwnerIgnored:true,emptyGetPreservesPending:true,realNetwork:0}));
})().catch(e=>{console.error(e);process.exitCode=1});
