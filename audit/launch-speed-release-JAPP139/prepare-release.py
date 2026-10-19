from pathlib import Path
import hashlib,json,shutil,subprocess
R=Path(__file__).resolve().parents[2];C=R/'output/silk-launch-release';S=R/'output/launch-speed-JAPP138/source';H=Path(__file__).parent;T=R/'audit/launch-speed-JAPP138'
def h(p):
 b=p.read_bytes()
 if p.suffix in ['.html','.js','.css','.json','.txt','.svg','.prisma','.sql']:b=b.replace(b'\r\n',b'\n')
 return hashlib.sha256(b).hexdigest()
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=C,text=True).strip()=='c28b7d45fd1f3ab911c2f31ef96cf0b26c1abac6'
assert not subprocess.check_output(['git','diff','--name-only'],cwd=C,text=True).strip()
assert len(json.loads((T/'browser-results.json').read_text(encoding='utf-8')))==20
assert all(t['passed']for t in json.loads((T/'startup-results.json').read_text(encoding='utf-8')))
prev=json.loads((R/'audit/save-status-release-JAPP136/manifest.json').read_text(encoding='utf-8'))
before={p.relative_to(C/'output/app').as_posix():h(p)for p in(C/'output/app').rglob('*')if p.is_file()}
assert before==prev['publicAfter'],'previous build drift'
candidate=json.loads((T/'manifest.json').read_text(encoding='utf-8'))
for f,v in candidate.items():
 assert hashlib.sha256((S/f).read_bytes()).hexdigest()==v,f
 if (C/f).exists():
  dest=H/'before'/f;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(C/f,dest)
 shutil.copyfile(S/f,C/f)
 if f!='app/index.html':shutil.copyfile(S/f,R/f)
rootHtml=R/'app/index.html';text=rootHtml.read_text(encoding='utf-8')
for old,new in [('launch.css?v=silk-20261014','launch.css?v=JAPP138'),('launch.js?v=silk-return-25-20261014','launch.js?v=JAPP138')]:
 assert text.count(old)==1,old
 text=text.replace(old,new)
rootHtml.write_text(text,encoding='utf-8',newline='\n')
tests=(R/'scripts/test-launch.cjs').read_text(encoding='utf-8')
tests=tests.replace("'.mp4?v=silk-native-20261014'","'.mp4?v=JAPP138'").replace("'flower-720.mp4'","'flower-fast-standard.mp4'")
tests=tests.replace('unverified identity and startup errors cannot open home or start media','unverified identity and startup errors cannot open home or play media')
newcase="""  const early = fixture({play:'pending'});
  assert(early.video.src.includes('flower-fast-tall.mp4'));
  assert(!early.video.running && early.layer.hidden === false);
  early.video.error = new Error('preload 404'); early.video.emit('error');
  assert(!early.layer.dataset.media && !early.motion.src);
  early.api.ready();
  assert.equal(early.layer.dataset.media, 'image-loading');
  early.motion.emit('load'); early.advance(6000);
  assert(early.layer.hidden && !early.app.inert);
  const cancelled = fixture(); cancelled.api.cancel(); cancelled.api.ready();
  assert(!cancelled.video.src && cancelled.layer.hidden && cancelled.timers.size === 0);
  results.push('preload before auth: no play or fallback; early media failure recovered after auth; cancel cleans preloaded source');
  assert(css.includes('object-fit:cover'));
"""
tests=tests.replace('  console.log(JSON.stringify',newcase+'  console.log(JSON.stringify')
for base in [R,C,S]:(base/'scripts/test-launch.cjs').write_text(tests,encoding='utf-8',newline='\n')
subprocess.run(['node','scripts/test-launch.cjs'],cwd=C,check=True)
subprocess.run(['node','scripts/build-static.mjs'],cwd=C,check=True)
subprocess.run(['powershell','-NoProfile','-File','scripts/check-structure.ps1','-Built'],cwd=C,check=True)
after={p.relative_to(C/'output/app').as_posix():h(p)for p in(C/'output/app').rglob('*')if p.is_file()}
expected={p.relative_to(S/'output/app').as_posix():h(p)for p in(S/'output/app').rglob('*')if p.is_file()}
assert after==expected,'candidate and release build differ'
added=sorted(set(after)-set(before));changed=sorted(f for f in after if after[f]!=before.get(f))
assert set(changed)=={'index.html','screen-review.html','css/launch.css','js/launch.js','media/app/launch/flower-fast-standard.mp4','media/app/launch/flower-fast-tall.mp4'},changed
assert len(added)==2 and len(before)==90 and len(after)==92
m={**prev,'label':'J-APP-139','backend':[],'publicBefore':before,'publicAfter':after,'changed':changed,'added':added,'sourceAfter':{**prev['sourceAfter'],**{f:h(C/f)for f in candidate}}}
(H/'manifest.json').write_text(json.dumps(m,indent=2),encoding='utf-8')
for f in changed:
 dest=H/'public'/f;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(C/'output/app'/f,dest)
activation=(R/'audit/save-status-release-JAPP136/activate.cjs').read_text(encoding='utf-8').replace('japp136','japp139').replace('JAPP136','JAPP139').replace('save-status-JAPP139','launch-speed-JAPP139').replace('Object.keys(m.publicBefore).length,88','Object.keys(m.publicBefore).length,90').replace('Object.keys(m.publicAfter).length,90','Object.keys(m.publicAfter).length,92').replace('exact 88-file baselines','exact 90-file baselines').replace('publicFiles:90','publicFiles:92')
(H/'activate.cjs').write_text(activation,encoding='utf-8')
for f in ['verify-live.py','verify-api.py']:(H/f).write_text((R/'audit/save-status-release-JAPP136'/f).read_text(encoding='utf-8').replace('JAPP136','JAPP139').replace('90/90','92/92'),encoding='utf-8')
print(json.dumps({'publicFiles':len(after),'changed':changed,'added':added,'candidateMatches':True}))
