from pathlib import Path
import subprocess,shutil,hashlib,json
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent;C=R/'output/silk-launch-release';S=R/'output/ai-picker-JAPP159/source'
names=subprocess.check_output(['git','ls-files','-z','--cached','--others','--exclude-standard','--','app','backend','scripts','site','media'],cwd=R).decode().split('\0')
def normalized(p):return p.read_bytes().replace(b'\r\n',b'\n')if p.suffix in['.html','.js','.css','.svg','.txt','.json','.prisma','.sql']else p.read_bytes()
before={f:hashlib.sha256((R/f).read_bytes()).hexdigest()for f in names if f and(R/f).is_file()}
for f in['app/js/app.js','app/css/styles.css']:
 assert normalized(R/f)==normalized(C/f),'Unrelated root change: '+f
 shutil.copy2(S/f,R/f)
changed=sorted(f for f,h in before.items()if hashlib.sha256((R/f).read_bytes()).hexdigest()!=h);assert changed==['app/css/styles.css','app/js/app.js'],changed
def hashes(base):return {p.relative_to(base).as_posix():hashlib.sha256(normalized(p)).hexdigest()for p in base.rglob('*')if p.is_file()}
old=hashes(C/'output/app');new=hashes(S/'output/app');publicChanges=sorted(p for p in new if new[p]!=old.get(p));assert publicChanges==['css/styles.css','index.html','js/app.js','screen-review.html'];assert set(old)==set(new)
(H/'verification.json').write_text(json.dumps({'passed':True,'sourceChanges':changed,'otherRootSourcesUnchanged':len(before)-2,'publicChanges':publicChanges,'publicFiles':len(new),'apiChanged':False,'backendChanged':False,'published':False},indent=2),encoding='utf-8')
(H/'manifest.json').write_text(json.dumps({'publicBefore':old,'publicAfter':new},indent=2),encoding='utf-8');print('PASS local-only two-source integration; unrelated root sources preserved')
