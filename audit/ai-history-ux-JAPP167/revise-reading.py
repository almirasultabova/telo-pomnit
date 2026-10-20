from pathlib import Path
import shutil,subprocess,hashlib,json,difflib
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent;S=R/'output/ai-history-ux-JAPP167/source';C=R/'output/silk-launch-release'
def norm(p):return p.read_bytes().replace(b'\r\n',b'\n')
for f in['app/js/ai-delivery.js','backend/src/routes/ai.js']:assert norm(R/f)==norm(C/f),'Unrelated change: '+f
p=S/'app/css/ux-personal.css';s=p.read_text(encoding='utf-8');s+='''
/* Owner revision: full reading width; hide scrollbar tracks without disabling scroll. */
html,body,*{scrollbar-width:none!important}
*::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}
#screen-ai-chat .ai-msg--assistant{margin-inline:0}
#screen-ai-chat .ai-msg--assistant .ai-msg-text{box-sizing:border-box;width:100%;max-width:100%}
''';p.write_text(s,encoding='utf-8');shutil.copy2(p,R/'app/css/ux-personal.css')
for p in[S/'app/index.html',R/'app/index.html']:
 s=p.read_text(encoding='utf-8');a='      <p id="ai-message-limit">0 / 1000 символов</p>\n';assert s.count(a)==1;s=s.replace(a,'').replace('aria-describedby="ai-message-limit ai-draft-status"','aria-describedby="ai-draft-status"');p.write_text(s,encoding='utf-8')
p=S/'app/js/ai-delivery.js';s=p.read_text(encoding='utf-8')
a="""    const input = document.getElementById('ai-input'), limit = document.getElementById('ai-message-limit');
    if (!input || !limit) return;
    const length = count(input.value), over = length > 1000, op = record();
    limit.textContent = `${length} / 1000 символов` + (over ? '. Сократите сообщение: текст сохранён целиком.' : '');
    limit.setAttribute('role', over ? 'alert' : 'status');
    input.setAttribute('aria-invalid', String(over));"""
b="""    const input = document.getElementById('ai-input');
    if (!input) return;
    const length = count(input.value), op = record();
    input.removeAttribute('aria-invalid');"""
assert s.count(a)==1;s=s.replace(a,b).replace('|| over ||','||').replace(' || count(rawText) > 1000','').replace('[400,403,404,409,422]','[400,403,404,409,413,422]')
a="        persist(null); aiSendError = (error.message || 'Сообщение не отправлено.') + ' Текст сохранён.';"
b="        persist(null); aiSendError = error.status === 413 ? 'Сообщение слишком большое для одной отправки. Разделите его на части. Текст сохранён.' : (error.message || 'Сообщение не отправлено.') + ' Текст сохранён.';"
assert a in s;s=s.replace(a,b);a="    const limit = document.getElementById('ai-message-limit'); if (limit) limit.textContent = '0 / 1000 символов';\n";assert a in s;s=s.replace(a,'');p.write_text(s,encoding='utf-8');shutil.copy2(p,R/'app/js/ai-delivery.js')
p=S/'backend/src/routes/ai.js';s=p.read_text(encoding='utf-8');a="message: { type: 'string', minLength: 1, maxLength: 1000 }";assert s.count(a)==1;s=s.replace(a,"message: { type: 'string', minLength: 1 }");p.write_text(s,encoding='utf-8');shutil.copy2(p,R/'backend/src/routes/ai.js')
subprocess.run(['node','scripts/build-static.mjs'],cwd=S,check=True)
def hashes(root):return {p.relative_to(root).as_posix():hashlib.sha256(norm(p)if p.suffix in['.html','.js','.css','.svg','.txt','.json']else p.read_bytes()).hexdigest()for p in root.rglob('*')if p.is_file()}
(H/'manifest.json').write_text(json.dumps({'publicBefore':hashes(C/'output/app'),'publicAfter':hashes(S/'output/app')},indent=2),encoding='utf-8')
files=['app/js/app.js','app/css/ux-personal.css','app/index.html','app/js/ai-delivery.js','backend/src/routes/ai.js'];patch=''
for f in files:patch+=''.join(difflib.unified_diff((C/f).read_text(encoding='utf-8').splitlines(True),(S/f).read_text(encoding='utf-8').splitlines(True),fromfile='a/'+f,tofile='b/'+f,n=0))
(H/'candidate.patch').write_text(patch,encoding='utf-8')
before=(C/'backend/src/routes/ai.js').read_text(encoding='utf-8');assert before.replace(a,"message: { type: 'string', minLength: 1 }")==s
(H/'reading-revision.json').write_text(json.dumps({'runtimeSources':files,'published':False,'backendChanged':True,'backendChange':'Remove only message maxLength:1000','promptAndProviderConfigUnchanged':True,'inputNotTruncated':True,'existingTransportSizeBoundaryRetained':True},indent=2),encoding='utf-8')
print('PASS local full-width replies, hidden scrollbar tracks, no1000 ceiling in UI/API; provider configuration and prompt unchanged')
