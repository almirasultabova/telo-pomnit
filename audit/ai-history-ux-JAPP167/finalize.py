from pathlib import Path
import subprocess,shutil,json,hashlib,difflib
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent;S=R/'output/ai-history-ux-JAPP167/source';C=R/'output/silk-launch-release'
a="  aiScreenRequest++; aiHistoryLoading = false; setAiHistoryStatus('');"
b=a+" document.getElementById('ai-history-select')?.replaceChildren(new Option('Новый диалог',''));"
for p in[S/'app/js/app.js',H/'prepare.py']:
 s=p.read_text(encoding='utf-8');assert s.count(a)==1;p.write_text(s.replace(a,b),encoding='utf-8')
shutil.copy2(S/'app/js/app.js',R/'app/js/app.js');subprocess.run(['node','scripts/build-static.mjs'],cwd=S,check=True)
def hashes(root):return {p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes().replace(b'\r\n',b'\n')if p.suffix in['.html','.js','.css','.svg','.txt','.json']else p.read_bytes()).hexdigest()for p in root.rglob('*')if p.is_file()}
(H/'manifest.json').write_text(json.dumps({'publicBefore':hashes(C/'output/app'),'publicAfter':hashes(S/'output/app')},indent=2),encoding='utf-8')
patch=''
for f in['app/js/app.js','app/css/ux-personal.css']:
 assert (R/f).read_bytes()==(S/f).read_bytes();patch+=''.join(difflib.unified_diff((C/f).read_text(encoding='utf-8').splitlines(True),(S/f).read_text(encoding='utf-8').splitlines(True),fromfile='a/'+f,tofile='b/'+f,n=0))
(H/'candidate.patch').write_text(patch,encoding='utf-8')
