from pathlib import Path
import subprocess,shutil,json
R=Path(__file__).resolve().parents[2];C=R/'output/silk-launch-release';S=R/'output/discuss-ux-JAPP161/source';H=Path(__file__).parent
assert not S.exists(),'Candidate already exists'
files=subprocess.check_output(['git','-C',str(C),'ls-files','-z']).decode().split('\0')
for f in files:
 if f and f.startswith(('app/','scripts/','site/','media/','backend/'))and(C/f).is_file():
  dest=S/f;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(C/f,dest)
p=S/'app/js/discussion-notes.js';s=p.read_text(encoding='utf-8')
a='  function drawSources(){';b='  function drawSources(scroll=0,returnKey=null){\n    if(!ownerNow()||ownerNow()!==owner)return;';assert s.count(a)==1;s=s.replace(a,b)
a="card.append(button('Выбрать фрагмент',()=>openSource(row),'dq-link'));body.append(card);"
b="const choose=button('Выбрать фрагмент',()=>openSource(row),'dq-link');choose.dataset.sourceKey=row.source+':'+row.id;card.append(choose);body.append(card);";assert s.count(a)==1;s=s.replace(a,b)
a="    if(sourceMore)body.append(button('Показать ещё',()=>pickSources(true),'dq-link'));body.append(button('Написать отдельно',()=>editor(editing,true),'dq-link'));"
b=a+"\n    body.scrollTop=scroll;if(returnKey)[...body.querySelectorAll('[data-source-key]')].find(item=>item.dataset.sourceKey===returnKey)?.focus({preventScroll:true});";assert s.count(a)==1;s=s.replace(a,b)
a='    if(busy)return;const s=session();lockUI(true);\n    try{const full=await Api.getDiaryHistoryRecord'
b="    if(busy)return;const s=session(),returnTo={scroll:body.scrollTop,key:row.source+':'+row.id};lockUI(true);\n    try{const full=await Api.getDiaryHistoryRecord";assert s.count(a)==1;s=s.replace(a,b)
a='selectFragment({...full,type:full.source,label:full.title});';b='selectFragment({...full,type:full.source,label:full.title},returnTo);';assert s.count(a)==1;s=s.replace(a,b)
a='  function selectFragment(row){';b='  function selectFragment(row,returnTo){';assert s.count(a)==1;s=s.replace(a,b)
a="view('Выбрать фрагмент',()=>pickSources());";b="view('Выбрать фрагмент',()=>drawSources(returnTo.scroll,returnTo.key));";assert s.count(a)==1;s=s.replace(a,b)
a="    const selection=()=>{lastSelection=field.value.slice(field.selectionStart,field.selectionEnd).trim();use.disabled=!lastSelection;selected.textContent=lastSelection?'Выбранный фрагмент: '+lastSelection:'Фрагмент пока не выделен.';};field.onselect=selection;field.onkeyup=selection;field.onpointerup=selection;body.append(use,button('Взять всю запись',()=>attach(row.text),'dq-button dq-secondary dq-all-text'));"
b="""    const preview=el('details','dq-fragment-preview');preview.hidden=true;preview.append(el('summary','','Посмотреть выделенный фрагмент'));const quote=el('blockquote','');quote.tabIndex=0;quote.setAttribute('role','region');quote.setAttribute('aria-label','Выделенный фрагмент');preview.append(quote);body.append(preview);
    const selection=()=>{lastSelection=field.value.slice(field.selectionStart,field.selectionEnd).trim();use.disabled=!lastSelection;selected.textContent=lastSelection?'Выделено: '+lastSelection.length+' симв.'+(lastSelection.length>6000?' Для сохранения сократите копию до 6000 символов на следующем экране.':''):'Фрагмент пока не выделен.';preview.hidden=!lastSelection;quote.textContent=lastSelection;};field.onselect=selection;field.onkeyup=selection;field.onpointerup=selection;
    const actions=el('div','dq-fragment-actions');actions.append(use,button('Взять всю запись',()=>attach(row.text),'dq-button dq-secondary dq-all-text'));body.append(actions);""";assert s.count(a)==1;s=s.replace(a,b);p.write_text(s,encoding='utf-8')
p=S/'app/css/discussion-notes.css';s=p.read_text(encoding='utf-8');s+='''
/* J-APP-161: concise selection status; full excerpt remains available explicitly. */
.dq-fragment-preview {margin:0 0 16px;border-bottom:1px solid var(--color-line)}
.dq-fragment-preview[hidden] {display:none}
.dq-fragment-preview summary {min-height:44px;display:flex;align-items:center;cursor:pointer;font:500 13px/1.5 var(--font-body);color:var(--color-action);text-decoration:underline;text-underline-offset:3px}
.dq-fragment-preview blockquote {max-height:160px;overflow-y:auto;margin:0 0 12px;padding:12px;border-radius:12px;background:var(--color-sage);color:var(--color-text);font:400 14px/1.65 var(--font-body);white-space:pre-wrap;overflow-wrap:anywhere}
.dq-fragment-preview blockquote:focus-visible {outline:2px solid var(--color-action);outline-offset:2px}
.dq-fragment-actions {display:grid;gap:8px}
.dq-fragment-actions .dq-all-text {margin:0}
.dq-fragment-actions .dq-button {min-height:52px;border-radius:var(--control-radius,16px);font-size:15px}
''';p.write_text(s,encoding='utf-8');subprocess.run(['node','scripts/build-static.mjs'],cwd=S,check=True)
changed=[f for f in files if f and(S/f).is_file()and(S/f).read_bytes()!=(C/f).read_bytes()];assert sorted(changed)==['app/css/discussion-notes.css','app/js/discussion-notes.js'],changed
(H/'baseline.json').write_text(json.dumps({'baseCommit':subprocess.check_output(['git','-C',str(C),'rev-parse','HEAD'],text=True).strip(),'sourceChanges':changed,'backendChanged':False,'apiChanged':False},indent=2),encoding='utf-8');print('PASS exact two existing sources; source texts/backend/API unchanged')
