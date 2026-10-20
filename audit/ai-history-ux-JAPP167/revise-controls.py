from pathlib import Path
import subprocess,shutil,json,hashlib,difflib
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent;S=R/'output/ai-history-ux-JAPP167/source';C=R/'output/silk-launch-release'
html='      <button id="ai-access-refresh" type="button" class="btn btn--ghost btn--sm">Обновить доступ и историю</button>\n'
for p in[S/'app/index.html',R/'app/index.html']:
 s=p.read_text(encoding='utf-8');assert s.count(html)==1;p.write_text(s.replace(html,''),encoding='utf-8')
p=S/'app/js/app.js';s=p.read_text(encoding='utf-8').replace("button.className = 'btn btn--outline btn--sm'; button.textContent = 'Повторить загрузку'","button.className = 'btn btn--sm'; button.textContent = 'Попробовать ещё раз'")
line="  document.getElementById('ai-access-refresh').disabled = aiPending || aiHistoryLoading;\n";assert s.count(line)==1;s=s.replace(line,'')
s=s.replace("document.getElementById('ai-access-refresh').focus({preventScroll:true})","document.getElementById('ai-history-select').focus({preventScroll:true})")
line="document.getElementById('ai-access-refresh')?.addEventListener('click', refreshAiScreen);\n";assert s.count(line)==1;s=s.replace(line,'');p.write_text(s,encoding='utf-8');shutil.copy2(p,R/'app/js/app.js')
p=S/'app/css/ux-personal.css';s=p.read_text(encoding='utf-8')
a='#screen-ai-chat #ai-history-retry{min-height:44px;margin:0 0 8px;font-size:13px}'
b='#screen-ai-chat #ai-history-retry{display:block;box-sizing:border-box;width:auto;max-width:100%;min-height:44px;height:auto;margin:0 0 8px;padding:10px 16px;border:0;border-radius:12px;background:var(--color-sage);color:var(--color-action);font:500 14px/1.5 var(--font-body);white-space:normal;overflow-wrap:normal;text-align:center}'
assert a in s;s=s.replace(a,b).replace('#screen-ai-chat #ai-history-select:focus-visible,#screen-ai-chat #ai-history-retry:focus-visible{outline:2px solid var(--color-action);outline-offset:3px}', '#screen-ai-chat #ai-history-select:focus-visible{outline:2px solid var(--color-action);outline-offset:3px}\n#screen-ai-chat #ai-history-retry:focus-visible{outline:2px solid var(--color-action);outline-offset:-3px}')
p.write_text(s,encoding='utf-8');shutil.copy2(p,R/'app/css/ux-personal.css')
subprocess.run(['node','scripts/build-static.mjs'],cwd=S,check=True)
def hashes(root):return {p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes().replace(b'\r\n',b'\n')if p.suffix in['.html','.js','.css','.svg','.txt','.json']else p.read_bytes()).hexdigest()for p in root.rglob('*')if p.is_file()}
before=hashes(C/'output/app');after=hashes(S/'output/app');assert len(after)==98 and sorted(f for f in after if before[f]!=after[f])==['css/ux-personal.css','index.html','js/app.js','screen-review.html']
(H/'manifest.json').write_text(json.dumps({'publicBefore':before,'publicAfter':after},indent=2),encoding='utf-8')
patch='';sources=['app/js/app.js','app/css/ux-personal.css','app/index.html']
for f in sources:patch+=''.join(difflib.unified_diff((C/f).read_text(encoding='utf-8').splitlines(True),(S/f).read_text(encoding='utf-8').splitlines(True),fromfile='a/'+f,tofile='b/'+f,n=0))
(H/'candidate.patch').write_text(patch,encoding='utf-8')
(H/'control-revision.json').write_text(json.dumps({'sources':sources,'publicChanged':4,'published':False,'approval':'Owner questioned need for two buttons; keep one error-only retry','rootIndexPreservedExceptExactButtonRemoval':True},indent=2),encoding='utf-8')
print('PASS local revision: constant refresh removed; one error-only retry, single inset keyboard focus')
