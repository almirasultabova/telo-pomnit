// Authorized release, private backup, exact source hashes. Never sends test messages or calls AI.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const stage=__dirname,base='/var/www/telo-pomnit/backend',roots=['/var/www/telo-app','/var/www/telo-app/recovery/j293'];
const m=JSON.parse(fs.readFileSync(stage+'/manifest.json'));
const hash=p=>createHash('sha256').update(/\.(html|js|css|cjs|json|sql|prisma|svg|txt)$/.test(p)?fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n'):fs.readFileSync(p)).digest('hex');
const rawhash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function run(cmd,args,env=process.env){const r=spawnSync(cmd,args,{env,encoding:'utf8',maxBuffer:32e6});if(r.status!==0){fs.writeFileSync(stage+'/private-release-error.log',r.stdout+'\n'+r.stderr,{mode:0o600});throw Error(cmd+' failed; private diagnostics saved')}return r.stdout}
const env={};require(base+'/node_modules/dotenv').config({path:base+'/.env',processEnv:env,quiet:true});
const url=env.DIRECT_URL||env.DATABASE_URL,u=new URL(url),pg={...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGDATABASE:u.pathname.slice(1),PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGOPTIONS:'-c lock_timeout=5000 -c statement_timeout=30000',...(u.searchParams.has('sslmode')?{PGSSLMODE:u.searchParams.get('sslmode')}:{})};
function proc(){return JSON.parse(run('pm2',['jlist'])).find(p=>p.name==='telo-backend')}
function install(src,dest){fs.mkdirSync(path.dirname(dest),{recursive:true});const temp=dest+'.japp091.tmp';fs.copyFileSync(src,temp);fs.chmodSync(temp,0o644);fs.renameSync(temp,dest)}
function backendTargets(){return m.backend.map(f=>({...f,target:base+'/'+f.path.slice(8)}))}
function assertBefore(){
 for(const root of roots)for(const[f,h]of Object.entries(m.publicBefore))assert.equal(hash(root+'/'+f),h,'public baseline drift '+f);
 for(const f of backendTargets())assert.equal(fs.existsSync(f.target)?hash(f.target):null,f.before,'backend baseline drift '+f.path);
 assert.equal(hash(base+'/src/routes/ai.js'),m.protectedAI,'Published AI changed');
 for(const f of backendTargets())assert.equal(hash(stage+'/'+f.path),f.after);
 for(const f of m.changed)assert.equal(hash(stage+'/public/'+f),m.publicAfter[f]);
 assert.equal(proc()?.pm2_env.status,'online');run('nginx',['-t']);
 const table=run('psql',['-At','-c',"SELECT to_regclass('public.after_meeting_notes') IS NULL"],pg).trim();assert.equal(table,'t','Unexpected existing notes table');
}
async function healthy(){for(let i=0;i<10;i++){try{const r=await fetch('http://127.0.0.1:3000/health',{signal:AbortSignal.timeout(2000)});if(r.ok&&(await r.json()).status==='ok')return true}catch{}await new Promise(r=>setTimeout(r,700))}return false}
async function main(){
 if(process.argv.includes('--check')){assertBefore();console.log(JSON.stringify({preflight:true,publicBefore:80,publicAfter:82,backendFiles:5,publishedAIUnchanged:true}));return}
 const receipt=stage+'/backup-receipt.json';let backup;
 if(!fs.existsSync(receipt)){
  assertBefore();backup='/root/telo-backups/after-meeting-JAPP091-'+new Date().toISOString().replace(/[:.]/g,'');fs.mkdirSync(backup,{mode:0o700});
  run('tar',['-czf',backup+'/backend-before.tar.gz','-C',base,'src','prisma','package.json','package-lock.json']);
  run('tar',['--exclude=./recovery','-czf',backup+'/app-before.tar.gz','-C',roots[0],'.']);
  run('tar',['-czf',backup+'/recovery-before.tar.gz','-C',roots[1],'.']);
  run('pg_dump',['--format=custom','--file='+backup+'/database-before.dump'],pg);run('pg_restore',['--list',backup+'/database-before.dump']);
  for(const f of ['backend-before.tar.gz','app-before.tar.gz','recovery-before.tar.gz'])run('tar',['-tzf',backup+'/'+f]);
  fs.writeFileSync(backup+'/before-manifest.json',JSON.stringify(m,null,2),{mode:0o600});
  for(const f of fs.readdirSync(backup))fs.chmodSync(backup+'/'+f,0o600);
  fs.writeFileSync(receipt,JSON.stringify({backup,verified:true}),{mode:0o600});
 }else backup=JSON.parse(fs.readFileSync(receipt)).backup;
 if(process.argv.includes('--backup-only')){console.log(JSON.stringify({backup,verified:true,productionUnchanged:true}));return}
 assert(process.argv.includes('--activate'));assert(!fs.existsSync(stage+'/activation-result.json'));assertBefore();
 const protectedFiles=[base+'/.env',base+'/src/routes/ai.js',base+'/scripts/health-monitor.py',base+'/scripts/health-check.sh'];
 const protectedBefore=protectedFiles.map(rawhash);let changed=false,stopped=false;
 try{
  run('pm2',['stop','telo-backend']);stopped=true;
  run('psql',['-v','ON_ERROR_STOP=1','-f',stage+'/backend/prisma/migrations/20261018163000_after_meeting_notes/migration.sql'],pg);
  assert.equal(run('psql',['-At','-c','SELECT count(*) FROM after_meeting_notes'],pg).trim(),'0');
  changed=true;for(const f of backendTargets())install(stage+'/'+f.path,f.target);
  run('node',[base+'/node_modules/prisma/build/index.js','generate','--schema',base+'/prisma/schema.prisma'],{...process.env,...env,DIRECT_URL:env.DIRECT_URL||env.DATABASE_URL});
  run('pm2',['restart','telo-backend']);stopped=false;assert(await healthy(),'Backend not ready');
  const denied=await fetch('http://127.0.0.1:3000/after-meeting-notes',{signal:AbortSignal.timeout(5000)});assert.equal(denied.status,401);
  for(const f of backendTargets())assert.equal(hash(f.target),f.after);
  const ordered=m.changed.slice().sort((a,b)=>Number(a.endsWith('.html'))-Number(b.endsWith('.html')));
  for(const root of roots)for(const f of ordered)install(stage+'/public/'+f,root+'/'+f);
  for(const root of roots)for(const[f,h]of Object.entries(m.publicAfter))assert.equal(hash(root+'/'+f),h);
  assert.deepEqual(protectedFiles.map(rawhash),protectedBefore);assert.equal(proc()?.pm2_env.status,'online');run('nginx',['-t']);
  const result={activated:true,backup,publicFiles:82,backendFiles:5,additiveTable:true,health:true,unauthorizedStatus:denied.status,publishedAIUnchanged:true,protectedFilesUnchanged:protectedFiles.length,notifications:0,openai:0,testWritesToProduction:0};
  fs.writeFileSync(stage+'/activation-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }catch(e){
  if(changed){
   run('tar',['-xzf',backup+'/backend-before.tar.gz','-C',base]);
   run('node',[base+'/node_modules/prisma/build/index.js','generate','--schema',base+'/prisma/schema.prisma'],{...process.env,...env,DIRECT_URL:env.DIRECT_URL||env.DATABASE_URL});
   for(const[root,archive]of [[roots[0],'app-before.tar.gz'],[roots[1],'recovery-before.tar.gz']])run('tar',['-xzf',backup+'/'+archive,'-C',root]);
   // Keep the additive table on rollback: never delete any note that may have been saved.
  }
  if(stopped||changed){run('pm2',['restart','telo-backend']);assert(await healthy(),'Rollback health failed')}
  throw e;
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
