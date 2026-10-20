from pathlib import Path
import subprocess,shutil,json,hashlib
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent;S=R/'output/data-export-ux-JAPP165/source';C=R/'output/silk-launch-release'
a="    if (request === rightsRequest) document.getElementById('data-rights-status').textContent = successText;"
b="""    if (request === rightsRequest) {
      document.getElementById('data-rights-status').textContent = successText;
      if (progress?.button === 'data-export-pdf' && currentScreen === 'data-rights') { const save=document.querySelector('.pdf-ready-panel button'); save?.focus({preventScroll:true}); save?.scrollIntoView({block:'nearest'}); }
    }"""
p=S/'app/js/app.js';s=p.read_text(encoding='utf-8');assert s.count(a)==1;p.write_text(s.replace(a,b),encoding='utf-8');shutil.copy2(p,R/'app/js/app.js')
p=H/'prepare.py';s=p.read_text(encoding='utf-8');needle="replace('async function performRightsAction(action, successText) {'";pos=s.index(needle);s=s[:pos]+'replace('+repr(a)+','+repr(b)+')\n'+s[pos:];p.write_text(s,encoding='utf-8')
subprocess.run(['node','scripts/build-static.mjs'],cwd=S,check=True)
def hashes(root):return {p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes().replace(b'\r\n',b'\n')if p.suffix in['.html','.css','.js','.svg','.txt','.json']else p.read_bytes()).hexdigest()for p in root.rglob('*')if p.is_file()}
(H/'manifest.json').write_text(json.dumps({'publicBefore':hashes(C/'output/app'),'publicAfter':hashes(S/'output/app')},indent=2),encoding='utf-8')
