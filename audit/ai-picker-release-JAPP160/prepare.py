from pathlib import Path
import subprocess,shutil,json,hashlib
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent;C=R/'output/silk-launch-release';S=R/'output/ai-picker-JAPP159/source'
assert subprocess.check_output(['git','-C',str(C),'status','--porcelain','--untracked-files=no'],text=True)==''
for f in['app/js/app.js','app/css/styles.css']:shutil.copy2(S/f,C/f)
subprocess.run(['node','scripts/build-static.mjs'],cwd=C,check=True)
def hashes(base):return {p.relative_to(base).as_posix():hashlib.sha256(p.read_bytes().replace(b'\r\n',b'\n')if p.suffix in['.html','.js','.css','.svg','.txt','.json','.prisma','.sql']else p.read_bytes()).hexdigest()for p in base.rglob('*')if p.is_file()}
m=json.loads((R/'audit/scale-release-JAPP158/manifest.json').read_text(encoding='utf-8'));m['label']='JAPP160';m['publicBefore']=m['publicAfter'];m['publicAfter']=hashes(C/'output/app');assert m['publicAfter']==hashes(S/'output/app')
m['changed']=sorted(p for p,h in m['publicAfter'].items()if m['publicBefore'].get(p)!=h);m['added']=sorted(set(m['publicAfter'])-set(m['publicBefore']));m['backend']=[];assert len(m['publicAfter'])==98 and len(m['changed'])==4 and not m['added'],m['changed']
for f in['app/js/app.js','app/css/styles.css']:m['sourceAfter'][f]=hashes((C/f).parent)[Path(f).name]
(H/'manifest.json').write_text(json.dumps(m,indent=2),encoding='utf-8')
for name in['activate.cjs','verify-backup.cjs','verify-live.py','verify-api.py']:
 t=(R/'audit/scale-release-JAPP158'/name).read_text(encoding='utf-8').replace('JAPP158','JAPP160').replace('japp158','japp160')
 if name=='activate.cjs':t=t.replace('m.changed.length,3','m.changed.length,4').replace('three staged files','four staged files')
 (H/name).write_text(t,encoding='utf-8')
for p in m['changed']:
 target=H/'public'/p;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(C/'output/app'/p,target)
(H/'AUTHORIZATION.md').write_text('20 октября2026. Альмира: «Да, перенеси J-APP-159 в приложение и продолжим со следующим пакетом по дизайну и удобству». Выпускается точный одобренный выбор дневника для AI; следующий пакет локально.\n',encoding='utf-8');print(json.dumps({'changed':m['changed'],'publicFiles':98,'approvedCandidateExact':True}))
