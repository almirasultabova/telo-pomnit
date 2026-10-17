from pathlib import Path
import shutil,subprocess,json,hashlib
ROOT=Path(__file__).resolve().parents[2];HERE=Path(__file__).parent;REL=ROOT/'output/silk-launch-release'
assert subprocess.check_output(['git','-C',str(REL),'rev-parse','HEAD'],text=True).strip()=='9994b28382fe353b60acaed2830dfa8a32543a27'
assert not subprocess.check_output(['git','-C',str(REL),'status','--porcelain'],text=True).strip()
source=ROOT/'backend/src/routes/admin.js';before=REL/'backend/src/routes/admin.js'
assert before.read_text(encoding='utf-8')==(ROOT/'output/participant-card-JAPP065/admin-before.js').read_text(encoding='utf-8')
hash=lambda p:hashlib.sha256(p.read_bytes().replace(b'\r\n',b'\n')).hexdigest()
m={'label':'J-APP-066','path':'src/routes/admin.js','before':hash(before),'after':hash(source),'publicUnchanged':json.loads((ROOT/'audit/map-release-JAPP063/manifest.json').read_text())['publicAfter']}
(HERE/'manifest.json').write_text(json.dumps(m,indent=2),encoding='utf-8')
for f in ['backend/src/routes/admin.js','scripts/test-participant-card.cjs','scripts/test-host-access.cjs']:
 shutil.copy2(ROOT/f,REL/f)
print('Only admin route and its two synthetic tests integrated; baseline exact')
