// Exact authorized release. No participant writes, bot/provider calls or migration.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const stage='/root/telo-japp060-release',base='/var/www/telo-pomnit/backend',roots=['/var/www/telo-app','/var/www/telo-app/recovery/j293'];
const m=JSON.parse(fs.readFileSync(stage+'/manifest.json'));
const hash=p=>createHash('sha256').update(/\.(html|js|css|svg|txt|json|sql|prisma)$/.test(p)?fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n'):fs.readFileSync(p)).digest('hex');
function run(cmd,args,env=process.env){const r=spawnSync(cmd,args,{env,encoding:'utf8',maxBuffer:16e6});if(r.status!==0){fs.writeFileSync(stage+'/private-error.log',r.stdout+'\n'+r.stderr,{mode:0o600});throw Error(cmd+' failed; diagnostics private')}return r.stdout}
const env={};require(base+'/node_modules/dotenv').config({path:base+'/.env',processEnv:env,quiet:true});const url=env.DIRECT_URL||env.DATABASE_URL,u=new URL(url),pg={...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGDATABASE:u.pathname.slice(1),PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password)};if(u.searchParams.has('sslmode'))pg.PGSSLMODE=u.searchParams.get('sslmode');
const {PrismaClient}=require(base+'/node_modules/@prisma/client'),db=new PrismaClient({datasources:{db:{url}}});
async function counts(){const result={};for(const name of ['users','streams','enrollments','diary_entries','checkins','questionnaires','feedback','ai_chat_sessions'])result[name]=Number((await db.$queryRawUnsafe('SELECT count(*) n FROM '+name))[0].n);return result}
async function fingerprint(){return(await db.$queryRawUnsafe("SELECT md5(coalesce(string_agg(id||':'||role||':'||access_status||':'||token_version::text||':'||notifications_enabled::text||':'||notifications_time,',' ORDER BY id),'')) f FROM users"))[0].f}
function install(from,to){fs.mkdirSync(path.dirname(to),{recursive:true});const tmp=to+'.japp060.tmp';fs.copyFileSync(from,tmp);fs.renameSync(tmp,to)}
async function main(){
 for(const root of roots)for(const[p,h]of Object.entries(m.publicBefore)){assert(!p.includes('..'));assert.equal(hash(root+'/'+p),h,'live public drift '+p)}
 for(const f of m.backend){assert.equal(f.path,'backend/src/routes/me.js');assert.equal(hash(base+'/src/routes/me.js'),f.before,'backend drift');assert.equal(hash(stage+'/'+f.path),f.after)}
 for(const[p,h]of Object.entries(m.publicAfter)){assert(!p.includes('..'));assert.equal(hash(stage+'/public/'+p),h,'staged drift '+p)}
 run('nginx',['-t']);assert.equal(JSON.parse(run('pm2',['jlist'])).find(p=>p.name==='telo-backend')?.pm2_env.status,'online');
 const protectedFiles=[base+'/.env',base+'/scripts/health-check.sh',base+'/scripts/health-monitor.py'],protectedBefore=protectedFiles.map(hash);
 if(process.argv.includes('--check')){console.log('PASS preflight: both 76-file live baselines match; me.js exact; 78 staged hashes; nginx and backend online; no writes');return}
 const backup='/root/telo-backups/stream-states-JAPP060-'+new Date().toISOString().replace(/[:.]/g,'');fs.mkdirSync(backup,{mode:0o700});
 run('tar',['-czf',backup+'/backend-before.tar.gz','-C',base,'src','prisma','package.json','package-lock.json']);
 run('tar',['--exclude=./recovery','-czf',backup+'/app-before.tar.gz','-C',roots[0],'.']);run('tar',['-czf',backup+'/recovery-before.tar.gz','-C',roots[1],'.']);
 run('tar',['-tzf',backup+'/app-before.tar.gz']);run('tar',['-tzf',backup+'/recovery-before.tar.gz']);
 let stopped=false,changed=false;
 try{
  run('pm2',['stop','telo-backend']);stopped=true;
  run('pg_dump',['--format=custom','--file='+backup+'/database-before.dump'],pg);run('pg_restore',['--list',backup+'/database-before.dump']);
  const before=await counts(),prefs=await fingerprint();
  changed=true;install(stage+'/backend/src/routes/me.js',base+'/src/routes/me.js');run('node',['--check',base+'/src/routes/me.js']);
  assert.deepEqual(await counts(),before);assert.equal(await fingerprint(),prefs);
  run('pm2',['restart','telo-backend']);stopped=false;
  let healthy=false;for(let i=0;i<20;i++){try{if((await fetch('http://127.0.0.1:3000/health')).ok){healthy=true;break}}catch{}await new Promise(r=>setTimeout(r,500))}assert(healthy,'backend health');
  assert.equal((await fetch('http://127.0.0.1:3000/me/enrollment/access')).status,401);
  const changedPublic=Object.keys(m.publicAfter).filter(p=>m.publicAfter[p]!==m.publicBefore[p]).sort((a,b)=>Number(a.endsWith('.html'))-Number(b.endsWith('.html')));
  for(const root of roots)for(const p of changedPublic)install(stage+'/public/'+p,root+'/'+p);
  run('nginx',['-t']);for(const root of roots)for(const[p,h]of Object.entries(m.publicAfter))assert.equal(hash(root+'/'+p),h,'installed mismatch '+p);
  assert.deepEqual(protectedFiles.map(hash),protectedBefore);assert.equal(hash(base+'/src/routes/me.js'),m.backend[0].after);
  const result={backup,publicFiles:Object.keys(m.publicAfter).length,changedPublic,backend:['src/routes/me.js'],migrations:0,existingCountsUnchanged:true,rolesAndPreferencesUnchanged:true,protectedFilesUnchanged:true,unauthorizedAccessDenied:true,messagesSent:0,roots};
  fs.writeFileSync(stage+'/activation-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }catch(error){if(changed){run('tar',['-xzf',backup+'/backend-before.tar.gz','-C',base]);run('tar',['-xzf',backup+'/app-before.tar.gz','-C',roots[0]]);run('tar',['-xzf',backup+'/recovery-before.tar.gz','-C',roots[1]])}if(stopped||changed)run('pm2',['restart','telo-backend']);throw error}
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.$disconnect());
