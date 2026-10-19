// Read-only catalogs and hashes only; never reads participant rows.
const fs=require('node:fs'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const live='/var/www/telo-pomnit/backend',env={};require(live+'/node_modules/dotenv').config({path:live+'/.env',processEnv:env,quiet:true});
const {PrismaClient}=require(live+'/node_modules/@prisma/client');const db=new PrismaClient({datasources:{db:{url:env.DIRECT_URL||env.DATABASE_URL}}});
(async()=>{try{
 const m=JSON.parse(fs.readFileSync(__dirname+'/manifest.json'));const hash=p=>createHash('sha256').update(fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n')).digest('hex');
 assert.equal(hash(live+'/src/routes/diary.js'),m.backend[0].after);
 const found=await db.$queryRaw`SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'diary_entries_user_created_id_idx'`;assert.equal(found[0].n,0);
 const result={passed:true,publishedJ121HashMatches:true,nextIndexNotInstalled:true,participantRowsRead:0,productionTestWrites:0};fs.writeFileSync(__dirname+'/production-check.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await db.$disconnect()}})().catch(e=>{fs.writeFileSync(__dirname+'/private-production-check.log',e.stack||String(e),{mode:0o600});console.error('Production read-only verification failed; diagnostics private');process.exit(1)});
