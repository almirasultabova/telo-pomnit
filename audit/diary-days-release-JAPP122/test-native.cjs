// Candidate only, real disposable PostgreSQL; production route is never replaced.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {randomUUID,randomBytes,createHash}=require('node:crypto');
const stage=__dirname,release=stage,live='/var/www/telo-pomnit/backend';
const runtime=process.argv.includes('--installed')?live:stage+'/backend',referenceDir=stage+'/reference';
const c=JSON.parse(fs.readFileSync(release+'/test-private.json'));
assert(/^telo_japp122_[a-f0-9]{12}$/.test(c.name));assert.equal(new URL(c.url).pathname,'/'+c.name);
Object.assign(process.env,{DATABASE_URL:c.url,DIRECT_URL:c.url,JWT_SECRET:randomBytes(32).toString('hex'),BOT_TOKEN:'synthetic-no-network'});
const {PrismaClient}=require(release+'/test-client'),db=new PrismaClient({datasources:{db:{url:c.url}}});
require.cache[require.resolve(runtime+'/src/db.js')]={exports:db};
require.cache[require.resolve(referenceDir+'/src/db.js')]={exports:db};
let external=0;global.fetch=async()=>{external++;throw Error('External network forbidden')};
const source=fs.readFileSync(runtime+'/src/routes/diary.js');
const liveBefore=createHash('sha256').update(fs.readFileSync(live+'/src/routes/diary.js')).digest('hex');
(async()=>{
 assert.equal((await db.$queryRawUnsafe('SELECT current_database() AS name'))[0].name,c.name);
 await db.diaryEntry.deleteMany();await db.user.deleteMany();
 const candidate=require(live+'/node_modules/fastify')({logger:false}),reference=require(live+'/node_modules/fastify')({logger:false});
 candidate.register(require(runtime+'/src/routes/diary.js'));reference.register(require(referenceDir+'/src/routes/diary.js'));await Promise.all([candidate.ready(),reference.ready()]);
 let groups=0;const create=async i=>db.user.create({data:{id:randomUUID(),telegramId:BigInt(920000+i),accessStatus:'approved',consentGivenAt:new Date()}});
 try{
  const [a,b,empty,dense]=await Promise.all([1,2,3,4].map(create));
  const token=u=>require(runtime+'/src/services/auth.js').createToken(u.id,u.tokenVersion);
  const get=(app,u,url='/diary/days')=>app.inject({url,headers:{authorization:'Bearer '+token(u)}});
  // Includes summer/winter offsets, the 2014 Moscow rollback and midnight boundaries.
  const dates=['2001-08-31T20:30:00Z','2010-03-27T22:59:59Z','2010-03-27T23:00:00Z','2011-03-26T22:59:59Z','2011-03-26T23:00:00Z','2014-10-25T21:59:59Z','2014-10-25T22:00:00Z','2026-10-18T20:59:59Z','2026-10-18T21:00:00Z'];
  await db.diaryEntry.createMany({data:dates.concat(dates).map(createdAt=>({id:randomUUID(),userId:a.id,zone:'chest',sensations:[],note:'PRIVATE-SYNTHETIC',createdAt:new Date(createdAt)}))});
  await db.diaryEntry.create({data:{userId:b.id,zone:'back',sensations:[],createdAt:new Date('1990-01-01T00:00:00Z')}});
  await db.diaryEntry.createMany({data:Array.from({length:10000},(_,i)=>({id:randomUUID(),userId:dense.id,zone:'chest',sensations:[],note:'Искусственная запись',createdAt:new Date(Date.UTC(2026,9,18,12)-Math.floor(i/2000)*86400000)}))});
  assert.equal((await candidate.inject({url:'/diary/days'})).statusCode,401);groups++;
  let r=await get(candidate,a);assert.equal(r.statusCode,200);assert.deepEqual(r.json(),(await get(reference,a)).json());assert.equal(r.headers['cache-control'],'private, no-store');assert(!r.body.includes('PRIVATE'));assert(!r.body.includes(a.id));groups++;
  assert.deepEqual((await get(candidate,b)).json(),(await get(reference,b)).json());groups++;
  assert.deepEqual((await get(candidate,empty)).json(),{timeZone:'Europe/Moscow',days:[]});groups++;
  assert.deepEqual((await get(candidate,a,'/diary/days?userId='+encodeURIComponent("' OR 1=1 --")+'&from=1900-01-01&limit=1')).json(),r.json());groups++;
  const oldRows=await db.diaryEntry.findMany({where:{userId:dense.id},select:{createdAt:true}});
  const compact=await db.$queryRaw`SELECT DISTINCT to_char((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Moscow', 'YYYY-MM-DD') AS day FROM diary_entries WHERE user_id = ${dense.id} ORDER BY day`;
  assert.equal(oldRows.length,10000);assert.equal(compact.length,5);assert.deepEqual((await get(candidate,dense)).json(),(await get(reference,dense)).json());groups++;
  // Client's response body is intentionally identical before and after aggregation.
  for(const u of [a,b,empty,dense])assert.equal((await get(candidate,u)).body,(await get(reference,u)).body);groups++;
  await db.user.update({where:{id:a.id},data:{accessStatus:'pending'}});assert.equal((await get(candidate,a)).statusCode,403);await db.user.update({where:{id:a.id},data:{accessStatus:'approved'}});groups++;
  const validToken=token(a);await db.user.update({where:{id:a.id},data:{tokenVersion:1}});assert.equal((await candidate.inject({url:'/diary/days',headers:{authorization:'Bearer '+validToken}})).statusCode,401);await db.user.update({where:{id:a.id},data:{tokenVersion:0}});groups++;
  await db.$executeRawUnsafe('ALTER TABLE diary_entries RENAME TO diary_entries_synthetic_offline');
  try{const failed=await get(candidate,a);assert.equal(failed.statusCode,503);assert(!/prisma|SELECT|diary_entries|PRIVATE/i.test(failed.body));assert.equal(failed.headers['cache-control'],'private, no-store')}finally{await db.$executeRawUnsafe('ALTER TABLE diary_entries_synthetic_offline RENAME TO diary_entries')};groups++;
  assert.equal((await get(candidate,a)).statusCode,200);assert.equal(external,0);assert.equal(createHash('sha256').update(fs.readFileSync(live+'/src/routes/diary.js')).digest('hex'),liveBefore);groups++;
  const result={passed:true,groups,nativePostgres:true,nativeAuth:true,oldAndNewBodyIdentical:true,historicalMoscowOffsets:true,ownerBoundParameters:true,privateNoStore:true,generic503AndRecovery:true,fixtureRows:10000,oldDatabaseResultRows:oldRows.length,newDatabaseResultRows:compact.length,oldSerializedResultBytes:Buffer.byteLength(JSON.stringify(oldRows)),newSerializedResultBytes:Buffer.byteLength(JSON.stringify(compact)),productionSourceUnchanged:true,productionTestWrites:0,externalCalls:0,migrations:0,installed:process.argv.includes('--installed'),sourceHash:createHash('sha256').update(source).digest('hex')};
  fs.writeFileSync(stage+(process.argv.includes('--installed')?'/installed-postgres-results.json':'/postgres-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await Promise.all([candidate.close(),reference.close()]);await db.$disconnect()}
})().catch(e=>{fs.writeFileSync(stage+'/private-test-error.log',e.stack||String(e),{mode:0o600});console.error('Candidate aggregation test failed; diagnostics private');process.exit(1)});
