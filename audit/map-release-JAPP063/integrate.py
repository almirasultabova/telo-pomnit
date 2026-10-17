from pathlib import Path
import shutil,json,hashlib,subprocess
ROOT=Path(__file__).resolve().parents[2];HERE=Path(__file__).parent
REL=ROOT/'output/silk-launch-release';CAND=ROOT/'output/performance-JAPP062/source'
assert subprocess.check_output(['git','-C',str(REL),'rev-parse','HEAD'],text=True).strip()=='28e0d8a24e0b17eed58b1cefad349746e5a0f2d0'
assert not subprocess.check_output(['git','-C',str(REL),'status','--porcelain'],text=True).strip()
baseline=json.loads((ROOT/'audit/stream-states-JAPP060/manifest.json').read_text(encoding='utf-8'))['publicAfter']
(HERE/'baseline.json').write_text(json.dumps(baseline,indent=2),encoding='utf-8')
for base in [ROOT,REL]:
 f=base/'app/js/app.js';s=f.read_text(encoding='utf-8')
 for side in ['front','back']:
  old=f'body-{side}-owner.png';new=f'body-{side}-owner-lossless.webp'
  assert s.count(old)==1,(base,old)
  s=s.replace(old,new)
  shutil.copy2(CAND/'media/app/redesign'/new,base/'media/app/redesign'/new)
 f.write_text(s,encoding='utf-8')
assert (REL/'app/js/app.js').read_bytes()==(CAND/'app/js/app.js').read_bytes()
print('Only two body URLs and two approved lossless images integrated; originals retained')
