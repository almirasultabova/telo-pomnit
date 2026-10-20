// Approved J167 client + only the AI message schema length change. No DB writes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const stage=__dirname,roots=['/var/www/telo-app','/var/www/telo-app/recovery/j293'],backend='/var/www/telo-pomnit/backend/src/routes/ai.js';
const m=JSON.parse(fs.readFileSync(stage+'/manifest.json'));
const digest=(data,p)=>createHash('sha256').update(/\.(html|js|css|svg|txt|json|prisma|sql)$/.test(p)?data.toString('utf8').replace(/\r\n/g,'\n'):data).digest('hex');
const hash=p=>digest(fs.readFileSync(p),p);
function run(cmd,args){const r=spawnSync(cmd,args,{maxBuffer:24e6});if(r.status!==0){fs.writeFileSync(stage+'/private-error.log',String(r.stdout)+'\n'+String(r.stderr),{mode:0o600});throw Error(cmd+' failed; diagnostics private')}return r.stdout}
function install(from,to){const tmp=to+'.japp168.tmp';fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,tmp);fs.chmodSync(tmp,0o644);fs.renameSync(tmp,to)}
const proc=()=>JSON.parse(run('pm2',['jlist']).toString()).find(p=>p.name==='telo-backend');
function health(){for(let i=0;i<15;i++){const r=spawnSync('curl',['--fail','--silent','--max-time','2','http://127.0.0.1:3000/health']);if(r.status===0)return;spawnSync('sleep',['1'])}throw Error('Backend health timeout')}
function main(){
 assert.deepEqual(m.backend,['backend/src/routes/ai.js']);assert.equal(m.changed.length,5);
 for(const root of roots)for(const[p,h]of Object.entries(m.publicBefore))assert.equal(hash(root+'/'+p),h,'baseline '+p);
 for(const p of m.changed)assert.equal(hash(stage+'/public/'+p),m.publicAfter[p],'stage '+p);
 assert.equal(hash(backend),m.previousAI);assert.equal(hash(stage+'/backend/ai.js'),m.protectedAI);
 const before=fs.readFileSync(backend,'utf8').replace(/\r\n/g,'\n'),after=fs.readFileSync(stage+'/backend/ai.js','utf8').replace(/\r\n/g,'\n');
 assert.equal(before.replace("message: { type: 'string', minLength: 1, maxLength: 1000 }","message: { type: 'string', minLength: 1 }"),after);
 for(const[f,h]of Object.entries(m.sourceAfter))if(f.startsWith('backend/')&&f!=='backend/src/routes/ai.js')assert.equal(hash('/var/www/telo-pomnit/'+f),h,'protected '+f);
 for(const[f,h]of Object.entries(m.cashBackend))assert.equal(hash('/var/www/telo-pomnit/'+f),h,'cash '+f);
 run('nginx',['-t']);assert.equal(proc()?.pm2_env.status,'online');
 const protectedFiles=['/var/www/telo-pomnit/backend/.env','/var/www/telo-pomnit/backend/scripts/health-check.sh','/var/www/telo-pomnit/backend/scripts/health-monitor.py'];const protectedBefore=protectedFiles.map(hash);
 if(process.argv.includes('--check')){console.log('PASS 196 baseline hashes, staged five public files + schema-only backend, nginx and PM2; no mutation');return}
 const backup='/root/telo-backups/ui-JAPP168-'+new Date().toISOString().replace(/[:.]/g,'');fs.mkdirSync(backup,{mode:0o700});
 run('tar',['--exclude=./recovery','-czf',backup+'/app-before.tar.gz','-C',roots[0],'.']);run('tar',['-czf',backup+'/recovery-before.tar.gz','-C',roots[1],'.']);
 fs.copyFileSync(backend,backup+'/ai-before.js');fs.chmodSync(backup+'/ai-before.js',0o600);
 let backupHashes=0;for(const name of ['app-before.tar.gz','recovery-before.tar.gz']){fs.chmodSync(backup+'/'+name,0o600);run('tar',['-tzf',backup+'/'+name]);for(const p of m.changed){assert.equal(digest(run('tar',['-xOzf',backup+'/'+name,'./'+p]),p),m.publicBefore[p]);backupHashes++}}
 assert.equal(hash(backup+'/ai-before.js'),m.previousAI);backupHashes++;
 fs.writeFileSync(backup+'/before-manifest.json',JSON.stringify(m,null,2),{mode:0o600});
 let changed=false;
 try{
  assert.equal(hash(backend),m.previousAI);changed=true;install(stage+'/backend/ai.js',backend);run('pm2',['restart','telo-backend']);health();assert.equal(proc()?.pm2_env.status,'online');
  const ordered=[...m.changed].sort((a,b)=>Number(a.endsWith('.html'))-Number(b.endsWith('.html')));
  for(const root of roots)for(const p of ordered)install(stage+'/public/'+p,root+'/'+p);
  run('nginx',['-t']);for(const root of roots)for(const[p,h]of Object.entries(m.publicAfter))assert.equal(hash(root+'/'+p),h,'installed '+p);
  assert.deepEqual(protectedFiles.map(hash),protectedBefore);assert.equal(hash(backend),m.protectedAI);assert.equal(proc()?.pm2_env.status,'online');
  for(const[f,h]of Object.entries(m.cashBackend))assert.equal(hash('/var/www/telo-pomnit/'+f),h);
  const result={backup,backupHashesVerifiedBeforeActivation:backupHashes,publicFiles:98,changedPublic:ordered,roots,backendChanged:true,backendChange:'Remove only message maxLength:1000',backendRestarted:true,modelAndPromptUnchanged:true,migrations:0,protectedFilesUnchanged:true,realMessagesSent:0};fs.writeFileSync(stage+'/activation-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }catch(e){if(changed){install(backup+'/ai-before.js',backend);run('pm2',['restart','telo-backend']);health();run('tar',['-xzf',backup+'/app-before.tar.gz','-C',roots[0]]);run('tar',['-xzf',backup+'/recovery-before.tar.gz','-C',roots[1]]);run('nginx',['-t']);for(const root of roots)for(const[p,h]of Object.entries(m.publicBefore))assert.equal(hash(root+'/'+p),h,'rollback '+p);assert.equal(hash(backend),m.previousAI)}throw e}
}
try{main()}catch(e){console.error(e.message);process.exitCode=1}
