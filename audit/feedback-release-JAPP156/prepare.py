from pathlib import Path
import subprocess,shutil,json,hashlib
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent;C=R/'output/silk-launch-release';S=R/'output/feedback-module-JAPP155/source'
assert subprocess.check_output(['git','-C',str(C),'status','--porcelain','--untracked-files=no'],text=True)==''
for f in ['app/index.html','app/js/app.js','app/js/feedback-form.js']:shutil.copy2(S/f,C/f)
subprocess.run(['node','scripts/build-static.mjs'],cwd=C,check=True)
def hashes(base):
 out={}
 for p in base.rglob('*'):
  if p.is_file():
   b=p.read_bytes()
   if p.suffix in ['.html','.js','.css','.svg','.txt','.json','.prisma','.sql']:b=b.replace(b'\r\n',b'\n')
   out[p.relative_to(base).as_posix()]=hashlib.sha256(b).hexdigest()
 return out
m=json.loads((R/'audit/step-edit-release-JAPP154/manifest.json').read_text(encoding='utf-8'));m['label']='JAPP156';m['publicBefore']=m['publicAfter'];m['publicAfter']=hashes(C/'output/app');assert m['publicAfter']==hashes(S/'output/app')
m['changed']=sorted(p for p,h in m['publicAfter'].items()if m['publicBefore'].get(p)!=h);m['added']=sorted(set(m['publicAfter'])-set(m['publicBefore']));m['backend']=[]
assert len(m['publicAfter'])==98 and len(m['changed'])==4 and m['added']==['js/feedback-form.js'],m['changed']
for f in ['app/index.html','app/js/app.js','app/js/feedback-form.js']:m['sourceAfter'][f]=hashes((C/f).parent)[Path(f).name]
(H/'manifest.json').write_text(json.dumps(m,indent=2),encoding='utf-8')
for f in ['activate.cjs','verify-backup.cjs','verify-live.py','verify-api.py']:
 t=(R/'audit/step-edit-release-JAPP154'/f).read_text(encoding='utf-8').replace('JAPP154','JAPP156').replace('japp154','japp156')
 if f=='activate.cjs':t=t.replace('m.publicAfter).length,97','m.publicAfter).length,98').replace('publicFiles:97','publicFiles:98')
 if f=='verify-live.py':t=t.replace('97/97','98/98')
 (H/f).write_text(t,encoding='utf-8')
for p in m['changed']:
 target=H/'public'/p;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(C/'output/app'/p,target)
(H/'AUTHORIZATION.md').write_text('20 октября 2026. Альмира: «Понятно, перенеси J-APP-155 в приложение и продолжим со следующим пакетом именно по дизайну и удобству. Что ещё осталось по аудиту?» Выпускается только согласованный J-APP-155. Следующий дизайн-пакет — локально.\n',encoding='utf-8')
print(json.dumps({'changed':m['changed'],'added':m['added'],'approvedCandidateExact':True}))
