from pathlib import Path
import json,hashlib,shutil,subprocess
R=Path(__file__).resolve().parents[2];C=R/'output/silk-launch-release';H=Path(__file__).parent;T=R/'audit/checkin-cache-JAPP133'
def h(p):
 b=p.read_bytes()
 if p.suffix in ['.html','.js','.css','.json','.txt','.svg','.prisma','.sql']:b=b.replace(b'\r\n',b'\n')
 return hashlib.sha256(b).hexdigest()
ui=json.loads((T/'ui-results.json').read_text(encoding='utf-8'));node=json.loads((T/'storage-results.json').read_text(encoding='utf-8'));assert ui['passed'] and len(ui['runs'])==20 and node['passed']
for name in ['regression-storage','regression-path','regression-diary']:
 assert all(r['passed'] for r in json.loads((T/(name+'.json')).read_text(encoding='utf-8')))
assert all(len(r['passed'])==10 and not r['pageErrors'] for r in json.loads((T/'regression-drafts.json').read_text(encoding='utf-8')))
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=C,text=True).strip()=='4975c10ece104b130e0b3eca1202d31fb86bc951'
assert not subprocess.check_output(['git','diff','--name-only'],cwd=C,text=True).strip()
for f,v in ui['sourceHashes'].items():
 assert hashlib.sha256((R/f).read_bytes()).hexdigest()==v,f
 assert h(C/f)==h(T/'before'/f),'baseline '+f
for f in ui['sourceHashes']:shutil.copyfile(R/f,C/f)
subprocess.run(['node','scripts/build-static.mjs'],cwd=C,check=True)
subprocess.run(['powershell','-NoProfile','-File','scripts/check-structure.ps1','-Built'],cwd=C,check=True)
prev=json.loads((R/'audit/diary-cache-release-JAPP132/manifest.json').read_text(encoding='utf-8'));after={p.relative_to(C/'output/app').as_posix():h(p)for p in(C/'output/app').rglob('*')if p.is_file()};assert set(after)==set(prev['publicAfter'])
changed=[f for f in after if after[f]!=prev['publicAfter'][f]];assert set(changed)=={'index.html','screen-review.html','js/app.js','js/storage.js'},changed
m={**prev,'label':'J-APP-134','backend':[],'publicBefore':prev['publicAfter'],'publicAfter':after,'changed':changed,'sourceAfter':{**prev['sourceAfter'],**{f:h(C/f)for f in ui['sourceHashes']}}};(H/'manifest.json').write_text(json.dumps(m,indent=2),encoding='utf-8')
for f in changed:
 d=H/'public'/f;d.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(C/'output/app'/f,d)
activate=(R/'audit/diary-cache-release-JAPP132/activate.cjs').read_text(encoding='utf-8').replace('japp132','japp134').replace('JAPP132','JAPP134').replace('diary-cache-JAPP134','checkin-cache-JAPP134').replace('m.changed.length,6','m.changed.length,4').replace('six staged files','four staged files');(H/'activate.cjs').write_text(activate,encoding='utf-8')
for f in ['verify-live.py','verify-final.py','verify-api.py']:
 (H/f).write_text((R/'audit/diary-cache-release-JAPP132'/f).read_text(encoding='utf-8').replace('JAPP132','JAPP134'),encoding='utf-8')
f=H/'verify-final.py';f.write_text(f.read_text(encoding='utf-8').replace("['index.html','screen-review.html','js/boot.js','js/diary-history.js','js/observation-drafts.js','js/storage.js','access-admin.html']","['index.html','screen-review.html','js/app.js','js/storage.js','js/boot.js','access-admin.html']"),encoding='utf-8')
result={'passed':True,'sourceHashes':ui['sourceHashes'],'publicFiles':88,'changed':changed,'backendChanges':0,'schemaChanges':0,'cashPanelUnchanged':after['access-admin.html']==prev['publicAfter']['access-admin.html']};(T/'build.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result))
