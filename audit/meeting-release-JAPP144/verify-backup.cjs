const fs=require('node:fs'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const stage=__dirname,m=JSON.parse(fs.readFileSync(stage+'/manifest.json')),a=JSON.parse(fs.readFileSync(stage+'/activation-result.json'));
assert(a.backup.startsWith('/root/telo-backups/meeting-JAPP144-'));
let checked=0;
for(const name of ['app-before.tar.gz','recovery-before.tar.gz']){
 const archive=a.backup+'/'+name;
 const list=spawnSync('tar',['-tzf',archive],{encoding:'utf8',maxBuffer:16e6});assert.equal(list.status,0);
 for(const p of m.changed){
  assert(!p.includes('..'));
  if(m.added.includes(p)){assert(!list.stdout.split('\n').includes('./'+p));continue;}
  const out=spawnSync('tar',['-xOf',archive,'./'+p],{maxBuffer:16e6});assert.equal(out.status,0);
  const bytes=/\.(html|css|js)$/.test(p)?Buffer.from(out.stdout.toString('utf8').replace(/\r\n/g,'\n')):out.stdout;
  assert.equal(createHash('sha256').update(bytes).digest('hex'),m.publicBefore[p]);checked++;
 }
}
let backendChecked=0;
const backendArchive=a.backup+'/backend-before.tar.gz';
const backendList=spawnSync('tar',['-tzf',backendArchive],{encoding:'utf8',maxBuffer:16e6});assert.equal(backendList.status,0);
for(const f of m.backend){const member=f.path.slice(8);if(f.before===null){assert(!backendList.stdout.split('\n').includes(member));continue;}const out=spawnSync('tar',['-xOf',backendArchive,member],{maxBuffer:16e6});assert.equal(out.status,0);assert.equal(createHash('sha256').update(out.stdout.toString('utf8').replace(/\r\n/g,'\n')).digest('hex'),f.before);backendChecked++;}
const result={backendPreviousFileHashes:backendChecked,passed:true,backup:a.backup,previousChangedFileHashes:checked,newFilesAbsent:true};
fs.writeFileSync(stage+'/backup-verification.json',JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify(result));
