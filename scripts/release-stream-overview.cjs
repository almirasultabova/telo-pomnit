// J-APP-042, authorized additive deployment; no test sends or private-content output.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),{createHash,randomUUID}=require('node:crypto');
const stage='/root/telo-japp042-release',base='/var/www/telo-pomnit/backend';
const resume=process.argv.includes('--resume');
const checkpoint=stage+'/activation-checkpoint.json';
const backup=resume?JSON.parse(fs.readFileSync(checkpoint)).backup:'/root/telo-backups/overview-JAPP042-'+new Date().toISOString().replace(/[:.]/g,'');
assert(backup.startsWith('/root/telo-backups/overview-JAPP042-')&&!backup.includes('..'));
const manifest=JSON.parse(fs.readFileSync(stage+'/release-manifest.json'));
const env={};require(base+'/node_modules/dotenv').config({path:base+'/.env',processEnv:env,quiet:true});
const url=env.DIRECT_URL||env.DATABASE_URL,u=new URL(url),pg={...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGDATABASE:u.pathname.slice(1),PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password)};
if(u.searchParams.has('sslmode'))pg.PGSSLMODE=u.searchParams.get('sslmode');
const {PrismaClient}=require(base+'/node_modules/@prisma/client'),db=new PrismaClient({datasources:{db:{url}}});
const normalized=file=>createHash('sha256').update(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n')).digest('hex');
function run(cmd,args,childEnv=process.env){const r=spawnSync(cmd,args,{env:childEnv,encoding:'utf8',maxBuffer:16e6});if(r.status!==0){fs.writeFileSync(stage+'/release-private-error.log',r.stdout+'\n'+r.stderr,{mode:0o600});throw Error(cmd+' failed; private diagnostics retained')}return r.stdout;}
async function counts(){const out={};for(const t of ['users','streams','enrollments','diary_entries','questionnaires','feedback','payment_orders'])out[t]=Number((await db.$queryRawUnsafe('SELECT count(*) n FROM '+t))[0].n);return out;}
async function fingerprint(){return (await db.$queryRawUnsafe("SELECT md5(coalesce(string_agg(id||':'||role||':'||access_status||':'||token_version::text||':'||notifications_time||':'||notifications_enabled::text,',' ORDER BY id),'')) f FROM users"))[0].f;}
async function preflight(){
 const files=manifest.backend.map(f=>{assert(f.path.startsWith('backend/'));const target=path.resolve(base,f.path.slice(8));assert(target.startsWith(base+'/'));assert.equal(normalized(stage+'/'+f.path),f.after,'staged drift '+f.path);assert.equal(fs.existsSync(target)?normalized(target):null,f.before,'live drift '+f.path);return {...f,target};});
 const columns=await db.$queryRawUnsafe("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='feedback' AND column_name='needs_reply'");assert.equal(columns.length,resume?1:0,'migration state differs');
 const staff=await db.user.findUnique({where:{id:manifest.hostId}});assert.equal(String(staff?.telegramId),manifest.hostTelegramId);assert.equal(staff.role,'HOST');assert.equal(staff.accessStatus,'approved');assert.equal(staff.deletedAt,null);
 assert(await db.stream.findUnique({where:{id:manifest.streamId}}));
 const pm=JSON.parse(run('pm2',['jlist'])).find(p=>p.name==='telo-backend');assert.equal(pm?.pm2_env.status,'online');run('nginx',['-t']);
 return {files,counts:await counts(),fingerprint:await fingerprint()};
}
async function activate(){
 const check=await preflight();if(!resume){fs.mkdirSync(backup,{recursive:true,mode:0o700});fs.writeFileSync(checkpoint,JSON.stringify({backup}),{mode:0o600});
 run('tar',['-czf',backup+'/backend-before.tar.gz','-C',base,'src','prisma','package.json','package-lock.json']);
 run('tar',['-czf',backup+'/app-before.tar.gz','-C','/var/www/telo-app','.']);
 run('pg_dump',['--format=custom','--file='+backup+'/database-before.dump'],pg);run('pg_restore',['--list',backup+'/database-before.dump']);
 assert(fs.statSync(backup+'/database-before.dump').size>0);
 }
 let stopped=false,changed=false,frontendChanged=false;
 const monitorFiles=[base+'/scripts/health-check.sh',base+'/scripts/health-monitor.py'];
 const monitorBefore=monitorFiles.map(normalized),envBefore=normalized(base+'/.env');
 try{
  run('pm2',['stop','telo-backend']);stopped=true;
  const frozen=await counts(),prefs=await fingerprint();
  if(!resume){run('psql',['-v','ON_ERROR_STOP=1','--single-transaction','-f',stage+'/backend/prisma/migrations/20261015220000_stream_overview/migration.sql'],pg);
  await db.$executeRawUnsafe('INSERT INTO stream_overview_grants(user_id,stream_id) VALUES($1,$2)',manifest.hostId,manifest.streamId);}
  else {assert(fs.existsSync(backup+'/database-before.dump'));run('pg_restore',['--list',backup+'/database-before.dump']);assert.equal(Number((await db.$queryRawUnsafe('SELECT count(*) n FROM stream_overview_grants WHERE user_id=$1 AND stream_id=$2',manifest.hostId,manifest.streamId))[0].n),1,'grant missing');}
  // Track exact SQL when Prisma migration history exists; do not invent a new baseline.
  const hasLedger=(await db.$queryRawUnsafe("SELECT to_regclass('public._prisma_migrations')::text AS t"))[0].t;
  if(hasLedger){const sql=fs.readFileSync(stage+'/backend/prisma/migrations/20261015220000_stream_overview/migration.sql');await db.$executeRawUnsafe('INSERT INTO _prisma_migrations(id,checksum,finished_at,migration_name,started_at,applied_steps_count) VALUES($1,$2,now(),$3,now(),1)',randomUUID(),createHash('sha256').update(sql).digest('hex'),'20261015220000_stream_overview');}
  assert.deepEqual(await counts(),frozen,'existing record counts changed');assert.equal(await fingerprint(),prefs,'roles/preferences/token versions changed');
  for(const f of check.files){fs.mkdirSync(path.dirname(f.target),{recursive:true});const temp=f.target+'.japp042.tmp';fs.copyFileSync(stage+'/'+f.path,temp);fs.chmodSync(temp,0o644);fs.renameSync(temp,f.target);changed=true;}
  run('node',[base+'/node_modules/prisma/build/index.js','generate','--schema',base+'/prisma/schema.prisma'],{...process.env,...env,DIRECT_URL:env.DIRECT_URL||env.DATABASE_URL});
  run('pm2',['restart','telo-backend']);stopped=false;
  let healthy=false;for(let i=0;i<10;i++){try{const r=await fetch('http://127.0.0.1:3000/health',{signal:AbortSignal.timeout(2000)});if(r.ok){healthy=true;break}}catch{}await new Promise(r=>setTimeout(r,800));}assert(healthy,'health failed');
  for(const f of check.files)assert.equal(normalized(f.target),f.after);
  run('nginx',['-t']);
  // Only public build files. Preserve recovery tree and runtime-only monitoring scripts.
  for(const rel of manifest.frontend){assert(!rel.includes('..')&&!rel.startsWith('/'));for(const root of ['/var/www/telo-app','/var/www/telo-app/recovery/j293']){const target=path.join(root,rel);fs.mkdirSync(path.dirname(target),{recursive:true});const temp=target+'.japp042.tmp';fs.copyFileSync(stage+'/public-app/'+rel,temp);fs.chmodSync(temp,0o644);fs.renameSync(temp,target);frontendChanged=true;}}
  assert.deepEqual(monitorFiles.map(normalized),monitorBefore,'monitor changed');assert.equal(normalized(base+'/.env'),envBefore,'runtime settings changed');
  const result={release:'J-APP-042',backup,countsPreserved:true,rolesPreferencesPreserved:true,backendHashesMatch:true,health:true,frontendFiles:manifest.frontend.length,grant:'confirmed-host-october-only',testRealSends:0};fs.writeFileSync(backup+'/result.json',JSON.stringify(result,null,2));fs.writeFileSync(stage+'/activation-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }catch(error){
  if(frontendChanged)run('tar',['-xzf',backup+'/app-before.tar.gz','-C','/var/www/telo-app']);
  if(changed){run('tar',['-xzf',backup+'/backend-before.tar.gz','-C',base]);run('node',[base+'/node_modules/prisma/build/index.js','generate','--schema',base+'/prisma/schema.prisma'],{...process.env,...env,DIRECT_URL:env.DIRECT_URL||env.DATABASE_URL});}
  // Additive tables/columns retained on code rollback. No user rows are removed.
  if(stopped||changed)run('pm2',['restart','telo-backend']);throw error;
 }
}
(async()=>{if(process.argv.includes('--activate'))await activate();else{const c=await preflight();console.log(JSON.stringify({preflight:true,backendFiles:c.files.length,frontendFiles:manifest.frontend.length,counts:c.counts}));}})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.$disconnect());
