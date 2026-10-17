// The real renderer with deferred synthetic transport. No browser, storage or network.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app/js/app.js'),'utf8');
const code=source.slice(source.indexOf('let profileStatsRequest = 0;'),source.indexOf('// ─── Ссылки в профиле'));
const container={innerHTML:'',children:[],append(node){this.children.push(node)}};
let pending=[];
const ctx={Api:{userId:'A',_authGeneration:1,clubBlocked:false,isAuthed:()=>true,getProfileStats:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))},document:{getElementById:()=>container,createElement:()=>({})},pluralStreakDays:n=>n+' дней подряд',Number,Error};
vm.createContext(ctx);vm.runInContext(code,ctx);
async function tick(){await Promise.resolve();await Promise.resolve()}
(async()=>{
 ctx.renderStats();const a=pending.shift();assert(container.innerHTML.includes('—'));
 ctx.Api.userId='B';ctx.Api._authGeneration++;ctx.renderStats();const b=pending.shift();
 a.resolve({visitStreak:999,savedObservations:999});await tick();assert(!container.innerHTML.includes('999'),'late former account blocked');
 b.resolve({visitStreak:12,savedObservations:2});await tick();assert(container.innerHTML.includes('12 дней подряд'));assert(container.innerHTML.includes('сохранённых<br>наблюдения'));
 ctx.renderStats();const old=pending.shift();ctx.renderStats();const latest=pending.shift();
 latest.resolve({visitStreak:13,savedObservations:3});await tick();old.resolve({visitStreak:12,savedObservations:2});await tick();assert(container.innerHTML.includes('13 дней подряд'),'newest refresh wins');
 ctx.renderStats();pending.shift().reject(Error('offline'));await tick();assert(container.innerHTML.includes('—'));assert.equal(container.children.at(-1).textContent,'Обновить цифры');
 assert(!container.innerHTML.includes('Дни считаются'));assert(!container.innerHTML.includes('в приложении'));
 console.log('PASS real renderer: former-account/older responses blocked, newest server totals win, offline stays unknown with retry, short copy; synthetic only');
})().catch(e=>{console.error(e);process.exitCode=1});
