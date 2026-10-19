// Only schema/index/migration metadata; no participant rows or production test writes.
const fs=require('node:fs'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const live='/var/www/telo-pomnit/backend',env={};require(live+'/node_modules/dotenv').config({path:live+'/.env',processEnv:env,quiet:true});
const {PrismaClient}=require(live+'/node_modules/@prisma/client'),db=new PrismaClient({datasources:{db:{url:env.DIRECT_URL||env.DATABASE_URL}}}),hash=p=>createHash('sha256').update(fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n')).digest('hex');
(async()=>{try{
 const m=JSON.parse(fs.readFileSync(__dirname+'/manifest.json'));for(const f of m.backend)assert.equal(hash('/var/www/telo-pomnit/'+f.path),f.after);
 for(const name of ['diary_entries_user_created_id_idx','checkins_user_created_id_idx']){
  const state=(await db.$queryRaw`SELECT indisvalid,indisready,pg_get_indexdef(indexrelid) AS definition FROM pg_index JOIN pg_class ON indexrelid=pg_class.oid WHERE relname=${name}`)[0];assert(state?.indisvalid&&state.indisready);assert(state.definition.includes('(user_id, created_at DESC, id DESC)'));
 }
 const row=await db.$queryRaw`SELECT checksum,finished_at,rolled_back_at FROM _prisma_migrations WHERE migration_name='20261019173000_checkin_owner_date_index'`;assert.equal(row.length,1);assert(row[0].finished_at&&!row[0].rolled_back_at);assert.equal(row[0].checksum,m.backend.find(f=>f.path.endsWith('migration.sql')).after);
 const expected=JSON.parse(fs.readFileSync(__dirname+'/inspection.json')).migrationRows;
 const older=await db.$queryRaw`SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations WHERE migration_name<>'20261019173000_checkin_owner_date_index' ORDER BY migration_name`;
 assert.deepEqual(older.map(r=>({name:r.migration_name,checksum:r.checksum,finished:!!r.finished_at,rolledBack:!!r.rolled_back_at})),expected.sort((a,b)=>a.name.localeCompare(b.name)));
 const result={passed:true,checkinIndexValidAndReady:true,diaryIndexPreserved:true,checkinMigrationRecorded:true,legacyLedgerRowsPreserved:older.length,publishedSchemaAndMigrationHashesMatch:true,participantRowsRead:0,productionTestWrites:0};fs.writeFileSync(__dirname+'/production-check.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await db.$disconnect()}})().catch(e=>{fs.writeFileSync(__dirname+'/private-production-check.log',e.stack||String(e),{mode:0o600});console.error('Read-only production verification failed; diagnostics private');process.exit(1)});
