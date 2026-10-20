from pathlib import Path
import subprocess,shutil,json,hashlib
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent;C=R/'output/silk-launch-release';S=R/'output/habitual-ux-JAPP163/source'
assert subprocess.check_output(['git','-C',str(C),'status','--porcelain','--untracked-files=no'],text=True)==''
def hashes(base):return {p.relative_to(base).as_posix():hashlib.sha256(p.read_bytes().replace(b'\r\n',b'\n')if p.suffix in['.html','.js','.css','.svg','.txt','.json','.prisma','.sql']else p.read_bytes()).hexdigest()for p in base.rglob('*')if p.is_file()}
approved=json.loads((R/'audit/habitual-ux-JAPP163/manifest.json').read_text(encoding='utf-8'))
assert hashes(S/'output/app')==approved['publicAfter']
assert hashes(C/'output/app')==approved['publicBefore']
for f in['app/js/app.js','app/css/ux-diary-path.css']:shutil.copy2(S/f,C/f)
subprocess.run(['node','scripts/build-static.mjs'],cwd=C,check=True)
m=json.loads((R/'audit/discuss-release-JAPP162/manifest.json').read_text(encoding='utf-8'));m['label']='JAPP164';m['publicBefore']=m['publicAfter'];m['publicAfter']=hashes(C/'output/app');assert m['publicAfter']==approved['publicAfter']
m['changed']=sorted(p for p,h in m['publicAfter'].items()if m['publicBefore'].get(p)!=h);m['added']=sorted(set(m['publicAfter'])-set(m['publicBefore']));m['backend']=[];assert len(m['publicAfter'])==98 and len(m['changed'])==4 and not m['added']
for f in['app/js/app.js','app/css/ux-diary-path.css']:m['sourceAfter'][f]=hashes((C/f).parent)[Path(f).name]
(H/'manifest.json').write_text(json.dumps(m,indent=2),encoding='utf-8')
for name in['activate.cjs','verify-backup.cjs','verify-live.py','verify-api.py','verify-final.py']:
 t=(R/'audit/discuss-release-JAPP162'/name).read_text(encoding='utf-8').replace('JAPP162','JAPP164').replace('japp162','japp164').replace('approved J161 live, J163 runtime absent','approved J163 live, next runtime absent');(H/name).write_text(t,encoding='utf-8')
for p in m['changed']:
 target=H/'public'/p;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(C/'output/app'/p,target)
(H/'AUTHORIZATION.md').write_text('20 октября2026. Альмира: «Да, перенеси J-APP-163 в приложение и продолжим со следующим пакетом по дизайну и удобству». Публикуется точный одобренный J163; следующий пакет выполняется локально.\n',encoding='utf-8')
print(json.dumps({'changed':m['changed'],'files':98,'approvedCandidateExact':True}))
