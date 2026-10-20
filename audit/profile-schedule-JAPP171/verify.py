from pathlib import Path
import subprocess,hashlib,json,shutil,difflib
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent;C=R/'output/silk-launch-release';S=R/'output/profile-schedule-JAPP171/source';FILES=['app/js/app.js','app/css/ux-personal.css']
tracked=subprocess.check_output(['git','-C',str(C),'ls-files','-z']).decode().split('\0');runtime=[f for f in tracked if f and f.startswith(('app/','backend/','scripts/','site/','media/'))and(S/f).is_file()]
changed=[f for f in runtime if(S/f).read_bytes()!=(C/f).read_bytes()];assert sorted(changed)==sorted(FILES),changed
patch=[]
for f in FILES:
 before=(C/f).read_text(encoding='utf-8');after=(S/f).read_text(encoding='utf-8');root=(R/f).read_text(encoding='utf-8');assert root==before,'Unrelated root change in '+f
 patch.extend(difflib.unified_diff(before.splitlines(keepends=True),after.splitlines(keepends=True),fromfile='a/'+f,tofile='b/'+f,n=0));shutil.copy2(S/f,R/f)
(H/'candidate.patch').write_text(''.join(patch),encoding='utf-8')
subprocess.run(['node','--check',str(S/'app/js/app.js')],check=True)
def hashes(base):return {p.relative_to(base).as_posix():hashlib.sha256(p.read_bytes().replace(b'\r\n',b'\n')if p.suffix in['.html','.js','.css','.txt','.json','.svg']else p.read_bytes()).hexdigest()for p in base.rglob('*')if p.is_file()}
m={'publicBefore':hashes(C/'output/app'),'publicAfter':hashes(S/'output/app')};assert len(m['publicAfter'])==98 and set(m['publicBefore'])==set(m['publicAfter']);(H/'manifest.json').write_text(json.dumps(m,indent=2),encoding='utf-8')
(H/'verification.json').write_text(json.dumps({'sourceChanges':FILES,'preservedOtherRuntimeSources':len(runtime)-2,'backendChanged':False,'apiChanged':False,'publicChanges':[p for p,h in m['publicAfter'].items()if m['publicBefore'][p]!=h],'published':False,'rootIntegrated':True},indent=2),encoding='utf-8');print('PASS exact two sources; root updated, release checkout remains J169')
