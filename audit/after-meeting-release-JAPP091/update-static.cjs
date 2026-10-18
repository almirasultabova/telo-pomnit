const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const stage=__dirname,roots=['/var/www/telo-app','/var/www/telo-app/recovery/j293'];
const before=JSON.parse(fs.readFileSync(stage+'/first-manifest.json')),after=JSON.parse(fs.readFileSync(stage+'/manifest.json'));
const hash=p=>createHash('sha256').update(/\.(html|js|css|json|svg|txt)$/.test(p)?fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n'):fs.readFileSync(p)).digest('hex');
const changed=Object.keys(after.publicAfter).filter(f=>before.publicAfter[f]!==after.publicAfter[f]);
assert.deepEqual(new Set(changed),new Set(['index.html','screen-review.html','js/after-meeting.js']));
const backup=JSON.parse(fs.readFileSync(stage+'/backup-receipt.json')).backup+'/layout-before';assert(!fs.existsSync(backup));fs.mkdirSync(backup,{mode:0o700});
for(const root of roots)for(const[f,h]of Object.entries(before.publicAfter))assert.equal(hash(root+'/'+f),h);
for(const f of changed)assert.equal(hash(stage+'/public/'+f),after.publicAfter[f]);
for(let i=0;i<roots.length;i++)for(const f of changed){const dest=backup+'/'+i+'/'+f;fs.mkdirSync(path.dirname(dest),{recursive:true,mode:0o700});fs.copyFileSync(roots[i]+'/'+f,dest);fs.chmodSync(dest,0o600)}
try{
 for(const root of roots)for(const f of changed.sort((a,b)=>Number(a.endsWith('.html'))-Number(b.endsWith('.html')))){
  const dest=root+'/'+f,tmp=dest+'.japp091.tmp';fs.copyFileSync(stage+'/public/'+f,tmp);fs.chmodSync(tmp,0o644);fs.renameSync(tmp,dest);
 }
 for(const root of roots)for(const[f,h]of Object.entries(after.publicAfter))assert.equal(hash(root+'/'+f),h);
 const result={changed,backup,publicFiles:82,backendChanges:0,notifications:0};fs.writeFileSync(stage+'/static-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(e){for(let i=0;i<roots.length;i++)for(const f of changed)fs.copyFileSync(backup+'/'+i+'/'+f,roots[i]+'/'+f);throw e}
