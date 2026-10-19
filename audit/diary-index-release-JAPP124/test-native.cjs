// Index migration and query-plan proof on disposable schema-only PostgreSQL only.
const fs=require('node:fs'),assert=require('node:assert/strict'),{createHash,randomUUID}=require('node:crypto'),{spawnSync}=require('node:child_process');
const stage=__dirname,release=stage,live='/var/www/telo-pomnit/backend';
const c=JSON.parse(fs.readFileSync(release+'/test-private.json'));assert(/^telo_japp124_[a-f0-9]{12}$/.test(c.name));assert.equal(new URL(c.url).pathname,'/'+c.name);
Object.assign(process.env,{DATABASE_URL:c.url,DIRECT_URL:c.url,JWT_SECRET:'synthetic-japp123-only',BOT_TOKEN:'synthetic-no-network'});
const {PrismaClient}=require(release+'/test-client'),db=new PrismaClient({datasources:{db:{url:c.url}}});
require.cache[require.resolve(live+'/src/db.js')]={exports:db};let external=0;global.fetch=async()=>{external++;throw Error('No external calls')};
const index='diary_entries_user_created_id_idx',migration=stage+'/backend/prisma/migrations/20261019170000_diary_owner_date_index/migration.sql';
const nodes=p=>[p,...(p.Plans||[]).flatMap(nodes)];const digest=b=>createHash('sha256').update(b).digest('hex');
function run(args){const r=spawnSync('node',[live+'/node_modules/prisma/build/index.js',...args],{encoding:'utf8',env:process.env});if(r.status!==0){fs.writeFileSync(stage+'/private-prisma-error.log',r.stdout+'\n'+r.stderr,{mode:0o600});throw Error('Candidate Prisma check failed; private diagnostics')}return r.stdout}
(async()=>{
 assert.equal((await db.$queryRawUnsafe('SELECT current_database() AS name'))[0].name,c.name);

 await db.$executeRawUnsafe('DROP INDEX CONCURRENTLY IF EXISTS "diary_entries_user_created_id_idx"');
 await db.$executeRawUnsafe('DELETE FROM _prisma_migrations');
 for(const row of JSON.parse(fs.readFileSync(stage+'/inspection.json')).migrationRows){
  assert(row.finished&&!row.rolledBack);
  await db.$executeRaw`INSERT INTO _prisma_migrations(id,checksum,finished_at,migration_name,started_at,applied_steps_count) VALUES (${randomUUID()},${row.checksum},CURRENT_TIMESTAMP,${row.name},CURRENT_TIMESTAMP,1)`;
 }
 await db.diaryEntry.deleteMany();await db.user.deleteMany();
 const fixtureOwner=await db.user.create({data:{telegramId:920004n,accessStatus:'approved',consentGivenAt:new Date()}});
 const fixtureOther=await db.user.create({data:{telegramId:920002n,accessStatus:'approved',consentGivenAt:new Date()}});
 await db.diaryEntry.createMany({data:Array.from({length:10000},(_,i)=>({id:randomUUID(),userId:fixtureOwner.id,zone:'chest',sensations:[],createdAt:new Date(Date.UTC(2026,9,18,12)-Math.floor(i/2000)*86400000)}))});
 await db.diaryEntry.createMany({data:Array.from({length:19},()=>({id:randomUUID(),userId:fixtureOther.id,zone:'back',sensations:[]}))});
 const previousLedger=await db.$queryRaw`SELECT id,checksum,migration_name,finished_at FROM _prisma_migrations ORDER BY id`;

 assert.equal((await db.$queryRaw`SELECT count(*)::int AS n FROM pg_indexes WHERE indexname = ${index}`)[0].n,0);
 const owner=await db.user.findUniqueOrThrow({where:{telegramId:920004n}}),other=await db.user.findUniqueOrThrow({where:{telegramId:920002n}});
 const app=require(live+'/node_modules/fastify')({logger:false});app.register(require(live+'/src/routes/diary.js'));await app.ready();const token=require(live+'/src/services/auth.js').createToken(owner.id,owner.tokenVersion);let groups=0;
 const get=url=>app.inject({url,headers:{authorization:'Bearer '+token}});
 const explain=async()=>{const row=await db.$queryRaw`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT * FROM diary_entries WHERE user_id = ${owner.id} ORDER BY created_at DESC, id DESC LIMIT 91`;return row[0]['QUERY PLAN'][0].Plan};
 try{
  // Add tied dates to test the existing id DESC tie-breaker without changing semantics.
  await db.diaryEntry.createMany({data:Array.from({length:120},()=>({id:randomUUID(),userId:owner.id,zone:'chest',sensations:[],createdAt:new Date('2026-10-19T12:00:00Z')}))});
  await db.$executeRawUnsafe('VACUUM ANALYZE diary_entries');const before=await explain();
  assert(nodes(before).some(n=>n['Node Type']==='Sort'));const beforeScan=nodes(before).filter(n=>/Scan$/.test(n['Node Type']));assert(beforeScan.some(n=>n['Actual Rows']>=10000));groups++;
  const pageBefore=await get('/diary?limit=91'),daysBefore=await get('/diary/days');assert.equal(pageBefore.statusCode,200);assert.equal(pageBefore.json().length,91);groups++;
  const countsBefore=await db.diaryEntry.count();
  const schema=stage+'/backend/prisma/schema.prisma';run(['validate','--schema',schema]);
  const diff=run(['migrate','diff','--from-schema-datamodel',stage+'/before/backend/prisma/schema.prisma','--to-schema-datamodel',schema,'--script']);
  assert(diff.includes('CREATE INDEX "'+index+'"'));assert(!/DROP|ALTER TABLE|CREATE UNIQUE/i.test(diff));fs.writeFileSync(stage+'/prisma-diff.sql',diff);groups++;
  // Exactly the candidate migration, no explicit transaction or production connection.
  await db.$executeRawUnsafe(fs.readFileSync(migration,'utf8'));groups++;
  const valid=(await db.$queryRaw`SELECT indisvalid, indisready FROM pg_index JOIN pg_class ON indexrelid=pg_class.oid WHERE relname = ${index}`)[0];assert(valid.indisvalid&&valid.indisready);groups++;
  const after=await explain();assert(!nodes(after).some(n=>n['Node Type']==='Sort'));const scan=nodes(after).find(n=>n['Index Name']===index);assert(scan);assert.equal(scan['Actual Rows'],91);groups++;
  assert.equal((await get('/diary?limit=91')).body,pageBefore.body);assert.equal((await get('/diary/days')).body,daysBefore.body);assert.equal(await db.diaryEntry.count(),countsBefore);groups++;
  const first=(await get('/diary?limit=90&offset=0')).json(),second=(await get('/diary?limit=90&offset=90')).json();assert.equal(first.length,90);assert.equal(second.length,90);assert.equal(new Set([...first,...second].map(r=>r.id)).size,180);assert(first.every(r=>r.userId===owner.id)&&second.every(r=>r.userId===owner.id));groups++;
  // The non-unique read index does not block a new observation or existing idempotency.
  const clientId=randomUUID(),payload={zone:'chest',sensations:[],clientId,note:'Учебная проверка индекса'};
  const post=()=>app.inject({method:'POST',url:'/diary',headers:{authorization:'Bearer '+token},payload});const write=await post(),replay=await post();assert.equal(write.statusCode,200);assert.equal(replay.statusCode,200);assert.equal(write.json().id,replay.json().id);assert.equal(await db.diaryEntry.count(),countsBefore+1);groups++;
  const otherToken=require(live+'/src/services/auth.js').createToken(other.id,other.tokenVersion);assert((await app.inject({url:'/diary?limit=91',headers:{authorization:'Bearer '+otherToken}})).json().every(r=>r.userId===other.id));assert.equal((await app.inject({url:'/diary'})).statusCode,401);groups++;
  const size=Number((await db.$queryRaw`SELECT pg_relation_size(${index}::regclass) AS n`)[0].n);
  // Rollback is exercised only on this isolated database, then reapply for final drift check.
  await db.$executeRawUnsafe('DROP INDEX CONCURRENTLY "diary_entries_user_created_id_idx"');assert.equal((await db.$queryRaw`SELECT count(*)::int AS n FROM pg_indexes WHERE indexname = ${index}`)[0].n,0);await db.$executeRawUnsafe(fs.readFileSync(migration,'utf8'));groups++;
  const drift=run(['migrate','diff','--from-url',c.url,'--to-schema-datamodel',schema,'--script']);assert(!drift.includes(index),'Candidate index drift');groups++;

  run(['migrate','resolve','--applied','20261019170000_diary_owner_date_index','--schema',schema]);
  const ledger=await db.$queryRaw`SELECT checksum,finished_at,rolled_back_at FROM _prisma_migrations WHERE migration_name='20261019170000_diary_owner_date_index'`;
  assert.equal(ledger.length,1);assert(ledger[0].finished_at&&!ledger[0].rolled_back_at);assert.equal(ledger[0].checksum,digest(fs.readFileSync(migration)));groups++;
  assert.deepEqual(await db.$queryRaw`SELECT id,checksum,migration_name,finished_at FROM _prisma_migrations WHERE migration_name<>'20261019170000_diary_owner_date_index' ORDER BY id`,previousLedger);groups++;

  assert.equal(external,0);
  const summarize=p=>nodes(p).map(n=>({type:n['Node Type'],index:n['Index Name']||null,actualRows:n['Actual Rows'],removedByFilter:n['Rows Removed by Filter']||0}));
  const result={passed:true,groups,nativePostgres:true,nativePrisma:true,fixtureOwnerRowsBefore:10120,beforePlan:summarize(before),afterPlan:summarize(after),sortRemoved:true,indexScanRows:91,responseBodiesUnchanged:true,writeAndIdempotencyPreserved:true,validConcurrentIndex:true,rollbackAndReapply:true,prismaValidateAndDiff:true,indexBytes:size,migrationResolveVerified:true,legacyLedgerPreserved:true,installed:process.argv.includes('--installed'),productionSchemaChanged:false,productionTestWrites:0,externalCalls:0,published:false,sourceHashes:{'backend/prisma/schema.prisma':digest(fs.readFileSync(schema)),'backend/prisma/migrations/20261019170000_diary_owner_date_index/migration.sql':digest(fs.readFileSync(migration))}};
  fs.writeFileSync(stage+(process.argv.includes('--installed')?'/installed-postgres-results.json':'/postgres-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await app.close();await db.$disconnect()}
})().catch(e=>{fs.writeFileSync(stage+'/private-test-error.log',e.stack||String(e),{mode:0o600});console.error('Candidate index test failed; diagnostics private');process.exit(1)});
