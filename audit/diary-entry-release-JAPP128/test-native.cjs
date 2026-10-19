// Actual production route code, disposable schema-only DB, candidate client/Storage.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto');
const stage=__dirname,live='/var/www/telo-pomnit/backend',c=JSON.parse(fs.readFileSync(stage+'/test-private.json'));
assert(/^telo_japp128_[a-f0-9]{12}$/.test(c.name));assert.equal(new URL(c.url).pathname,'/'+c.name);
Object.assign(process.env,{DATABASE_URL:c.url,DIRECT_URL:c.url,JWT_SECRET:'synthetic-japp128-only',BOT_TOKEN:'synthetic-no-network'});
const {PrismaClient}=require(stage+'/test-client'),db=new PrismaClient({datasources:{db:{url:c.url}}});require.cache[require.resolve(live+'/src/db.js')]={exports:db};
let external=0;global.fetch=async()=>{external++;throw Error('External calls forbidden')};
(async()=>{
 assert.equal((await db.$queryRawUnsafe('SELECT current_database() AS name'))[0].name,c.name);let groups=1;
 const a=await db.user.create({data:{telegramId:930021n,accessStatus:'approved',consentGivenAt:new Date()}}),b=await db.user.create({data:{telegramId:930022n,accessStatus:'approved',consentGivenAt:new Date()}});
 const row=(owner,date,note)=>({id:randomUUID(),userId:owner.id,clientId:randomUUID(),zone:'chest',sensations:['tension'],note,createdAt:new Date(date)});
 const old=Array.from({length:1000},(_,i)=>row(a,new Date(Date.parse('2026-10-18T12:00:00Z')-i*86400000),'Учебная запись '+i));
 const today=Array.from({length:95},(_,i)=>row(a,new Date(Date.parse('2026-10-19T12:00:00Z')-i*1000),'Сегодня '+i));
 const bounds=[row(a,'2026-10-18T20:59:59.999Z','before'),row(a,'2026-10-18T21:00:00.000Z','start'),row(a,'2026-10-19T20:59:59.999Z','end'),row(a,'2026-10-19T21:00:00.000Z','after')];
 await db.diaryEntry.createMany({data:[...old,...today,...bounds,row(b,'2026-10-19T11:00:00Z','Другой владелец')]});groups++;
 const app=require(live+'/node_modules/fastify')({logger:false});app.register(require(live+'/src/routes/diary.js'));app.register(require(live+'/src/routes/diary-history.js'));await app.ready();
 const auth=require(live+'/src/services/auth.js'),token=auth.createToken(a.id,a.tokenVersion),tokenB=auth.createToken(b.id,b.tokenVersion),reads=[];
 const map=new Map(),local={getItem:k=>map.get(k)??null,setItem:(k,v)=>{map.set(k,String(v));return true},removeItem:k=>map.delete(k)};
 class ClockDate extends Date{constructor(...args){super(...(args.length?args:['2026-10-19T12:00:00Z']))}static now(){return Date.parse('2026-10-19T12:00:00Z')}}
 const ctx=vm.createContext({window:{localStorage:local,addEventListener(){}},AppLocalStorage:local,console,Date:ClockDate,URL,URLSearchParams,crypto:require('node:crypto'),AbortController,setTimeout,clearTimeout,fetch:async(url,o={})=>{
  reads.push({method:o.method||'GET',url});const r=await app.inject({method:o.method||'GET',url:url.replace(/^\/api/,''),headers:o.headers,payload:o.body});return{ok:r.statusCode>=200&&r.statusCode<300,status:r.statusCode,json:async()=>r.json()};
 }});
 vm.runInContext(['app/js/api.js','app/js/storage.js'].map(f=>fs.readFileSync(stage+'/'+f,'utf8')).join('\n')+'\nglobalThis.A=Api;globalThis.S=Storage;',ctx);
 const {A,S}=ctx;A.userId=a.id;A._token=token;S.bindUser(a.id);for(const k of ['flushPending','flushCheckinsPending','flushTriggersPending','flushHabitualResult'])S[k]=async()=>{};
 try{
  await S.initFromApi({fields:['diary'],recentDiary:true});assert.equal(S.getDiaryEntries().length,91);assert.equal(S.getHistoryLoadStatus().diary,'partial');assert.equal(S.getDiaryTodayStatus(),'idle');groups++;
  await S.ensureDiaryToday();assert.equal(S.getTodayEntries(new ClockDate()).length,97);assert.equal(S.getDiaryTodayStatus(),'loaded');assert.equal(S.getHistoryLoadStatus().diary,'partial');assert.equal(reads.filter(r=>r.url.includes('from=')).length,2);assert(!reads.some(r=>r.url.includes('/diary?limit=90')));groups++;
  const dates=await A.getDiaryDay('2026-10-19');assert.equal(dates.length,97);for(const r of dates)assert.equal(r.userId,a.id);for(const word of ['start','end'])assert(dates.some(r=>r.note===word));for(const word of ['before','after','Другой владелец'])assert(!dates.some(r=>r.note===word));groups++;
  assert(S.diaryStreakReady());assert.equal(S.getStreak(new ClockDate()),1001);const count=reads.length;await S.ensureDiaryToday();assert.equal(reads.length,count);groups++;
  const search=await A.searchDiaryHistory({query:'Учебная запись 900',limit:20,offset:0});assert.equal(search.entries.length,1);assert.equal(search.entries[0].id,old[900].id);assert(!S.getDiaryEntries().some(r=>r.id===old[900].id));groups++;
  const marked=await A.setDiaryImportant('body',old[900].id,true);assert.equal(marked.important,true);const important=await A.searchDiaryHistory({important:true,limit:20,offset:0});assert(important.entries.some(r=>r.id===old[900].id));const detail=await A.getDiaryHistoryRecord('body',old[900].id);assert.equal(detail.id,old[900].id);groups++;
  assert.equal((await app.inject({url:'/diary'})).statusCode,401);assert.equal((await app.inject({url:'/diary/days'})).statusCode,401);const ownB=await app.inject({url:'/diary?limit=90&userId='+a.id,headers:{authorization:'Bearer '+tokenB}});assert.equal(ownB.statusCode,200);assert.equal(ownB.json().length,1);assert.equal(ownB.json()[0].userId,b.id);const other=await app.inject({url:'/diary-history/body/'+old[900].id,headers:{authorization:'Bearer '+tokenB}});assert.equal(other.statusCode,404);groups++;
  await S.ensureDiaryHistory();assert.equal(S.getHistoryLoadStatus().diary,'loaded');assert.equal(S.getDiaryEntries().length,1099);assert.equal(S.getTodayEntries(new ClockDate()).length,97);assert.equal(await db.diaryEntry.count(),1100);assert.equal(external,0);groups++;
  const result={passed:true,groups,nativePostgres:true,nativePrisma:true,nativeFastifyAuth:true,oldRows:1000,todayRows:97,moscowBoundaries:true,dayRequests:2,archiveGETsOnDiary:0,streak:1001,oldRecordSearchAndImportant:true,ownerIsolation:true,fullHistoryPreserved:true,productionTestWrites:0,externalCalls:external,sourceHashes:Object.fromEntries(['app/js/api.js','app/js/storage.js','app/js/app.js'].map(f=>[f,createHash('sha256').update(fs.readFileSync(stage+'/'+f)).digest('hex')]))};
  fs.writeFileSync(stage+'/postgres-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await app.close();await db.$disconnect()}
})().catch(e=>{fs.writeFileSync(stage+'/private-test-error.log',e.stack||String(e),{mode:0o600});console.error('Disposable native test failed; diagnostics private');process.exit(1)});
