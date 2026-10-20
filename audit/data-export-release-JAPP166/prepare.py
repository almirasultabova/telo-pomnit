from pathlib import Path
import subprocess,shutil,json,hashlib
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent;C=R/'output/silk-launch-release';S=R/'output/data-export-ux-JAPP165/source'
assert subprocess.check_output(['git','-C',str(C),'status','--porcelain','--untracked-files=no'],text=True)==''
def hashes(base):return {p.relative_to(base).as_posix():hashlib.sha256(p.read_bytes().replace(b'\r\n',b'\n')if p.suffix in['.html','.js','.css','.svg','.txt','.json','.prisma','.sql']else p.read_bytes()).hexdigest()for p in base.rglob('*')if p.is_file()}
approved=json.loads((R/'audit/data-export-ux-JAPP165/manifest.json').read_text(encoding='utf-8'))
assert hashes(S/'output/app')==approved['publicAfter']
assert hashes(C/'output/app')==approved['publicBefore']
for f in['app/js/app.js','app/css/ux-personal.css']:shutil.copy2(S/f,C/f)
subprocess.run(['node','scripts/build-static.mjs'],cwd=C,check=True)
m=json.loads((R/'audit/habitual-release-JAPP164/manifest.json').read_text(encoding='utf-8'));m['label']='JAPP166';m['publicBefore']=m['publicAfter'];m['publicAfter']=hashes(C/'output/app');assert m['publicAfter']==approved['publicAfter']
m['changed']=sorted(p for p,h in m['publicAfter'].items()if m['publicBefore'].get(p)!=h);m['added']=sorted(set(m['publicAfter'])-set(m['publicBefore']));m['backend']=[];assert len(m['publicAfter'])==98 and len(m['changed'])==4 and not m['added']
for f in['app/js/app.js','app/css/ux-personal.css']:m['sourceAfter'][f]=hashes((C/f).parent)[Path(f).name]
(H/'manifest.json').write_text(json.dumps(m,indent=2),encoding='utf-8')
for name in['activate.cjs','verify-backup.cjs','verify-live.py','verify-api.py','verify-final.py']:
 t=(R/'audit/habitual-release-JAPP164'/name).read_text(encoding='utf-8').replace('JAPP164','JAPP166').replace('japp164','japp166').replace('approved J163 live, next runtime absent','approved J165 live, next runtime absent');(H/name).write_text(t,encoding='utf-8')
for p in m['changed']:
 target=H/'public'/p;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(C/'output/app'/p,target)
(H/'AUTHORIZATION.md').write_text('20 октября2026. Альмира ответила «да давай» на предложение перенести J-APP-165 и продолжить аудит. Публикуется точный локально проверенный J165; следующий пакет только локально.\n',encoding='utf-8')
print(json.dumps({'changed':m['changed'],'files':98,'approvedCandidateExact':True}))
