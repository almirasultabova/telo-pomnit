const fs=require('node:fs'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),{randomUUID,randomBytes}=require('node:crypto');
const stage=__dirname,live='/var/www/telo-pomnit/backend',runtime=process.argv.includes('--installed')?live:stage+'/backend';
const c=JSON.parse(fs.readFileSync(stage+'/test-private.json'));assert(/^telo_japp143_[a-f0-9]{12}$/.test(c.name));assert.equal(new URL(c.url).pathname,'/'+c.name);
Object.assign(process.env,{DATABASE_URL:c.url,DIRECT_URL:c.url,JWT_SECRET:randomBytes(32).toString('hex'),BOT_TOKEN:'synthetic-no-network',ADMIN_TELEGRAM_IDS:'9999901'});
const {PrismaClient}=require(stage+'/test-client'),db=new PrismaClient();require.cache[require.resolve(runtime+'/src/db.js')]={exports:db};
let external=0;global.fetch=async()=>{external++;throw Error('External calls forbidden')};
function prisma(args){const r=spawnSync('node',[live+'/node_modules/prisma/build/index.js',...args],{encoding:'utf8',env:process.env});if(r.status){fs.writeFileSync(stage+'/private-prisma-error.log',r.stdout+'\n'+r.stderr,{mode:0o600});throw Error('Prisma command failed; private diagnostics saved')}return r.stdout}
(async()=>{
 assert.equal((await db.$queryRawUnsafe('SELECT current_database() AS name'))[0].name,c.name);
 const migration='20261019193000_meeting_recordings',sql=fs.readFileSync(stage+'/backend/prisma/migrations/'+migration+'/migration.sql','utf8');
 const journal=await db.$queryRawUnsafe('SELECT id,checksum,migration_name,finished_at FROM _prisma_migrations ORDER BY id');
 if(!process.argv.includes('--installed')){
  assert.equal((await db.$queryRawUnsafe("SELECT column_name FROM information_schema.columns WHERE table_name='meetings' AND column_name IN ('recording_url','recording_passcode')")).length,0);
  const baselineUser=await db.user.create({data:{telegramId:BigInt(9999800),accessStatus:'approved',name:'Pre-migration synthetic'}});
  const baselineStream=await db.stream.create({data:{name:'Pre-migration fixture',startDate:new Date('2026-10-15'),endDate:new Date('2026-11-12')}});
  await db.$executeRawUnsafe('INSERT INTO meetings(id,stream_id,number,date,topic) VALUES($1,$2,$3,$4,$5)',randomUUID(),baselineStream.id,1,new Date('2026-10-15'),'Preserved fixture');
  const old=await db.$queryRawUnsafe('SELECT id,stream_id,number,date,topic,description,prepare,zoom_link FROM meetings ORDER BY id');
  await db.$executeRawUnsafe(sql);prisma(['migrate','resolve','--schema',stage+'/backend/prisma/schema.prisma','--applied',migration]);
  assert.deepEqual(await db.$queryRawUnsafe('SELECT id,stream_id,number,date,topic,description,prepare,zoom_link FROM meetings ORDER BY id'),old);
  assert.equal((await db.meeting.findFirst()).recordingUrl,null);assert.equal((await db.meeting.findFirst()).recordingPasscode,null);
  assert.deepEqual(await db.user.findUnique({where:{id:baselineUser.id}}),baselineUser);
  const after=await db.$queryRawUnsafe('SELECT id,checksum,migration_name,finished_at FROM _prisma_migrations ORDER BY id');assert.equal(after.length,journal.length+1);for(const row of journal)assert.deepEqual(after.find(x=>x.id===row.id),row);
 }
 prisma(['validate','--schema',stage+'/test-schema.prisma']);
 await db.meeting.deleteMany();await db.enrollment.deleteMany();await db.stream.deleteMany();await db.user.deleteMany();
 const app=require(live+'/node_modules/fastify')({logger:false});const routes=require(runtime+'/src/routes/me.js');app.register(routes);await app.ready();
 let groups=0;const now=Date.now(),days=n=>new Date(now+n*86400000);
 const user=await db.user.create({data:{telegramId:BigInt(9999801),accessStatus:'approved',name:'Fixture'}});
 const other=await db.user.create({data:{telegramId:BigInt(9999802),accessStatus:'approved'}});
 const host=await db.user.create({data:{telegramId:BigInt(9999803),accessStatus:'approved',role:'HOST'}});
 const url='https://zoom.example.test/rec/share/fixture',code='?=Test^&<';
 async function stream(name,start,end,status='active',extra={}){return db.stream.create({data:{name,startDate:days(start),endDate:days(end),enrollments:{create:{userId:user.id,status,paidAt:new Date(),...extra}},meetings:{create:{number:1,date:days(start),topic:'Synthetic meeting',recordingUrl:url,recordingPasscode:code}}}})}
 const current=await stream('Current',-4,20),completed=await stream('Completed',-30,-5,'completed'),future=await stream('Future',5,30),expired=await stream('Expired',-200,-100,'completed'),revoked=await stream('Revoked',-4,20,'active',{accessExpires:days(-1)}),cancelled=await stream('Cancelled',-4,20,'cancelled'),pending=await stream('Pending',-4,20,'pending');
 const token=u=>require(runtime+'/src/services/auth').createToken(u.id,u.tokenVersion);
 const get=(u,path='/me/enrollment/access')=>app.inject({url:path,headers:{authorization:'Bearer '+token(u)}});
 try{
  assert.equal((await app.inject({url:'/me/enrollment/access'})).statusCode,401);groups++;
  let r=await get(user);assert.equal(r.statusCode,200);assert.equal(r.headers['cache-control'],'private, no-store');const a=r.json();groups++;
  for(const id of[current.id,completed.id]){const s=a.streams.find(s=>s.id===id);assert.equal(s.canReadRecordings,true);assert.equal(s.meetings[0].recordingUrl,url);assert.equal(s.meetings[0].recordingPasscode,code);groups++}
  for(const id of[future.id,expired.id,revoked.id]){const s=a.streams.find(s=>s.id===id);assert.equal(s.canReadRecordings,false);assert.equal(s.meetings[0].recordingUrl,null);assert.equal(s.meetings[0].recordingPasscode,null);groups++}
  for(const id of[cancelled.id,pending.id])assert(!a.streams.some(s=>s.id===id));groups++;
  r=await get(other);assert(!r.body.includes(url));assert(!r.body.includes(code));assert.deepEqual(r.json().streams,[]);groups++;
  r=await get(user,'/me');assert.equal(r.statusCode,200);assert.equal(r.headers['cache-control'],'private, no-store');assert(r.json().streams.some(s=>s.id===current.id));groups++;
  r=await get(host);assert.equal(r.statusCode,200);assert(r.json().streams.some(s=>s.id===current.id&&s.meetings[0].recordingUrl===url));groups++;
  const boundary=routes.streamBounds(await db.stream.findUnique({where:{id:completed.id}})).recordingsEnd;let b=await routes.getProgramAccess(user,boundary-1);assert(b.streams.find(s=>s.id===completed.id).meetings[0].recordingUrl);b=await routes.getProgramAccess(user,boundary);assert.equal(b.streams.find(s=>s.id===completed.id).meetings[0].recordingUrl,null);groups++;
  await db.user.update({where:{id:user.id},data:{accessStatus:'pending'}});r=await get(user);assert.equal(r.statusCode,403);assert(!r.body.includes(url));groups++;
  await db.user.update({where:{id:user.id},data:{accessStatus:'approved',tokenVersion:1}});assert.equal((await get(user)).statusCode,401);groups++;
  await db.user.update({where:{id:user.id},data:{tokenVersion:0,deletedAt:new Date()}});assert.equal((await get(user)).statusCode,401);groups++;
  assert.equal(external,0);groups++;
  const result={passed:true,groups,nativePostgres:true,nativeAuth:true,additiveMigration:true,journalPreserved:true,syntheticOnly:true,productionTestWrites:0,externalCalls:external,installed:process.argv.includes('--installed')};fs.writeFileSync(stage+(result.installed?'/installed-postgres-results.json':'/postgres-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await app.close();await db.$disconnect()}
})().catch(e=>{fs.writeFileSync(stage+'/private-test-error.log',e.stack||String(e),{mode:0o600});console.error('Native PostgreSQL test failed; diagnostics private');process.exit(1)});
