from pathlib import Path
import subprocess,shutil,json,hashlib
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent;C=R/'output/silk-launch-release';S=R/'output/discuss-reading-JAPP169/source'
FILES=['app/js/app.js','app/js/discussion-notes.js','app/css/discussion-notes.css']
def hashes(base):return {p.relative_to(base).as_posix():hashlib.sha256(p.read_bytes().replace(b'\r\n',b'\n')if p.suffix in['.html','.js','.css','.svg','.txt','.json','.prisma','.sql']else p.read_bytes()).hexdigest()for p in base.rglob('*')if p.is_file()}
assert subprocess.check_output(['git','-C',str(C),'status','--porcelain','--untracked-files=no'],text=True)==''
approved=json.loads((R/'audit/discuss-reading-JAPP169/manifest.json').read_text(encoding='utf-8'));assert hashes(C/'output/app')==approved['publicBefore'];assert hashes(S/'output/app')==approved['publicAfter']
m=json.loads((R/'audit/ai-history-release-JAPP168/manifest.json').read_text(encoding='utf-8'));m['label']='JAPP170';m['previousCommit']=subprocess.check_output(['git','-C',str(C),'rev-parse','HEAD'],text=True).strip();m['publicBefore']=hashes(C/'output/app');m['sourceBefore']={f:hashes((C/f).parent)[Path(f).name]for f in FILES}
for f in FILES:shutil.copy2(S/f,C/f)
subprocess.run(['node','scripts/build-static.mjs'],cwd=C,check=True)
m['publicAfter']=hashes(C/'output/app');assert m['publicAfter']==approved['publicAfter'];m['backend']=[];m['added']=[];m['changed']=sorted(p for p,h in m['publicAfter'].items()if m['publicBefore'][p]!=h);assert len(m['publicAfter'])==98 and len(m['changed'])==5
for f in FILES:m['sourceAfter'][f]=hashes((C/f).parent)[Path(f).name]
(H/'manifest.json').write_text(json.dumps(m,indent=2),encoding='utf-8')
for name in ['activate.cjs','verify-backup.cjs','verify-live.py','verify-api.py','verify-final.py']:
 t=(R/'audit/data-export-release-JAPP166'/name).read_text(encoding='utf-8').replace('JAPP166','JAPP170').replace('japp166','japp170').replace('m.changed.length,4','m.changed.length,5').replace('four staged files','five staged files').replace('final 12 HTTPS','final 15 HTTPS').replace('approved J165','approved J169');(H/name).write_text(t,encoding='utf-8')
# Verify both archives and all 10 affected previous hashes before the first install.
p=H/'activate.cjs';t=p.read_text(encoding='utf-8');a="run('tar',['-tzf',backup+'/app-before.tar.gz']);run('tar',['-tzf',backup+'/recovery-before.tar.gz']);";b=a+"\n for(const name of ['app-before.tar.gz','recovery-before.tar.gz'])for(const p of m.changed){const bytes=run('tar',['-xOzf',backup+'/'+name,'./'+p]);assert.equal(createHash('sha256').update(bytes.replace(/\\r\\n/g,'\\n')).digest('hex'),m.publicBefore[p],'backup '+p)}";assert t.count(a)==1;t=t.replace(a,b);p.write_text(t,encoding='utf-8')
for p in m['changed']:
 t=H/'public'/p;t.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(C/'output/app'/p,t)
(H/'AUTHORIZATION.md').write_text('20 октября2026. Альмира: «Да, теперь понятно, так и показывай дальше. Перенеси J-APP-169 в приложение и продолжим со следующим пакетом по дизайну и удобству». Публикуются три точных runtime-исходника J169. Следующий пакет — только локально; наглядные сравнения с отметками согласованы как формат показа.\n',encoding='utf-8')
print(json.dumps({'changed':m['changed'],'approvedExact':True,'backendChanged':False}))
