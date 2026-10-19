from pathlib import Path
import json,hashlib,shutil,subprocess,difflib
R=Path(__file__).resolve().parents[2];C=R/'output/silk-launch-release';H=Path(__file__).parent;T=R/'audit/save-status-JAPP135'
def h(p):
 b=p.read_bytes()
 if p.suffix in ['.html','.js','.css','.json','.txt','.svg','.prisma','.sql']:b=b.replace(b'\r\n',b'\n')
 return hashlib.sha256(b).hexdigest()
ui=json.loads((T/'ui-results.json').read_text(encoding='utf-8'));assert ui['passed'] and len(ui['runs'])==24
assert all(r['passed']for r in json.loads((T/'extra-ui.json').read_text(encoding='utf-8')))
assert all(r['passed']for r in json.loads((T/'regression-storage.json').read_text(encoding='utf-8')))
assert all(len(r['passed'])==10 and not r['pageErrors']for r in json.loads((T/'regression-drafts.json').read_text(encoding='utf-8')))
assert all(r['passed']for r in json.loads((T/'regression-checkin.json').read_text(encoding='utf-8')))
assert (T/'review.md').read_text(encoding='utf-8').startswith('disposition: ship')
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=C,text=True).strip()=='367a42e1307f360d2284731a299c5862e54d5ae7'
assert not subprocess.check_output(['git','diff','--name-only'],cwd=C,text=True).strip()
for f,v in ui['sourceHashes'].items():assert hashlib.sha256((R/f).read_bytes()).hexdigest()==v,f
for f in ['app/index.html','app/js/app.js','app/js/api.js']:assert h(C/f)==h(T/'release-before'/f),'release baseline drift '+f
for f in ['app/js/app.js','app/js/api.js','app/js/save-status.js','app/css/save-status.css']:shutil.copyfile(R/f,C/f)
def include(s):
 return s.replace('<link rel="stylesheet" href="css/discussion-notes.css?v=JAPP100">','<link rel="stylesheet" href="css/discussion-notes.css?v=JAPP100">\n<link rel="stylesheet" href="css/save-status.css?v=JAPP135">',1).replace('<script src="js/discussion-notes.js?v=JAPP100"></script>','<script src="js/discussion-notes.js?v=JAPP100"></script>\n<script src="js/save-status.js?v=JAPP135"></script>',1)
assert (R/'app/index.html').read_text(encoding='utf-8-sig')==include((T/'before/app/index.html').read_text(encoding='utf-8-sig')),'unscoped root HTML edits'
(C/'app/index.html').write_text(include((T/'release-before/app/index.html').read_text(encoding='utf-8-sig')),encoding='utf-8')
subprocess.run(['node','scripts/build-static.mjs'],cwd=C,check=True);subprocess.run(['powershell','-NoProfile','-File','scripts/check-structure.ps1','-Built'],cwd=C,check=True)
prev=json.loads((R/'audit/checkin-cache-release-JAPP134/manifest.json').read_text(encoding='utf-8'));after={p.relative_to(C/'output/app').as_posix():h(p)for p in(C/'output/app').rglob('*')if p.is_file()}
added=sorted(set(after)-set(prev['publicAfter']));assert added==['css/save-status.css','js/save-status.js'];assert not set(prev['publicAfter'])-set(after)
changed=[f for f in after if after[f]!=prev['publicAfter'].get(f)];assert set(changed)=={'index.html','screen-review.html','js/app.js','js/api.js','js/save-status.js','css/save-status.css'}
m={**prev,'label':'J-APP-136','backend':[],'publicBefore':prev['publicAfter'],'publicAfter':after,'changed':changed,'added':added,'sourceAfter':{**prev['sourceAfter'],**{f:h(C/f)for f in ui['sourceHashes']}}};(H/'manifest.json').write_text(json.dumps(m,indent=2),encoding='utf-8')
for f in changed:
 d=H/'public'/f;d.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(C/'output/app'/f,d)
activate=(R/'audit/checkin-cache-release-JAPP134/activate.cjs').read_text(encoding='utf-8').replace('japp134','japp136').replace('JAPP134','JAPP136').replace('checkin-cache-JAPP136','save-status-JAPP136').replace('m.changed.length,4','m.changed.length,6').replace('Object.keys(m.publicAfter).length,88','Object.keys(m.publicAfter).length,90').replace('four staged files','six staged files').replace('publicFiles:88','publicFiles:90')
activate=activate.replace("for(const p of m.changed){", "for(const root of roots)for(const p of m.added){assert(!p.includes('..'));assert(!fs.existsSync(root+'/'+p),'unexpected existing added file '+p)}\n for(const p of m.changed){",1)
activate=activate.replace("if(changed){run('tar'", "if(changed){for(const root of roots)for(const p of m.added){assert(!p.includes('..'));const target=root+'/'+p;if(fs.existsSync(target))fs.unlinkSync(target)}run('tar'",1)
(H/'activate.cjs').write_text(activate,encoding='utf-8')
for f in ['verify-live.py','verify-final.py','verify-api.py']:
 (H/f).write_text((R/'audit/checkin-cache-release-JAPP134'/f).read_text(encoding='utf-8').replace('JAPP134','JAPP136').replace('88/88','90/90'),encoding='utf-8')
f=H/'verify-final.py';f.write_text(f.read_text(encoding='utf-8').replace("['index.html','screen-review.html','js/app.js','js/storage.js','js/boot.js','access-admin.html']","['index.html','screen-review.html','js/save-status.js','css/save-status.css','js/app.js','js/api.js','js/storage.js','access-admin.html']"),encoding='utf-8')
patch=''.join(''.join(difflib.unified_diff((T/'release-before'/f).read_text(encoding='utf-8-sig').splitlines(True),(C/f).read_text(encoding='utf-8-sig').splitlines(True),fromfile='a/'+f,tofile='b/'+f,n=1))for f in['app/index.html','app/js/app.js','app/js/api.js']);(T/'integration.patch').write_text(patch,encoding='utf-8')
result={'passed':True,'publicFiles':90,'changed':changed,'added':added,'rootHTMLUnrelatedChangeExcluded':True,'storageUnchanged':after['js/storage.js']==prev['publicAfter']['js/storage.js'],'backendChanges':0,'cashPanelUnchanged':after['access-admin.html']==prev['publicAfter']['access-admin.html'],'sourceHashes':{f:h(C/f)for f in ui['sourceHashes']}};(T/'build.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result))
