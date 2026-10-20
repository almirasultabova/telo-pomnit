from pathlib import Path
import subprocess,shutil,json,hashlib
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent;C=R/'output/silk-launch-release';S=R/'output/ai-history-ux-JAPP167/source'
FILES=['app/js/app.js','app/css/ux-personal.css','app/index.html','app/js/ai-delivery.js','backend/src/routes/ai.js']
def digest(p):
 data=p.read_bytes()
 if p.suffix in ['.html','.js','.css','.svg','.txt','.json','.prisma','.sql']:data=data.replace(b'\r\n',b'\n')
 return hashlib.sha256(data).hexdigest()
def hashes(base):return {p.relative_to(base).as_posix():digest(p)for p in base.rglob('*')if p.is_file()}
assert subprocess.check_output(['git','-C',str(C),'status','--porcelain','--untracked-files=no'],text=True)==''
approved=json.loads((R/'audit/ai-history-ux-JAPP167/manifest.json').read_text(encoding='utf-8'))
assert hashes(C/'output/app')==approved['publicBefore'];assert hashes(S/'output/app')==approved['publicAfter']
before=(C/FILES[-1]).read_text(encoding='utf-8');after=(S/FILES[-1]).read_text(encoding='utf-8')
assert before.replace("message: { type: 'string', minLength: 1, maxLength: 1000 }","message: { type: 'string', minLength: 1 }")==after and before!=after
m=json.loads((R/'audit/data-export-release-JAPP166/manifest.json').read_text(encoding='utf-8'));m['label']='JAPP168';m['previousCommit']=subprocess.check_output(['git','-C',str(C),'rev-parse','HEAD'],text=True).strip();m['sourceBefore']={f:digest(C/f)for f in FILES};m['publicBefore']=hashes(C/'output/app')
for f in FILES:shutil.copy2(S/f,C/f)
subprocess.run(['node','scripts/build-static.mjs'],cwd=C,check=True)
m['publicAfter']=hashes(C/'output/app');assert m['publicAfter']==approved['publicAfter'];m['backend']=[FILES[-1]];m['added']=[];m['changed']=sorted(p for p,h in m['publicAfter'].items()if m['publicBefore'][p]!=h)
assert len(m['publicAfter'])==98 and len(m['changed'])==5
for f in FILES:m['sourceAfter'][f]=digest(C/f)
m['previousAI']=m['protectedAI'];m['protectedAI']=digest(C/FILES[-1]);m['modelAndPromptUnchanged']=True
(H/'manifest.json').write_text(json.dumps(m,indent=2),encoding='utf-8')
for p in m['changed']:
 t=H/'public'/p;t.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(C/'output/app'/p,t)
(H/'backend').mkdir(exist_ok=True);shutil.copy2(C/FILES[-1],H/'backend/ai.js')
for name in ['verify-live.py','verify-api.py','verify-final.py']:
 t=(R/'audit/data-export-release-JAPP166'/name).read_text(encoding='utf-8').replace('JAPP166','JAPP168').replace('final 12 HTTPS','final 15 HTTPS').replace('approved J165','approved J167');(H/name).write_text(t,encoding='utf-8')
(H/'AUTHORIZATION.md').write_text('20 октября 2026. Альмира: «Да, перенеси J-APP-167 со всеми доработками в приложение и продолжим со следующим пакетом по дизайну и удобству». Публикуются все пять согласованных исходников J167, включая снятие серверного maxLength:1000. Следующий пакет готовится локально.\n',encoding='utf-8')
print(json.dumps({'changed':m['changed'],'exactApprovedCandidate':True,'backendOnlyRemovesMaxLength1000':True}))
