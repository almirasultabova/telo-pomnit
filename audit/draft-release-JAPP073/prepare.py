from pathlib import Path
import hashlib, json, shutil, subprocess

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).parent
REL = ROOT/'output/silk-launch-release'
OUT = ROOT/'output/draft-release-JAPP073'
OUT.mkdir(exist_ok=True)
assert subprocess.check_output(['git','-C',str(REL),'rev-parse','HEAD'],text=True).strip()=='6dd79405f8e6f073b14e57377856ebcb2f0eb405'
assert not subprocess.check_output(['git','-C',str(REL),'status','--porcelain'],text=True).strip()
approved = json.loads((ROOT/'output/checkin-draft-JAPP072/source.json').read_text(encoding='utf-8'))
for f,h in approved.items(): assert hashlib.sha256((ROOT/f).read_bytes()).hexdigest()==h, 'candidate changed: '+f
for f in ['app/js/storage.js','app/js/boot.js']:
    assert (ROOT/f).read_bytes().replace(b'\r\n',b'\n')==(REL/f).read_bytes().replace(b'\r\n',b'\n')
shutil.copy2(ROOT/'app/js/app.js', REL/'app/js/app.js')
shutil.copytree(ROOT/'audit/checkin-draft-JAPP072', REL/'audit/checkin-draft-JAPP072', dirs_exist_ok=True, ignore=shutil.ignore_patterns('__pycache__'))
before = json.loads((ROOT/'audit/contrast-release-JAPP071/manifest.json').read_text(encoding='utf-8'))['publicAfter']
(HERE/'baseline.json').write_text(json.dumps(before,indent=2),encoding='utf-8')
(HERE/'approved.json').write_text(json.dumps(approved,indent=2),encoding='utf-8')
activate=(ROOT/'audit/contrast-release-JAPP071/activate.cjs').read_text(encoding='utf-8')
activate=activate.replace('071','073').replace("m.changed.length,8", "m.changed.length,3").replace('contrast-JAPP073','draft-JAPP073').replace('eight staged files','three staged files').replace('Existing CSS assets','Existing JS asset')
if not (HERE/'activate.cjs').exists(): (HERE/'activate.cjs').write_text(activate,encoding='utf-8')
verify=(ROOT/'audit/contrast-release-JAPP071/verify-live.py').read_text(encoding='utf-8').replace('JAPP071-7dfc0cf','JAPP073')
(HERE/'verify-live.py').write_text(verify,encoding='utf-8')
print('Only approved app.js integrated into clean 6dd7940; existing storage/backend unchanged')
