// One approved backend route. Private code backup, exact guards, synthetic tests; no DB client or notifications.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const stage='/root/telo-japp066-release',base='/var/www/telo-pomnit/backend',target=base+'/src/routes/admin.js';
const m=JSON.parse(fs.readFileSync(stage+'/manifest.json'));
const hash=p=>createHash('sha256').update(/\.(js|css|html|txt|svg|json|prisma)$/.test(p)?fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n'):fs.readFileSync(p)).digest('hex');
function run(cmd,args,env=process.env){const r=spawnSync(cmd,args,{encoding:'utf8',env,maxBuffer:16e6});if(r.status!==0){fs.writeFileSync(stage+'/private-error.log',r.stdout+'\n'+r.stderr,{mode:0o600});throw Error(cmd+' failed; diagnostics private')}return r.stdout}
function install(from,to){const tmp=to+'.japp066.tmp';fs.copyFileSync(from,tmp);fs.renameSync(tmp,to)}
function tree(dir){const result={};for(const p of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,p.name);assert(!p.isSymbolicLink());if(p.isDirectory())Object.assign(result,tree(f));else result[f]=hash(f)}return result}
function publicState(){for(const root of ['/var/www/telo-app','/var/www/telo-app/recovery/j293'])for(const[p,h]of Object.entries(m.publicUnchanged))assert.equal(hash(root+'/'+p),h,'public changed '+p)}
async function main(){
 assert.equal(m.path,'src/routes/admin.js');assert.equal(hash(target),m.before,'backend baseline drift');assert.equal(hash(stage+'/admin.js'),m.after,'staged route drift');
 const sourceBefore=tree(base+'/src');delete sourceBefore[target];
 const protectedPaths=[base+'/.env',base+'/prisma/schema.prisma',base+'/package.json',base+'/package-lock.json',base+'/scripts/health-check.sh',base+'/scripts/health-monitor.py'];
 const protectedBefore=protectedPaths.map(hash);publicState();run('nginx',['-t']);run('node',['--check',stage+'/admin.js']);
 const processBefore=JSON.parse(run('pm2',['jlist'])).find(p=>p.name==='telo-backend');assert.equal(processBefore?.pm2_env.status,'online');
 if(process.argv.includes('--check')){console.log('PASS one-route preflight; exact baseline/staged hashes, public80x2, nginx and backend; no writes');return}
 const backup='/root/telo-backups/participant-JAPP066-'+new Date().toISOString().replace(/[:.]/g,'');fs.mkdirSync(backup,{mode:0o700});
 run('tar',['-czf',backup+'/backend-source-before.tar.gz','-C',base,'src','prisma','package.json','package-lock.json']);run('tar',['-tzf',backup+'/backend-source-before.tar.gz']);
 fs.copyFileSync(target,backup+'/admin-before.js');fs.chmodSync(backup+'/admin-before.js',0o600);assert.equal(hash(backup+'/admin-before.js'),m.before);
 fs.writeFileSync(backup+'/manifest.json',JSON.stringify({route:m.path,before:m.before,after:m.after,protectedPaths,protectedBefore},null,2),{mode:0o600});
 let changed=false;
 try{
  changed=true;install(stage+'/admin.js',target);run('node',['--check',target]);assert.equal(hash(target),m.after);
  const testLog=run('node',[stage+'/scripts/test-participant-card.cjs'],{...process.env,PARTICIPANT_CARD_TEST_BACKEND:base});
  fs.writeFileSync(stage+'/synthetic-tests.log',testLog,{mode:0o600});
  const checks=JSON.parse(fs.readFileSync(stage+'/output/participant-card-JAPP065/checks.json'));
  assert.equal(checks.passed,33);assert.equal(checks.writes+checks.externalCalls+checks.providerCalls+checks.notices,0);
  const sourceAfter=tree(base+'/src');delete sourceAfter[target];assert.deepEqual(sourceAfter,sourceBefore);assert.deepEqual(protectedPaths.map(hash),protectedBefore);publicState();
  run('pm2',['restart','telo-backend']);
  let healthy=false;for(let i=0;i<30;i++){try{if((await fetch('http://127.0.0.1:3000/health')).ok){healthy=true;break}}catch{}await new Promise(r=>setTimeout(r,500))}assert(healthy,'backend health');
  assert.equal((await fetch('http://127.0.0.1:3000/admin/participants/00000000-0000-4000-8000-000000000000')).status,401);
  run('nginx',['-t']);assert.deepEqual(protectedPaths.map(hash),protectedBefore);publicState();
  const result={backup,changedBackend:[m.path],installedHash:hash(target),otherBackendSourceUnchanged:true,protectedFilesUnchanged:true,publicFilesUnchanged:80,publicRoots:2,syntheticChecks:checks.passed,syntheticDbWrites:checks.writes,syntheticExternalCalls:checks.externalCalls,syntheticProviderCalls:checks.providerCalls,syntheticNotifications:checks.notices,productionDbOperations:0,migrations:0,productionHealth:200,unauthenticatedCard:401,backendRestarted:true};
  fs.writeFileSync(stage+'/activation-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }catch(e){if(changed){install(backup+'/admin-before.js',target);assert.equal(hash(target),m.before);run('pm2',['restart','telo-backend'])}throw e}
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
