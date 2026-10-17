from pathlib import Path
import json,hashlib,tarfile
ROOT=Path(__file__).resolve().parents[2];HERE=Path(__file__).parent;OUT=ROOT/'output/contrast-release-JAPP071';PUBLIC=ROOT/'output/silk-launch-release/output/app'
def digest(data,p):
 if Path(p).suffix in ['.html','.js','.css','.svg','.txt','.json']:data=data.replace(b'\r\n',b'\n')
 return hashlib.sha256(data).hexdigest()
before=json.loads((HERE/'baseline.json').read_text(encoding='utf-8'))
after={p.relative_to(PUBLIC).as_posix():digest(p.read_bytes(),p)for p in PUBLIC.rglob('*')if p.is_file()}
changed=[p for p in after if before.get(p)!=after[p]]
expected=['index.html','screen-review.html']+['css/'+Path(x['file']).name for x in json.loads((HERE/'approved.json').read_text(encoding='utf-8'))]
assert set(changed)==set(expected),changed
assert len(before)==len(after)==80
m={'label':'J-APP-071','publicBefore':before,'publicAfter':after,'changed':changed,'backend':[]}
(HERE/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2),encoding='utf-8')
with tarfile.open(OUT/'release.tar.gz','w:gz')as tar:
 for p in changed:tar.add(PUBLIC/p,arcname='public/'+p)
 tar.add(HERE/'manifest.json',arcname='manifest.json');tar.add(HERE/'activate.cjs',arcname='activate.cjs')
print('80 public resources; exactly six CSS plus two bundled HTML changed; no backend')
