from pathlib import Path
import subprocess,shutil,json,hashlib
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent;C=R/'output/silk-launch-release';S=R/'output/scale-touch-JAPP157/source'
assert subprocess.check_output(['git','-C',str(C),'status','--porcelain','--untracked-files=no'],text=True)==''
f='app/css/form-layout.css';shutil.copy2(S/f,C/f);subprocess.run(['node','scripts/build-static.mjs'],cwd=C,check=True)
def hashes(base):
 return {p.relative_to(base).as_posix():hashlib.sha256(p.read_bytes().replace(b'\r\n',b'\n')if p.suffix in['.html','.js','.css','.svg','.txt','.json','.prisma','.sql']else p.read_bytes()).hexdigest()for p in base.rglob('*')if p.is_file()}
m=json.loads((R/'audit/feedback-release-JAPP156/manifest.json').read_text(encoding='utf-8'));m['label']='JAPP158';m['publicBefore']=m['publicAfter'];m['publicAfter']=hashes(C/'output/app');assert m['publicAfter']==hashes(S/'output/app')
m['changed']=sorted(p for p,h in m['publicAfter'].items()if m['publicBefore'].get(p)!=h);m['added']=sorted(set(m['publicAfter'])-set(m['publicBefore']));m['backend']=[];assert len(m['publicAfter'])==98 and len(m['changed'])==3 and not m['added'],m['changed']
m['sourceAfter'][f]=hashes((C/f).parent)[Path(f).name];(H/'manifest.json').write_text(json.dumps(m,indent=2),encoding='utf-8')
for name in['activate.cjs','verify-backup.cjs','verify-live.py','verify-api.py']:
 t=(R/'audit/feedback-release-JAPP156'/name).read_text(encoding='utf-8').replace('JAPP156','JAPP158').replace('japp156','japp158')
 if name=='activate.cjs':t=t.replace('m.changed.length,4','m.changed.length,3').replace('m.publicBefore).length,97','m.publicBefore).length,98').replace('97-file baselines, four staged files','98-file baselines, three staged files')
 (H/name).write_text(t,encoding='utf-8')
for p in m['changed']:
 target=H/'public'/p;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(C/'output/app'/p,target)
(H/'AUTHORIZATION.md').write_text('20 октября2026. Альмира: «Да, перенеси J-APP-157 в приложение и продолжим со следующим пакетом по дизайну и удобству». Выпускается точный одобренный CSS обеих анкет. Следующий пакет локально.\n',encoding='utf-8');print(json.dumps({'changed':m['changed'],'publicFiles':98,'approvedCandidateExact':True}))
