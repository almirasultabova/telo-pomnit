from pathlib import Path
import json,hashlib,subprocess,tarfile
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1];REL=ROOT/'output/silk-launch-release';PUBLIC=REL/'output/app';OUT=ROOT/'output/stream-states-JAPP060';OUT.mkdir(exist_ok=True)
def digest(data,p):
 if Path(p).suffix in ['.html','.js','.css','.svg','.txt','.json','.sql','.prisma']:data=data.replace(b'\r\n',b'\n')
 return hashlib.sha256(data).hexdigest()
before=json.loads((ROOT/'audit/app-light-release-JAPP057/manifest.json').read_text(encoding='utf-8'))['publicAfter']
after={str(p.relative_to(PUBLIC)).replace('\\','/'):digest(p.read_bytes(),p) for p in PUBLIC.rglob('*') if p.is_file()}
backend=[]
for name in ['backend/src/routes/me.js']:
 previous=subprocess.run(['git','-C',str(REL),'show','HEAD:'+name],capture_output=True,check=True).stdout
 backend.append({'path':name,'before':digest(previous,name),'after':digest((REL/name).read_bytes(),name)})
manifest={'label':'J-APP-060','publicBefore':before,'publicAfter':after,'backend':backend}
(HERE/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
with tarfile.open(OUT/'release.tar.gz','w:gz') as tar:
 for p in PUBLIC.rglob('*'):
  if p.is_file():tar.add(p,arcname='public/'+str(p.relative_to(PUBLIC)).replace('\\','/'))
 for f in backend:tar.add(REL/f['path'],arcname=f['path'])
 tar.add(HERE/'manifest.json',arcname='manifest.json');tar.add(HERE/'activate.cjs',arcname='activate.cjs')
print('Package:',len(after),'public files;',sum(before.get(p)!=h for p,h in after.items()),'changed; backend me.js only; no migrations')
