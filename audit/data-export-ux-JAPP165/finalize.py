from pathlib import Path
import json,hashlib,shutil,difflib
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent;S=R/'output/data-export-ux-JAPP165/source';C=R/'output/silk-launch-release'
rule='.pdf-ready-panel button{scroll-margin-block:16px}\n'
p=S/'app/css/ux-personal.css';s=p.read_text(encoding='utf-8');assert rule not in s;p.write_text(s+rule,encoding='utf-8');shutil.copy2(p,R/'app/css/ux-personal.css')
p=H/'prepare.py';s=p.read_text(encoding='utf-8').replace('.pdf-ready-panel p{margin:',rule+'.pdf-ready-panel p{margin:');p.write_text(s,encoding='utf-8')
import subprocess
subprocess.run(['node','scripts/build-static.mjs'],cwd=S,check=True)
def hashes(root):return {p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes().replace(b'\r\n',b'\n')if p.suffix in['.html','.css','.js','.svg','.txt','.json']else p.read_bytes()).hexdigest()for p in root.rglob('*')if p.is_file()}
(H/'manifest.json').write_text(json.dumps({'publicBefore':hashes(C/'output/app'),'publicAfter':hashes(S/'output/app')},indent=2),encoding='utf-8')
patch=''
for f in['app/js/app.js','app/css/ux-personal.css']:
 assert (R/f).read_bytes()==(S/f).read_bytes()
 patch+=''.join(difflib.unified_diff((C/f).read_text(encoding='utf-8').splitlines(True),(S/f).read_text(encoding='utf-8').splitlines(True),fromfile='a/'+f,tofile='b/'+f,n=0))
(H/'candidate.patch').write_text(patch,encoding='utf-8')
