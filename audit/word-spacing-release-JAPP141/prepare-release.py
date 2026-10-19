from pathlib import Path
import json,hashlib,shutil,subprocess
R=Path(__file__).resolve().parents[2];C=R/'output/silk-launch-release';P=R/'output/word-spacing-JAPP140';H=Path(__file__).parent
def h(p):
 b=p.read_bytes()
 if p.suffix in ['.html','.css','.js','.json','.txt','.svg','.prisma','.sql']:b=b.replace(b'\r\n',b'\n')
 return hashlib.sha256(b).hexdigest()
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=C,text=True).strip()=='a741520e23ba218ce90c3e03936f768b5b30d378'
assert not subprocess.check_output(['git','diff','--name-only'],cwd=C,text=True).strip()
candidate=json.loads((R/'audit/word-spacing-JAPP140/manifest.json').read_text(encoding='utf-8'))
assert hashlib.sha256((P/'source/app/index.html').read_bytes()).hexdigest()==candidate['sourceHash']
assert hashlib.sha256((R/'app/index.html').read_bytes()).hexdigest()==candidate['rootHTMLHash']
checks=json.loads((R/'audit/word-spacing-JAPP140/browser-check.json').read_text(encoding='utf-8'));assert len(checks)==8 and all(not r['overflow'] and not r['pageErrors']for r in checks)
prev=json.loads((R/'audit/launch-speed-release-JAPP139/manifest.json').read_text(encoding='utf-8'))
before={p.relative_to(C/'output/app').as_posix():h(p)for p in(C/'output/app').rglob('*')if p.is_file()};assert before==prev['publicAfter']
old=(C/'app/index.html').read_text(encoding='utf-8');new=old.replace('Отметить<br>состояние','Отметить состояние').replace('Заметить<br>реакцию','Заметить реакцию');assert new==(P/'source/app/index.html').read_text(encoding='utf-8')
(H/'before').mkdir(parents=True,exist_ok=True);shutil.copyfile(C/'app/index.html',H/'before/index.html');shutil.copyfile(P/'source/app/index.html',C/'app/index.html')
subprocess.run(['node','scripts/build-static.mjs'],cwd=C,check=True)
subprocess.run(['powershell','-NoProfile','-File','scripts/check-structure.ps1','-Built'],cwd=C,check=True)
after={p.relative_to(C/'output/app').as_posix():h(p)for p in(C/'output/app').rglob('*')if p.is_file()}
assert set(before)==set(after) and len(after)==92
changed=sorted(f for f in after if after[f]!=before[f]);assert changed==['index.html','screen-review.html'],changed
assert h(C/'output/app/index.html')==h(P/'app/index.html')
m={**prev,'label':'J-APP-141','publicBefore':before,'publicAfter':after,'changed':changed,'added':[],'backend':[],'sourceAfter':{**prev['sourceAfter'],'app/index.html':h(C/'app/index.html')}}
(H/'manifest.json').write_text(json.dumps(m,indent=2),encoding='utf-8')
for f in changed:
 dest=H/'public'/f;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(C/'output/app'/f,dest)
for name in ['activate.cjs','verify-backup.cjs','verify-live.py','verify-api.py']:
 text=(R/'audit/launch-speed-release-JAPP139'/name).read_text(encoding='utf-8').replace('japp139','japp141').replace('JAPP139','JAPP141').replace('launch-speed-JAPP141','word-spacing-JAPP141').replace('m.changed.length,6','m.changed.length,2').replace('Object.keys(m.publicBefore).length,90','Object.keys(m.publicBefore).length,92').replace('exact 90-file baselines, six staged files','exact 92-file baselines, two staged files')
 (H/name).write_text(text,encoding='utf-8')
print(json.dumps({'publicFiles':92,'changed':changed,'candidateMatches':True,'assetsUnchanged':True}))
