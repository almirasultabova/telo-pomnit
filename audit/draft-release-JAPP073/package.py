from pathlib import Path
import hashlib, json, tarfile
ROOT=Path(__file__).resolve().parents[2];HERE=Path(__file__).parent
OUT=ROOT/'output/draft-release-JAPP073';PUBLIC=ROOT/'output/silk-launch-release/output/app'
def digest(p):
    data=p.read_bytes()
    if p.suffix in ['.html','.js','.css','.svg','.txt','.json']:data=data.replace(b'\r\n',b'\n')
    return hashlib.sha256(data).hexdigest()
before=json.loads((HERE/'baseline.json').read_text(encoding='utf-8'))
after={p.relative_to(PUBLIC).as_posix():digest(p)for p in PUBLIC.rglob('*')if p.is_file()}
changed=[p for p in after if before.get(p)!=after[p]]
assert set(changed)=={'js/app.js','index.html','screen-review.html'},changed
assert len(before)==len(after)==80
m={'label':'J-APP-073','publicBefore':before,'publicAfter':after,'changed':changed,'backend':[]}
(HERE/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2),encoding='utf-8')
with tarfile.open(OUT/'release.tar.gz','w:gz')as tar:
    for p in changed:tar.add(PUBLIC/p,arcname='public/'+p)
    for p in ['manifest.json','activate.cjs']:tar.add(HERE/p,arcname=p)
print('80 files, exactly 3 changed: JS and two bundled HTML; no backend')
