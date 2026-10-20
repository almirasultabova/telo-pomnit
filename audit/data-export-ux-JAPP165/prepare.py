from pathlib import Path
import subprocess,shutil,json
R=Path(__file__).resolve().parents[2];C=R/'output/silk-launch-release';S=R/'output/data-export-ux-JAPP165/source';H=Path(__file__).parent
assert not S.exists()
files=subprocess.check_output(['git','-C',str(C),'ls-files','-z']).decode().split('\0')
for f in files:
 if f and f.startswith(('app/','scripts/','site/','media/','backend/'))and(C/f).is_file():
  d=S/f;d.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(C/f,d)
p=S/'app/js/app.js';s=p.read_text(encoding='utf-8')
def replace(a,b,count=1):
 global s
 assert s.count(a)==count,(a,s.count(a));s=s.replace(a,b)
replace('let rightsRequest = 0;','let rightsRequest = 0;\nlet privatePreviewReturn = null;')
replace('rightsRequest++; clearPreparedDiaryPdf(); DataRightsApi.clear();','rightsRequest++; privatePreviewReturn = null; clearPreparedDiaryPdf(); DataRightsApi.clear();')
replace("downloadPrivateFile(JSON.stringify(data, null, 2), 'application/json', 'telo-server-data.json');","downloadPrivateFile(JSON.stringify(data, null, 2), 'application/json', 'telo-server-data.json', { title: 'Полная копия данных', caption: 'Это копия данных, сохранённых в вашем аккаунте. Сохраните файл, если он вам нужен.', returnId: 'data-export-json' });")
replace("}, 'Серверная выгрузка подготовлена.');","}, 'Копия подготовлена. Сохраните файл на открывшемся экране.', { button: 'data-export-json', label: 'Готовим копию…' });")
replace('    const pdf = await DataRightsApi.downloadDiaryPdf();','    clearPreparedDiaryPdf();\n    const pdf = await DataRightsApi.downloadDiaryPdf();',2)
replace("}, 'Дневник подготовлен в PDF. Ещё не отправленные записи устройства в него не входят.');","}, 'Дневник подготовлен в PDF. Ещё не отправленные записи устройства в него не входят.', { button: 'data-export-pdf', label: 'Готовим PDF…' });")
replace("'application/json', 'telo-local-pending.json'), 'Выгрузка неподтверждённых записей подготовлена.');","'application/json', 'telo-local-pending.json', { title: 'Неотправленные записи', caption: 'Здесь записи, ожидающие отправки, и сохранённые черновики с этого устройства. Сохранение файла ничего не отправляет.', returnId: 'data-export-local' }), 'Копия подготовлена. Сохраните файл на открывшемся экране.', { button: 'data-export-local', label: 'Готовим копию…' });")
replace("    if (request === rightsRequest) document.getElementById('data-rights-status').textContent = successText;","    if (request === rightsRequest) {\n      document.getElementById('data-rights-status').textContent = successText;\n      if (progress?.button === 'data-export-pdf' && currentScreen === 'data-rights') { const save=document.querySelector('.pdf-ready-panel button'); save?.focus({preventScroll:true}); save?.scrollIntoView({block:'nearest'}); }\n    }")
replace('async function performRightsAction(action, successText) {','async function performRightsAction(action, successText, progress = null) {')
replace("  const buttons = document.querySelectorAll('#data-rights-actions button'); buttons.forEach(button => button.disabled = true);","  const progressButton = document.getElementById(progress?.button), progressLabel = progressButton?.textContent;\n  if (progressButton) { progressButton.textContent = progress.label; progressButton.setAttribute('aria-busy', 'true'); document.getElementById('data-rights-status').textContent = progress.label; }\n  const buttons = document.querySelectorAll('#data-rights-actions button'); buttons.forEach(button => button.disabled = true);")
replace("      document.getElementById('data-rights-retry').hidden=false;","      document.getElementById('data-rights-retry').hidden=false;\n      if (progress && currentScreen === 'data-rights') { const status = document.getElementById('data-rights-status'); status.tabIndex = -1; status.focus({ preventScroll: true }); status.scrollIntoView({ block: 'nearest' }); }")
replace('finally { if (request === rightsRequest) { buttons.forEach(button => button.disabled = false);',"finally { if (request === rightsRequest) { if (progressButton) { progressButton.textContent = progressLabel; progressButton.removeAttribute('aria-busy'); } buttons.forEach(button => button.disabled = false);")
replace("  const preview=document.getElementById('screen-data-export-preview');","  const preview=document.getElementById('screen-data-export-preview'), restore=privatePreviewReturn; privatePreviewReturn=null;")
replace("  else goTo('data-rights',true); preview?.remove();","  else goTo('data-rights',true); preview?.remove();\n  if (restore && restore.owner === DataRightsApi.userId && restore.generation === Storage._generation && restore.request === rightsRequest) { const body=document.querySelector('#screen-data-rights .screen-scroll'); if(body) { body.scrollTop=restore.scroll; document.getElementById(restore.returnId)?.focus({preventScroll:true}); } }")
replace('function downloadPrivateFile(contents,type,filename) {','function downloadPrivateFile(contents,type,filename,options = {}) {')
replace("  document.getElementById('screen-data-export-preview')?.remove();\n  const screen=document.createElement", "  document.getElementById('screen-data-export-preview')?.remove();\n  privatePreviewReturn={ owner:DataRightsApi.userId,generation:Storage._generation,request:rightsRequest,scroll:document.querySelector('#screen-data-rights .screen-scroll')?.scrollTop||0,returnId:options.returnId };\n  const screen=document.createElement")
replace("  screen.querySelector('pre').textContent=contents; document.body.append(screen);","  screen.querySelector('.screen-title').textContent=options.title||'Копия данных';\n  if(options.caption)screen.querySelector('.screen-scroll>p').textContent=options.caption;\n  screen.querySelector('pre').textContent=contents; screen.querySelector('pre').tabIndex=0; screen.querySelector('pre').setAttribute('role','region'); screen.querySelector('pre').setAttribute('aria-label','Содержимое файла'); document.body.append(screen);")
replace('  container.prepend(panel);',"  const caption=container.closest('#screen-data-rights')?.querySelector('.data-export-caption');\n  if(caption)caption.after(panel);else container.prepend(panel);\n  const save=panel.querySelector('button');save.focus({preventScroll:true});save.scrollIntoView({block:'nearest'});")
replace('function clearPrivateConversationState() {','function clearPrivateConversationState() {\n  privatePreviewReturn = null;')
p.write_text(s,encoding='utf-8')
p=S/'app/css/ux-personal.css';p.write_text(p.read_text(encoding='utf-8')+'''
/* J-APP-165: prepared files and readable copy previews, scoped to export. */
#screen-data-rights .pdf-ready-panel{padding:16px 0;margin:12px 0 20px;border:0;border-top:1px solid var(--color-line);border-radius:0;background:transparent;color:var(--color-text)}
#screen-history .pdf-ready-panel{padding:16px;margin:12px 0 20px;border:1px solid var(--color-line);border-radius:var(--control-radius,16px);background:var(--color-paper);color:var(--color-text)}
.pdf-ready-panel button{scroll-margin-block:16px}
.pdf-ready-panel p{margin:0 0 12px;font:400 14px/1.6 var(--font-body)}
#screen-data-rights button:focus-visible,#screen-data-export-preview button:focus-visible,.pdf-ready-panel button:focus-visible{outline:2px solid var(--color-action);outline-offset:3px}
#screen-data-export-preview .private-preview-content{max-height:240px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;border-radius:12px}
#screen-data-rights #data-rights-status:focus{outline:none}
#screen-data-export-preview .private-preview-content:focus-visible{outline:2px solid var(--color-action);outline-offset:3px}
''',encoding='utf-8')
subprocess.run(['node','scripts/build-static.mjs'],cwd=S,check=True)
changed=[f for f in files if f and(S/f).is_file()and(S/f).read_bytes()!=(C/f).read_bytes()];assert sorted(changed)==['app/css/ux-personal.css','app/js/app.js'],changed
(H/'baseline.json').write_text(json.dumps({'baseCommit':subprocess.check_output(['git','-C',str(C),'rev-parse','HEAD'],text=True).strip(),'sourceChanges':changed,'backendChanged':False,'apiChanged':False},indent=2),encoding='utf-8');print('PASS two existing UI sources; PDF contents, export schema, auth and deletion APIs unchanged')
