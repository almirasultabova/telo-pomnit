const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const stage=__dirname,base='/var/www/telo-pomnit/backend',roots=['/var/www/telo-app','/var/www/telo-app/recovery/j293'],test='/root/meeting-panel-JAPP143';
const m=JSON.parse(fs.readFileSync(stage+'/manifest.json')),migration='20261019193000_meeting_recordings';
const hash=p=>createHash('sha256').update(/\.(html|js|css|cjs|json|sql|prisma|svg|txt)$/.test(p)?fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n'):fs.readFileSync(p)).digest('hex');
function run(cmd,args,env=process.env){const r=spawnSync(cmd,args,{env,encoding:'utf8',maxBuffer:32e6});if(r.status!==0){fs.writeFileSync(stage+'/private-release-error.log',r.stdout+'\n'+r.stderr,{mode:0o600});throw Error(cmd+' failed; private diagnostics saved')}return r.stdout}
const env={};require(base+'/node_modules/dotenv').config({path:base+'/.env',processEnv:env,quiet:true});const url=env.DIRECT_URL||env.DATABASE_URL,u=new URL(url);
const pg={...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGDATABASE:u.pathname.slice(1),PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGOPTIONS:'-c lock_timeout=5000 -c statement_timeout=30000',...(u.searchParams.has('sslmode')?{PGSSLMODE:u.searchParams.get('sslmode')}:{})};
const prismaEnv={...process.env,DATABASE_URL:env.DATABASE_URL,DIRECT_URL:url};
const query=sql=>JSON.parse(run('psql',['-At','-v','ON_ERROR_STOP=1','-c',sql],pg));
const journal=()=>query("SELECT COALESCE(json_agg(row_to_json(t) ORDER BY id),'[]') FROM (SELECT id,checksum,migration_name,finished_at FROM _prisma_migrations) t");
const targets=()=>m.backend.map(f=>({...f,target:base+'/'+f.path.slice(8)}));
function proc(){return JSON.parse(run('pm2',['jlist'])).find(p=>p.name==='telo-backend')}
function before(){
 assert.equal(m.changed.length,6);assert.equal(Object.keys(m.publicBefore).length,92);
 for(const root of roots)for(const[f,h]of Object.entries(m.publicBefore))assert.equal(hash(root+'/'+f),h,'Public drift '+f);
 for(const f of targets())assert.equal(fs.existsSync(f.target)?hash(f.target):null,f.before,'Backend drift '+f.path);
 for(const f of targets())assert.equal(hash(stage+'/'+f.path),f.after);
 for(const f of m.changed)assert.equal(hash(stage+'/public/'+f),m.publicAfter[f]);
 assert.equal(hash(base+'/src/routes/ai.js'),m.protectedAI);for(const[f,h]of Object.entries(m.cashBackend))assert.equal(hash('/var/www/telo-pomnit/'+f),h);
 assert.equal(proc()?.pm2_env.status,'online');run('nginx',['-t']);
}
function install(src,dest){fs.mkdirSync(path.dirname(dest),{recursive:true});const temp=dest+'.japp144.tmp';fs.copyFileSync(src,temp);fs.chmodSync(temp,0o644);fs.renameSync(temp,dest)}
async function healthy(){for(let i=0;i<10;i++){try{const r=await fetch('http://127.0.0.1:3000/health',{signal:AbortSignal.timeout(2000)});if(r.ok&&(await r.json()).status==='ok')return true}catch{}await new Promise(r=>setTimeout(r,700))}return false}
(async()=>{
 before();if(process.argv.includes('--check')){console.log(JSON.stringify({preflight:true,publicBefore:92,publicAfter:94,backendFiles:3,migrationJournalRows:journal().length}));return}
 const receipt=stage+'/backup-receipt.json';let backup;
 if(!fs.existsSync(receipt)){
  backup='/root/telo-backups/meeting-JAPP144-'+new Date().toISOString().replace(/[:.]/g,'');fs.mkdirSync(backup,{mode:0o700});
  run('tar',['-czf',backup+'/backend-before.tar.gz','-C',base,'src','prisma','package.json','package-lock.json']);
  run('tar',['--exclude=./recovery','-czf',backup+'/app-before.tar.gz','-C',roots[0],'.']);run('tar',['-czf',backup+'/recovery-before.tar.gz','-C',roots[1],'.']);
  run('pg_dump',['--format=custom','--file='+backup+'/database-before.dump'],pg);run('pg_restore',['--list',backup+'/database-before.dump']);
  for(const f of ['backend-before.tar.gz','app-before.tar.gz','recovery-before.tar.gz'])run('tar',['-tzf',backup+'/'+f]);
  fs.writeFileSync(backup+'/before-manifest.json',JSON.stringify(m,null,2),{mode:0o600});for(const f of fs.readdirSync(backup))fs.chmodSync(backup+'/'+f,0o600);
  fs.writeFileSync(receipt,JSON.stringify({backup,verified:true}),{mode:0o600});
 }else backup=JSON.parse(fs.readFileSync(receipt)).backup;
 if(process.argv.includes('--backup-only')){console.log(JSON.stringify({backup,verified:true,productionUnchanged:true}));return}
 assert(process.argv.includes('--activate'));assert(!fs.existsSync(stage+'/activation-result.json'));before();
 const protectedPaths=[base+'/.env',base+'/src/routes/ai.js',base+'/scripts/health-monitor.py',base+'/scripts/health-check.sh'];const protectedBefore=protectedPaths.map(hash);const oldJournal=journal();let changed=false,stopped=false;
 try{
  run('pm2',['stop','telo-backend']);stopped=true;
  const columns=query("SELECT count(*)::int FROM information_schema.columns WHERE table_name='meetings' AND column_name IN ('recording_url','recording_passcode')");
  if(columns===0){run('psql',['-1','-v','ON_ERROR_STOP=1','-f',stage+'/backend/prisma/migrations/'+migration+'/migration.sql'],pg);run('node',[base+'/node_modules/prisma/build/index.js','migrate','resolve','--schema',stage+'/backend/prisma/schema.prisma','--applied',migration],prismaEnv)}else{assert.equal(columns,2);assert(oldJournal.some(x=>x.migration_name===migration))}
  const newJournal=journal();assert.equal(newJournal.length,oldJournal.length+(columns===0?1:0));for(const row of oldJournal)assert.deepEqual(newJournal.find(x=>x.id===row.id),row);
  changed=true;for(const f of targets())install(stage+'/'+f.path,f.target);
  run('node',[base+'/node_modules/prisma/build/index.js','generate','--schema',base+'/prisma/schema.prisma'],prismaEnv);
  run('pm2',['restart','telo-backend']);stopped=false;assert(await healthy());
  run('node',[test+'/test-native.cjs','--installed']);
  const denied=await fetch('http://127.0.0.1:3000/me/enrollment/access',{signal:AbortSignal.timeout(5000)});assert.equal(denied.status,401);
  for(const root of roots)for(const f of m.changed.slice().sort((a,b)=>Number(a.endsWith('.html'))-Number(b.endsWith('.html'))))install(stage+'/public/'+f,root+'/'+f);
  for(const root of roots)for(const[f,h]of Object.entries(m.publicAfter))assert.equal(hash(root+'/'+f),h);
  for(const f of targets())assert.equal(hash(f.target),f.after);for(const[f,h]of Object.entries(m.cashBackend))assert.equal(hash('/var/www/telo-pomnit/'+f),h);
  assert.deepEqual(protectedPaths.map(hash),protectedBefore);assert.equal(proc()?.pm2_env.status,'online');run('nginx',['-t']);
  const result={activated:true,backup,publicFiles:94,backendFiles:3,additiveMigration:migration,journalBefore:oldJournal.length,journalAfter:newJournal.length,oldJournalPreserved:true,health:true,unauthorizedStatus:401,protectedFilesUnchanged:protectedPaths.length,notifications:0,openai:0,testWritesToProduction:0};fs.writeFileSync(stage+'/activation-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }catch(e){
  if(changed){run('tar',['-xzf',backup+'/backend-before.tar.gz','-C',base]);for(const[root,archive]of[[roots[0],'app-before.tar.gz'],[roots[1],'recovery-before.tar.gz']]){run('tar',['-xzf',backup+'/'+archive,'-C',root]);for(const f of m.added)if(fs.existsSync(root+'/'+f))fs.unlinkSync(root+'/'+f)}run('node',[base+'/node_modules/prisma/build/index.js','generate','--schema',base+'/prisma/schema.prisma'],prismaEnv)}
  if(stopped||changed){run('pm2',['restart','telo-backend']);assert(await healthy(),'Rollback health failed')}
  // Nullable columns and migration journal remain additive; no destructive DB rollback.
  throw e;
 }
})().catch(e=>{console.error(e.message);process.exitCode=1});
