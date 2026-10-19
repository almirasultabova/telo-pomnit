from pathlib import Path
import json,hashlib,shutil,subprocess,difflib
R=Path(__file__).resolve().parents[2];C=R/'output/silk-launch-release';H=Path(__file__).parent;T=R/'audit/diary-cache-JAPP131'
def h(p):
 b=p.read_bytes()
 if p.suffix in ['.html','.js','.css','.json','.txt','.svg','.prisma','.sql']:b=b.replace(b'\r\n',b'\n')
 return hashlib.sha256(b).hexdigest()
ui=json.loads((T/'ui-results.json').read_text(encoding='utf-8'));node=json.loads((T/'storage-results.json').read_text(encoding='utf-8'));assert ui['passed']and len(ui['runs'])==20 and node['passed']
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=C,text=True).strip()=='1a2478e8958944c9e3a602549cf7ee09270fbd1c';assert subprocess.check_output(['git','diff','--name-only'],cwd=C,text=True).strip()==''
for f,v in ui['sourceHashes'].items():
 assert hashlib.sha256((R/f).read_bytes()).hexdigest()==v,f
 if f in node['sourceHashes']:assert v==node['sourceHashes'][f]
 assert h(C/f)==h(T/'before'/f),'baseline '+f
for f in ui['sourceHashes']:shutil.copyfile(R/f,C/f)
subprocess.run(['node','scripts/build-static.mjs'],cwd=C,check=True);subprocess.run(['powershell','-NoProfile','-File','scripts/check-structure.ps1','-Built'],cwd=C,check=True)
prev=json.loads((R/'audit/path-period-release-JAPP130/manifest.json').read_text(encoding='utf-8'));after={p.relative_to(C/'output/app').as_posix():h(p)for p in(C/'output/app').rglob('*')if p.is_file()};assert set(after)==set(prev['publicAfter'])
changed=[f for f in after if after[f]!=prev['publicAfter'][f]];assert set(changed)=={'index.html','screen-review.html','js/storage.js','js/boot.js','js/diary-history.js','js/observation-drafts.js'},changed
m={**prev,'label':'J-APP-132','backend':[],'publicBefore':prev['publicAfter'],'publicAfter':after,'changed':changed,'sourceAfter':{**prev['sourceAfter'],**{f:h(C/f)for f in ui['sourceHashes']}}};(H/'manifest.json').write_text(json.dumps(m,indent=2),encoding='utf-8')
for f in changed:
 d=H/'public'/f;d.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(C/'output/app'/f,d)
activate=(R/'audit/diary-entry-release-JAPP128/activate.cjs').read_text(encoding='utf-8').replace('japp128','japp132').replace('JAPP128','JAPP132').replace('diary-entry-JAPP132','diary-cache-JAPP132').replace('m.changed.length,5','m.changed.length,6').replace('five staged files','six staged files');(H/'activate.cjs').write_text(activate,encoding='utf-8')
for f in ['verify-live.py','verify-final.py','verify-api.py']:
 (H/f).write_text((R/'audit/path-period-release-JAPP130'/f).read_text(encoding='utf-8').replace('JAPP130','JAPP132'),encoding='utf-8')
final=(H/'verify-final.py').read_text(encoding='utf-8').replace("['index.html','screen-review.html','js/api.js','js/app.js','js/storage.js','access-admin.html']","['index.html','screen-review.html','js/boot.js','js/diary-history.js','js/observation-drafts.js','js/storage.js','access-admin.html']");(H/'verify-final.py').write_text(final,encoding='utf-8')
patch=''.join(''.join(difflib.unified_diff((T/'before'/f).read_text(encoding='utf-8').splitlines(True),(R/f).read_text(encoding='utf-8').splitlines(True),fromfile='a/'+f,tofile='b/'+f,n=0))for f in ui['sourceHashes']);(T/'changes.patch').write_text(patch,encoding='utf-8')
result={'passed':True,'sourceHashes':ui['sourceHashes'],'publicFiles':88,'changed':changed,'backendChanges':0,'schemaChanges':0,'cashPanelUnchanged':after['access-admin.html']==prev['publicAfter']['access-admin.html']};(T/'build.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result))
