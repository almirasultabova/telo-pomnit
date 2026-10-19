// Approved single-index release. No participant DML, runtime restart or static replacement.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const stage=__dirname,live='/var/www/telo-pomnit/backend',roots=['/var/www/telo-app','/var/www/telo-app/recovery/j293'],m=JSON.parse(fs.readFileSync(stage+'/manifest.json'));
const name='20261019173000_checkin_owner_date_index',index='checkins_user_created_id_idx',env={};require(live+'/node_modules/dotenv').config({path:live+'/.env',processEnv:env,quiet:true});
const url=env.DIRECT_URL||env.DATABASE_URL,u=new URL(url);const pg={...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGDATABASE:u.pathname.slice(1),PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGOPTIONS:'-c lock_timeout=5000 -c statement_timeout=120000',...(u.searchParams.has('sslmode')?{PGSSLMODE:u.searchParams.get('sslmode')}:{})};
const {PrismaClient}=require(live+'/node_modules/@prisma/client'),db=new PrismaClient({datasources:{db:{url}}});
const hash=p=>createHash('sha256').update(/\.(html|js|css|json|sql|prisma|svg|txt)$/.test(p)?fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n'):fs.readFileSync(p)).digest('hex');
function run(cmd,args,e=process.env){const r=spawnSync(cmd,args,{env:e,encoding:'utf8',maxBuffer:32e6});if(r.status!==0){fs.writeFileSync(stage+'/private-activation-error.log',r.stdout+'\n'+r.stderr,{mode:0o600});throw Error(cmd+' failed; diagnostics private')}return r.stdout}
const proc=()=>JSON.parse(run('pm2',['jlist'])).find(p=>p.name==='telo-backend');
const ledger=()=>db.$queryRaw`SELECT id,migration_name,checksum,started_at,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY id`;
async function assertBefore(){
 assert.equal(m.changed.length,0);assert.equal(m.backend.length,2);
 for(const root of roots)for(const[f,h]of Object.entries(m.publicBefore))assert.equal(hash(root+'/'+f),h);
 for(const f of m.backend){const dest='/var/www/telo-pomnit/'+f.path;assert.equal(fs.existsSync(dest)?hash(dest):null,f.before,'source baseline '+f.path);assert.equal(hash(stage+'/'+f.path),f.after)}
 for(const[f,h]of Object.entries(m.cashBackend))assert.equal(hash('/var/www/telo-pomnit/'+f),h);
 assert.equal(hash(live+'/src/routes/diary.js'),m.sourceAfter['backend/src/routes/diary.js']);assert.equal(hash(live+'/src/routes/ai.js'),m.protectedAI);
 assert.equal((await db.$queryRaw`SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname='public' AND indexname=${index}`)[0].n,0);
 const rows=await ledger();assert(rows.every(r=>r.finished_at&&!r.rolled_back_at));assert(!rows.some(r=>r.migration_name===name));
 const expected=JSON.parse(fs.readFileSync(stage+'/inspection.json')).migrationRows;assert.deepEqual(rows.map(r=>({name:r.migration_name,checksum:r.checksum})).sort((a,b)=>a.name.localeCompare(b.name)),expected.map(r=>({name:r.name,checksum:r.checksum})).sort((a,b)=>a.name.localeCompare(b.name)));
 const d=run('df',['-Pk','/var/lib/postgresql']).trim().split('\n').at(-1).trim().split(/\s+/);assert(Number(d[3])>1024*1024,'Less than1GiB free');assert.equal(proc()?.pm2_env.status,'online');run('nginx',['-t']);
}
function install(from,to){fs.mkdirSync(path.dirname(to),{recursive:true});const tmp=to+'.japp126.tmp';fs.copyFileSync(from,tmp);fs.chmodSync(tmp,0o644);fs.renameSync(tmp,to)}
(async()=>{try{
 await assertBefore();if(process.argv.includes('--check')){console.log('PASS hashes, disk>1GiB, index absent, healthy migration ledger; production unchanged');return}
 const receipt=stage+'/backup-receipt.json';let backup;
 if(fs.existsSync(receipt))backup=JSON.parse(fs.readFileSync(receipt)).backup;else{
  backup='/root/telo-backups/checkin-index-JAPP126-'+new Date().toISOString().replace(/[:.]/g,'');fs.mkdirSync(backup,{mode:0o700});
  run('tar',['-czf',backup+'/backend-before.tar.gz','-C',live,'src','prisma','package.json','package-lock.json']);
  run('tar',['--exclude=./recovery','-czf',backup+'/app-before.tar.gz','-C',roots[0],'.']);run('tar',['-czf',backup+'/recovery-before.tar.gz','-C',roots[1],'.']);
  run('pg_dump',['--format=custom','--file='+backup+'/database-before.dump'],pg);run('pg_restore',['--list',backup+'/database-before.dump']);
  for(const f of ['backend-before.tar.gz','app-before.tar.gz','recovery-before.tar.gz'])run('tar',['-tzf',backup+'/'+f]);for(const f of fs.readdirSync(backup))fs.chmodSync(backup+'/'+f,0o600);
  fs.writeFileSync(receipt,JSON.stringify({backup,verified:true}),{mode:0o600});
 }
 if(process.argv.includes('--backup-only')){console.log(JSON.stringify({backup,verified:true,productionUnchanged:true}));return}
 assert(process.argv.includes('--activate'));await assertBefore();const beforeLedger=await ledger(),beforeProc=proc();
 const protectedFiles=[live+'/.env',live+'/src/routes/ai.js',live+'/src/routes/diary.js',live+'/src/routes/checkins.js',live+'/scripts/health-check.sh',live+'/scripts/health-monitor.py',...Object.keys(m.cashBackend).map(f=>'/var/www/telo-pomnit/'+f)];const protectedHashes=protectedFiles.map(hash);
 const sql=m.backend.find(f=>f.path.endsWith('/migration.sql'));run('psql',['-v','ON_ERROR_STOP=1','-f',stage+'/'+sql.path],pg);
 const state=(await db.$queryRaw`SELECT indisvalid,indisready,pg_get_indexdef(indexrelid) AS definition FROM pg_index JOIN pg_class ON indexrelid=pg_class.oid WHERE relname=${index}`)[0];assert(state?.indisvalid&&state.indisready);assert(state.definition.includes('(user_id, created_at DESC, id DESC)'));
 run('node',[live+'/node_modules/prisma/build/index.js','migrate','resolve','--applied',name,'--schema',stage+'/backend/prisma/schema.prisma'],{...process.env,DATABASE_URL:url,DIRECT_URL:url});
 const rows=await ledger(),added=rows.filter(r=>r.migration_name===name);assert.equal(added.length,1);assert(added[0].finished_at&&!added[0].rolled_back_at);assert.equal(added[0].checksum,sql.after);assert.deepEqual(rows.filter(r=>r.migration_name!==name),beforeLedger);
 for(const f of m.backend)install(stage+'/'+f.path,'/var/www/telo-pomnit/'+f.path);
 run('node',[stage+'/test-native.cjs','--installed']);
 for(const f of m.backend)assert.equal(hash('/var/www/telo-pomnit/'+f.path),f.after);assert.deepEqual(protectedFiles.map(hash),protectedHashes);assert.equal(proc()?.pid,beforeProc.pid);assert.equal(proc()?.pm2_env.status,'online');
 for(const root of roots)for(const[f,h]of Object.entries(m.publicAfter))assert.equal(hash(root+'/'+f),h);run('nginx',['-t']);
 assert.equal((await fetch('http://127.0.0.1:3000/health',{signal:AbortSignal.timeout(5000)})).status,200);assert.equal((await fetch('http://127.0.0.1:3000/diary/days',{signal:AbortSignal.timeout(5000)})).status,401);
 const result={activated:true,backup,concurrentIndexValid:true,migrationRecorded:true,legacyLedgerRowsPreserved:beforeLedger.length,publicFiles:88,changedPublic:0,backendFiles:2,backendRestarted:false,health:true,unauthorizedStatus:401,protectedFilesUnchanged:true,participantDML:0,testWritesToProduction:0,openai:0,notifications:0};fs.writeFileSync(stage+'/activation-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await db.$disconnect()}})().catch(e=>{fs.writeFileSync(stage+'/private-failure.log',e.stack||String(e),{mode:0o600});console.error('Index release interrupted; inspect private checkpoints before any retry. '+e.message);process.exit(1)});
