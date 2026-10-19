// Read-only metadata only; no participant rows.
const fs=require('node:fs'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const live='/var/www/telo-pomnit/backend',env={};require(live+'/node_modules/dotenv').config({path:live+'/.env',processEnv:env,quiet:true});
const {PrismaClient}=require(live+'/node_modules/@prisma/client'),db=new PrismaClient({datasources:{db:{url:env.DIRECT_URL||env.DATABASE_URL}}});const hash=p=>createHash('sha256').update(fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n')).digest('hex');
(async()=>{try{
 const m=JSON.parse(fs.readFileSync(__dirname+'/manifest.json'));for(const f of m.backend)assert.equal(hash('/var/www/telo-pomnit/'+f.path),f.after);
 const index=(await db.$queryRaw`SELECT indisvalid,indisready,pg_get_indexdef(indexrelid) AS definition FROM pg_index JOIN pg_class ON indexrelid=pg_class.oid WHERE relname='diary_entries_user_created_id_idx'`)[0];assert(index?.indisvalid&&index.indisready);assert(index.definition.includes('(user_id, created_at DESC, id DESC)'));
 const ledger=await db.$queryRaw`SELECT checksum,finished_at,rolled_back_at FROM _prisma_migrations WHERE migration_name='20261019170000_diary_owner_date_index'`;assert.equal(ledger.length,1);assert(ledger[0].finished_at&&!ledger[0].rolled_back_at);assert.equal(ledger[0].checksum,m.backend.find(f=>f.path.endsWith('migration.sql')).after);
 assert.equal((await db.$queryRaw`SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname='public' AND indexname='checkins_user_created_id_idx'`)[0].n,0);
 const result={passed:true,diaryIndexValidAndReady:true,diaryMigrationRecorded:true,publishedSchemaAndMigrationHashesMatch:true,nextCheckinIndexNotInstalled:true,participantRowsRead:0,productionTestWrites:0};fs.writeFileSync(__dirname+'/production-check.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await db.$disconnect()}})().catch(e=>{fs.writeFileSync(__dirname+'/private-production-check.log',e.stack||String(e),{mode:0o600});console.error('Metadata verification failed; diagnostics private');process.exit(1)});
