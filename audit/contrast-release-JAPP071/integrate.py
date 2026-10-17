from pathlib import Path
import json,hashlib,shutil,subprocess
ROOT=Path(__file__).resolve().parents[2];HERE=Path(__file__).parent;REL=ROOT/'output/silk-launch-release';OUT=ROOT/'output/contrast-release-JAPP071';OUT.mkdir(exist_ok=True)
assert subprocess.check_output(['git','-C',str(REL),'rev-parse','HEAD'],text=True).strip()=='11dc5978def05e0379090af2073182ce10bda54c'
assert not subprocess.check_output(['git','-C',str(REL),'status','--porcelain'],text=True).strip()
approved=json.loads((ROOT/'output/contrast-JAPP070/verification.json').read_text(encoding='utf-8'))['changedStyles']
assert len(approved)==6
for item in approved:
 p=item['file'];assert p.startswith('app/css/')
 assert hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==item['sha256'],'candidate drift '+p
 baseline=ROOT/'output/contrast-JAPP070/before/css'/Path(p).name
 assert (REL/p).read_bytes().replace(b'\r\n',b'\n')==baseline.read_bytes().replace(b'\r\n',b'\n'),'release baseline drift '+p
for item in approved:shutil.copy2(ROOT/item['file'],REL/item['file'])
(HERE/'baseline.json').write_text(json.dumps(json.loads((ROOT/'audit/participant-release-JAPP066/manifest.json').read_text(encoding='utf-8'))['publicUnchanged'],indent=2),encoding='utf-8')
(HERE/'approved.json').write_text(json.dumps(approved,indent=2),encoding='utf-8')
print('Exactly six approved CSS integrated into clean release clone; root unrelated files preserved')
