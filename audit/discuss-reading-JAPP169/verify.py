from pathlib import Path
import subprocess,json,hashlib,shutil
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent;C=R/'output/silk-launch-release';S=R/'output/discuss-reading-JAPP169/source'
files=subprocess.check_output(['git','-C',str(C),'ls-files','-z']).decode().split('\0')
changed=[f for f in files if f and f.startswith(('app/','backend/','scripts/','site/','media/'))and(S/f).is_file()and(S/f).read_bytes()!=(C/f).read_bytes()]
assert sorted(changed)==['app/css/discussion-notes.css','app/js/app.js','app/js/discussion-notes.js'],changed
for f in changed:subprocess.run(['node','--check',str(S/f)],check=True)if f.endswith('.js')else None
def hashes(base):return {p.relative_to(base).as_posix():hashlib.sha256(p.read_bytes().replace(b'\r\n',b'\n')if p.suffix in['.html','.js','.css','.svg','.txt','.json']else p.read_bytes()).hexdigest()for p in base.rglob('*')if p.is_file()}
m={'publicBefore':hashes(C/'output/app'),'publicAfter':hashes(S/'output/app')};assert len(m['publicAfter'])==98 and set(m['publicBefore'])==set(m['publicAfter'])
(H/'manifest.json').write_text(json.dumps(m,indent=2),encoding='utf-8')
(H/'candidate.patch').write_bytes(subprocess.run(['git','diff','--no-index','--',str(C/'app/js/discussion-notes.js'),str(S/'app/js/discussion-notes.js')],capture_output=True).stdout)
for f in ['app/js/discussion-notes.js','app/css/discussion-notes.css']:
 assert (R/f).read_bytes().replace(b'\r\n',b'\n')==(C/f).read_bytes().replace(b'\r\n',b'\n'),'unrelated root source '+f
 shutil.copy2(S/f,R/f)
p=R/'app/js/app.js';s=p.read_text(encoding='utf-8');a="  if (currentScreen === 'home' && activeTab === 'diag' && habitualView !== 'summary') {";b="  if (currentScreen === 'discuss' && window.DiscussionNotes?.back()) return;\n"+a;assert s.count(a)==1 and 'DiscussionNotes?.back()'not in s;s=s.replace(a,b);p.write_text(s,encoding='utf-8')
(H/'verification.json').write_text(json.dumps({'sourceChanges':changed,'backendChanged':False,'apiChanged':False,'publicChanges':[p for p,h in m['publicAfter'].items()if m['publicBefore'][p]!=h],'published':False,'preservedOtherRuntimeSources':len([f for f in files if f and f.startswith(('app/','backend/','scripts/','site/','media/'))and(S/f).is_file()])-len(changed)},indent=2),encoding='utf-8');print('PASS exact three sources; root integrated surgically, release checkout remains J167')
