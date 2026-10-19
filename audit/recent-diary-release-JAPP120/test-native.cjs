// Native Prisma/Fastify/auth on disposable schema-only PostgreSQL; no production data.
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const {randomUUID,randomBytes}=require('node:crypto');
const stage=__dirname,live='/var/www/telo-pomnit/backend',c=JSON.parse(fs.readFileSync(stage+'/test-private.json'));
assert(/^telo_japp120_[a-f0-9]{12}$/.test(c.name));assert.equal(new URL(c.url).pathname,'/'+c.name);
Object.assign(process.env,{DATABASE_URL:c.url,DIRECT_URL:c.url,JWT_SECRET:randomBytes(32).toString('hex'),BOT_TOKEN:'synthetic-no-network'});
const runtime=process.argv.includes('--installed')?live:stage+'/backend';
const {PrismaClient}=require(stage+'/test-client'),db=new PrismaClient({datasources:{db:{url:c.url}}});
require.cache[require.resolve(runtime+'/src/db.js')]={exports:db};
let external=0;global.fetch=async()=>{external++;throw Error('External calls forbidden')};
(async()=>{
 assert.equal((await db.$queryRawUnsafe('SELECT current_database() AS name'))[0].name,c.name);
 await db.diaryEntry.deleteMany();await db.user.deleteMany();
 const app=require(live+'/node_modules/fastify')({logger:false});app.register(require(runtime+'/src/routes/diary.js'));await app.ready();
 const auth=require(runtime+'/src/services/auth.js');let groups=0;
 try{
  const users=[];for(let i=0;i<4;i++)users.push(await db.user.create({data:{id:randomUUID(),telegramId:BigInt(910001+i),accessStatus:'approved',consentGivenAt:new Date()}}));
  const [a,b,empty,long]=users,tokens=users.map(u=>auth.createToken(u.id,u.tokenVersion));
  const get=(url,i=0)=>app.inject({url,headers:{authorization:'Bearer '+tokens[i]}});
  const dates=['2026-10-18T20:59:59Z','2026-10-18T21:00:00Z','2026-10-18T23:59:00Z','2001-08-31T20:30:00Z'];
  await db.diaryEntry.createMany({data:dates.map(createdAt=>({id:randomUUID(),userId:a.id,zone:'chest',sensations:['tension'],note:'PRIVATE SYNTHETIC A',createdAt:new Date(createdAt)}))});
  await db.diaryEntry.create({data:{userId:b.id,zone:'back',sensations:[],note:'PRIVATE SYNTHETIC B',createdAt:new Date('1990-01-01T00:00:00Z')}});
  await db.diaryEntry.createMany({data:Array.from({length:1000},(_,i)=>({id:randomUUID(),userId:long.id,zone:'chest',sensations:[],note:'Учебная заметка '+i,createdAt:new Date(Date.UTC(2026,9,18,12)-i*86400000)}))});
  assert.equal((await app.inject({url:'/diary/days'})).statusCode,401);assert.equal((await app.inject({url:'/diary/days',headers:{authorization:'Bearer invalid'}})).statusCode,401);groups++;
  let r=await get('/diary/days');assert.equal(r.statusCode,200);assert.deepEqual(r.json(),{timeZone:'Europe/Moscow',days:['2001-09-01','2026-10-18','2026-10-19']});assert.equal(r.headers['cache-control'],'private, no-store');assert(!r.body.includes('PRIVATE'));assert(!r.body.includes(a.id));groups++;
  r=await get('/diary/days?userId='+b.id+'&from=1900-01-01&limit=1');assert.equal(r.json().days.length,3);assert(!r.body.includes('1990'));groups++;
  assert.deepEqual((await get('/diary/days',1)).json().days,['1990-01-01']);assert.deepEqual((await get('/diary/days',2)).json().days,[]);groups++;
  r=await get('/diary?limit=91',3);assert.equal(r.statusCode,200);assert.equal(r.json().length,91);assert.equal((await get('/diary/days',3)).json().days.length,1000);groups++;
  for(const status of ['pending','rejected']){await db.user.update({where:{id:a.id},data:{accessStatus:status}});assert.equal((await get('/diary/days')).statusCode,403)}await db.user.update({where:{id:a.id},data:{accessStatus:'approved',deletedAt:new Date()}});assert.equal((await get('/diary/days')).statusCode,401);await db.user.update({where:{id:a.id},data:{deletedAt:null,tokenVersion:1}});assert.equal((await get('/diary/days')).statusCode,401);await db.user.update({where:{id:a.id},data:{tokenVersion:0}});groups++;
  await db.$executeRawUnsafe('ALTER TABLE diary_entries RENAME TO diary_entries_synthetic_offline');
  try{r=await get('/diary/days');assert.equal(r.statusCode,503);assert.deepEqual(Object.keys(r.json()),['error']);assert(!/prisma|SELECT|diary_entries|PRIVATE/i.test(r.body))}finally{await db.$executeRawUnsafe('ALTER TABLE diary_entries_synthetic_offline RENAME TO diary_entries')};groups++;
  // Real client API code calls native injected HTTP routes and actual Prisma.
  let reads=[];const context=vm.createContext({console,AbortController,setTimeout,clearTimeout,AppLocalStorage:{setItem(){},getItem(){return null}},fetch:async(url,options)=>{reads.push(url);const response=await app.inject({method:options.method,url:url.replace(/^\/api/,''),headers:options.headers});return {ok:response.statusCode<400,status:response.statusCode,json:async()=>response.json()}}});
  vm.runInContext(fs.readFileSync(stage+'/public/js/api.js','utf8')+'\nglobalThis.api=Api;',context);context.api._token=tokens[3];context.api.userId=long.id;
  let recent=await context.api.getRecentDiary();assert.equal(recent.entries.length,91);assert.equal(recent.days.length,1000);assert.equal(recent.complete,false);assert.equal(reads.length,2);groups++;
  reads=[];const full=await context.api.getDiary();assert.equal(full.length,1000);assert.equal(new Set(full.map(r=>r.id)).size,1000);assert.equal(reads.length,12);groups++;
  context.api._token=tokens[2];recent=await context.api.getRecentDiary();assert.equal(recent.entries.length,0);assert.equal(recent.days.length,0);assert.equal(recent.complete,true);groups++;
  assert.equal(await db.diaryEntry.count(),1005);assert.equal(external,0);groups++;
  const result={passed:true,groups,nativePostgres:true,nativeAuth:true,nativeClientAPI:true,ownerScoped:true,moscowHistoricalAndBoundary:true,generic503:true,readOnlyRoutes:true,syntheticRows:1005,initialFullRows:91,compactDays:1000,initialRequests:2,fullRows:1000,fullRequests:12,productionTestWrites:0,externalCalls:0,migrations:0,installed:process.argv.includes('--installed')};
  fs.writeFileSync(stage+(result.installed?'/installed-postgres-results.json':'/postgres-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await app.close();await db.$disconnect()}
})().catch(e=>{fs.writeFileSync(stage+'/private-native-error.log',e.stack||String(e),{mode:0o600});console.error('Native PostgreSQL test failed; private diagnostics saved');process.exit(1)});
