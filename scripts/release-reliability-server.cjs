// Authorized J-APP-002 release helper. Runs on the existing VPS only.
// Backup stays private on that server. No messages, participant writes or secrets in output.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const base='/var/www/telo-pomnit/backend',backup='/root/telo-backups/reliability-JAPP002-20261013';
const local=p=>require(path.join(base,p));
local('node_modules/dotenv').config({path:path.join(base,'.env'),quiet:true});
const {PrismaClient}=local('node_modules/@prisma/client');
const db=new PrismaClient();
const sql=fs.readFileSync('/root/reliability-release/backend/prisma/migrations/20261013120000_reliable_reactions_feedback/migration.sql','utf8');
function run(cmd,args,env=process.env){const r=spawnSync(cmd,args,{env,encoding:'utf8'});if(r.status!==0)throw new Error(cmd+' failed; private server diagnostics required');return r;}
async function counts(){return {triggers:await db.triggerEntry.count(),feedback:await db.feedback.count(),questionnaires:await db.questionnaire.count()};}
(async()=>{
 if(process.argv.includes('--activate')) {
  for(const relative of ['prisma/schema.prisma','src/questionnaire-pre-schema.json','src/routes/triggers.js','src/routes/feedback.js','src/routes/questionnaires.js']) {
   const target=path.join(base,relative);fs.mkdirSync(path.dirname(target),{recursive:true});
   fs.copyFileSync(path.join('/root/reliability-release/backend',relative),target);
  }
  const folder=path.join(base,'prisma/migrations/20261013120000_reliable_reactions_feedback');fs.mkdirSync(folder,{recursive:true});
  fs.copyFileSync('/root/reliability-release/backend/prisma/migrations/20261013120000_reliable_reactions_feedback/migration.sql',folder+'/migration.sql');
  const env={...process.env,DIRECT_URL:process.env.DIRECT_URL||process.env.DATABASE_URL};
  const generated=run('node',[base+'/node_modules/prisma/build/index.js','generate','--schema',base+'/prisma/schema.prisma'],env);
  console.log(generated.stdout);
  run('pm2',['restart','telo-backend']);
  const migration=JSON.parse(fs.readFileSync(backup+'/migration-result.json','utf8'));
  const result={...migration,activated:true};fs.writeFileSync(backup+'/activation-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));return;
 }
 const owners=(process.env.ADMIN_TELEGRAM_IDS||'').split(',').map(s=>s.trim()).filter(Boolean);
 if(owners.length!==1)throw new Error('Owner-only configuration must contain exactly one owner before release');
 fs.mkdirSync(backup,{recursive:true,mode:0o700});
 run('tar',['-czf',backup+'/backend-code-before.tar.gz','-C',base,'src','prisma','package.json','package-lock.json']);
 fs.copyFileSync(base+'/.env',backup+'/backend-env-before');fs.chmodSync(backup+'/backend-env-before',0o600);
 const url=new URL(process.env.DIRECT_URL||process.env.DATABASE_URL),env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:url.pathname.slice(1)};
 if(url.searchParams.get('sslmode'))env.PGSSLMODE=url.searchParams.get('sslmode');
 run('pg_dump',['--format=custom','--file='+backup+'/database-before.dump'],env);
 if(fs.statSync(backup+'/database-before.dump').size===0)throw new Error('Empty backup');
 const before=await counts();
 const present=await db.$queryRawUnsafe("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND ((table_name='trigger_entries' AND column_name='client_id') OR (table_name='feedback' AND column_name='operation_id') OR (table_name='questionnaires' AND column_name='form_version'))");
 if(present.length)throw new Error('Unexpected prior/partial migration; inspect before changing schema');
 await db.$transaction(async tx=>{await tx.$executeRawUnsafe("SET LOCAL lock_timeout='5s'");await tx.$executeRawUnsafe("SET LOCAL statement_timeout='30s'");for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await tx.$executeRawUnsafe(statement);},{timeout:45000});
 const after=await counts();
 // Other people may write during release; never assert equality by deleting their data.
 const result={backup,before,after,ownerCount:owners.length,migration:'20261013120000_reliable_reactions_feedback',applied:true};
 fs.writeFileSync(backup+'/migration-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(e=>{console.error('Release stopped: '+e.message);process.exitCode=1}).finally(()=>db.$disconnect());
