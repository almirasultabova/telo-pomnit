from pathlib import Path
import json,hashlib,shutil,subprocess
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent;C=R/'output/silk-launch-release';S=R/'output/route-polish-JAPP153/source'
assert subprocess.check_output(['git','-C',str(C),'status','--porcelain','--untracked-files=no'],text=True)==''
for f in ['app/js/after-meeting.js','app/css/after-meeting.css']:
 shutil.copy2(S/f,C/f)
subprocess.run(['node','scripts/build-static.mjs'],cwd=C,check=True)
def hashes(base):
 out={}
 for p in base.rglob('*'):
  if p.is_file():
   b=p.read_bytes()
   if p.suffix in ['.html','.js','.css','.svg','.txt','.json','.prisma','.sql']:b=b.replace(b'\r\n',b'\n')
   out[p.relative_to(base).as_posix()]=hashlib.sha256(b).hexdigest()
 return out
m=json.loads((R/'audit/motion-release-JAPP152/manifest.json').read_text(encoding='utf-8'));m['label']='JAPP154';m['publicBefore']=m['publicAfter'];m['publicAfter']=hashes(C/'output/app')
assert m['publicAfter']==hashes(S/'output/app')
m['changed']=sorted(p for p,h in m['publicAfter'].items()if m['publicBefore'].get(p)!=h);m['added']=sorted(set(m['publicAfter'])-set(m['publicBefore']));m['backend']=[]
assert len(m['publicAfter'])==97 and len(m['changed'])==4 and not m['added'],m['changed']
for f in ['app/js/after-meeting.js','app/css/after-meeting.css']:m['sourceAfter'][f]=hashes((C/f).parent)[Path(f).name]
(H/'manifest.json').write_text(json.dumps(m,indent=2),encoding='utf-8')
for f in ['activate.cjs','verify-backup.cjs','verify-live.py','verify-api.py']:
 t=(R/'audit/motion-release-JAPP152'/f).read_text(encoding='utf-8').replace('JAPP152','JAPP154').replace('japp152','japp154')
 if f=='activate.cjs':t=t.replace('m.changed.length,5','m.changed.length,4').replace('m.publicBefore).length,96','m.publicBefore).length,97').replace('exact 96-file baselines, five staged files','exact 97-file baselines, four staged files')
 (H/f).write_text(t,encoding='utf-8')
for p in m['changed']:
 target=H/'public'/p;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(C/'output/app'/p,target)
(H/'AUTHORIZATION.md').write_text('20 октября 2026. Прямое поручение Альмиры: «Да, перенеси J-APP-153 в приложение и продолжим со следующим пакетом по аудиту». Выпуск J-APP-154 переносит только два согласованных исходника J-APP-153. Следующий пакет — отдельно локально.\n',encoding='utf-8')
print(json.dumps({'changed':m['changed'],'publicFiles':len(m['publicAfter']),'approvedCandidateExact':True}))
