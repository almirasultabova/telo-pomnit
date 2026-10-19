const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const backing = new Map(); let quota = false, offline = true;
const localStorage = { getItem:k=>backing.get(k)??null, setItem(k,v){if(quota)throw Error('quota');backing.set(k,String(v));},removeItem(k){if(quota)throw Error('quota');backing.delete(k);} };
const remote = new Map([['old',{id:'old',createdAt:'2026-10-01T12:00:00Z',situation:'older',reactionType:'freeze',intensity:2,sensations:[]}]]);
const api={isAuthed:()=>true,getDiary:async()=>[],getDiagResult:async()=>null,getHabitualResult:async()=>null,getCheckins:async()=>[],getTriggers:async()=>[...remote.values()],saveTrigger:async data=>{if(offline)throw Error('offline');const row={...data,id:data.clientId};remote.set(data.clientId,row);return row;}};
function boot(){const c=vm.createContext({window:{localStorage,addEventListener(){}},document:{getElementById:()=>null},crypto:{randomUUID},setTimeout:()=>1,clearTimeout(){},Api:api,console});vm.runInContext(fs.readFileSync('app/js/boot.js','utf8'),c);return vm.runInContext(fs.readFileSync('app/js/storage.js','utf8')+'\n({Storage,AppLocalStorage})',c);}
(async()=>{
 let {Storage:s,AppLocalStorage:a}=boot();a.setItem('key','old');quota=true;assert.equal(a.setItem('key','new'),false);assert.equal(a.getItem('key'),'new');assert.equal(a.isPersistent(),false);a.removeItem('key');assert.equal(a.getItem('key'),null);quota=false;a.setItem('key','newer');assert.equal(a.getItem('key'),'newer');
 s.bindUser('A');const row=s.saveTriggerEntry({situation:'own',reactionType:'fight',intensity:4,sensations:[]});await s.flushTriggersPending();
 s=boot().Storage;s.bindUser('A');await s.initFromApi();assert.equal(s.getTriggerEntries().length,1);await s.loadTriggerHistory();assert.equal(s.getTriggerEntries().length,2);assert(s.getTriggerEntries().some(r=>r.clientId===row.clientId));offline=false;await s.flushTriggersPending();await s.flushTriggersPending();assert.equal(remote.size,2);assert.equal(s.getTriggerEntries().find(r=>r.clientId===row.clientId).syncStatus,'synced');
 s.saveFormDraft('feedback',{text:'own'});s.bindUser('B');assert.equal(s.getFormDraft('feedback'),null);s.bindUser('A');assert.equal(s.getFormDraft('feedback').text,'own');
 assert.equal(s.exportPendingForUser('A').formDrafts.feedback.text,'own');s.purgeUser('A');assert.equal(s.getFormDraft('feedback'),null);assert.equal(Object.keys(s.exportPendingForUser('A').formDrafts).length,0);assert.throws(()=>s.bindUser('A'),/ACCOUNT_DELETED/);
 console.log('PASS quota/stale-remove, offline/reopen/nonempty GET/retry, account-isolated drafts');
})().catch(e=>{console.error(e);process.exitCode=1});
