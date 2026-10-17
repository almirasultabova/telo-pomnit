// Approved static-only release; no DB access, backend restart or outbound notification.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const stage='/root/telo-japp063-release',roots=['/var/www/telo-app','/var/www/telo-app/recovery/j293'];
const m=JSON.parse(fs.readFileSync(stage+'/manifest.json'));
const hash=p=>createHash('sha256').update(/\.(html|js|css|svg|txt|json)$/.test(p)?fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n'):fs.readFileSync(p)).digest('hex');
function run(cmd,args){const r=spawnSync(cmd,args,{encoding:'utf8',maxBuffer:16e6});if(r.status!==0){fs.writeFileSync(stage+'/private-error.log',r.stdout+'\n'+r.stderr,{mode:0o600});throw Error(cmd+' failed; diagnostics private')}return r.stdout}
function install(from,to){fs.mkdirSync(path.dirname(to),{recursive:true});const tmp=to+'.japp063.tmp';fs.copyFileSync(from,tmp);fs.renameSync(tmp,to)}
function main(){
 assert.equal(m.backend.length,0);assert.equal(Object.keys(m.publicBefore).length,78);assert.equal(Object.keys(m.publicAfter).length,80);
 for(const root of roots)for(const[p,h]of Object.entries(m.publicBefore)){assert(!p.includes('..'));assert.equal(hash(root+'/'+p),h,'baseline drift '+p)}
 for(const p of m.changed){assert(!p.includes('..'));assert.equal(hash(stage+'/public/'+p),m.publicAfter[p],'staged hash '+p)}
 run('nginx',['-t']);
 const proc=()=>JSON.parse(run('pm2',['jlist'])).find(p=>p.name==='telo-backend');
 const beforeProcess=proc();assert.equal(beforeProcess?.pm2_env.status,'online');
 const protectedFiles=['/var/www/telo-pomnit/backend/.env','/var/www/telo-pomnit/backend/scripts/health-check.sh','/var/www/telo-pomnit/backend/scripts/health-monitor.py'];
 const protectedBefore=protectedFiles.map(hash);
 if(process.argv.includes('--check')){console.log('PASS exact 78-file baselines, five staged files, nginx, backend online; no writes');return}
 const backup='/root/telo-backups/map-JAPP063-'+new Date().toISOString().replace(/[:.]/g,'');fs.mkdirSync(backup,{mode:0o700});
 run('tar',['--exclude=./recovery','-czf',backup+'/app-before.tar.gz','-C',roots[0],'.']);
 run('tar',['-czf',backup+'/recovery-before.tar.gz','-C',roots[1],'.']);
 run('tar',['-tzf',backup+'/app-before.tar.gz']);run('tar',['-tzf',backup+'/recovery-before.tar.gz']);
 fs.writeFileSync(backup+'/before-manifest.json',JSON.stringify(m.publicBefore,null,2),{mode:0o600});
 let changed=false;
 try{
  // New versioned media, then source JS, then complete HTML pages.
  const ordered=[...m.changed].sort((a,b)=>Number(a.endsWith('.html'))-Number(b.endsWith('.html')));
  changed=true;for(const root of roots)for(const p of ordered)install(stage+'/public/'+p,root+'/'+p);
  run('nginx',['-t']);for(const root of roots)for(const[p,h]of Object.entries(m.publicAfter))assert.equal(hash(root+'/'+p),h,'installed mismatch '+p);
  assert.deepEqual(protectedFiles.map(hash),protectedBefore);const afterProcess=proc();assert.equal(afterProcess.pid,beforeProcess.pid);assert.equal(afterProcess.pm2_env.status,'online');
  const result={backup,publicFiles:80,changedPublic:ordered,roots,backendChanged:false,backendRestarted:false,migrations:0,protectedFilesUnchanged:true,realMessagesSent:0};
  fs.writeFileSync(stage+'/activation-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }catch(e){
  if(changed){run('tar',['-xzf',backup+'/app-before.tar.gz','-C',roots[0]]);run('tar',['-xzf',backup+'/recovery-before.tar.gz','-C',roots[1]]);run('nginx',['-t']);for(const root of roots)for(const[p,h]of Object.entries(m.publicBefore))assert.equal(hash(root+'/'+p),h,'rollback mismatch '+p)}
  throw e;
 }
}
try{main()}catch(e){console.error(e.message);process.exitCode=1}
