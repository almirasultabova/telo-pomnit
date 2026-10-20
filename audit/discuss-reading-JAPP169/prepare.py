from pathlib import Path
import subprocess,shutil,json
R=Path(__file__).resolve().parents[2];C=R/'output/silk-launch-release';S=R/'output/discuss-reading-JAPP169/source';H=Path(__file__).parent
assert not S.exists(),'Candidate exists'
files=subprocess.check_output(['git','-C',str(C),'ls-files','-z']).decode().split('\0')
for f in files:
 if f and f.startswith(('app/','scripts/','site/','media/','backend/'))and(C/f).is_file():
  t=S/f;t.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(C/f,t)
def replace(s,a,b):assert s.count(a)==1,(a,s.count(a));return s.replace(a,b)
p=S/'app/js/discussion-notes.js';s=p.read_text(encoding='utf-8')
s=replace(s,'  let sourceRows=[],sourceOffset=0,sourceMore=false;','  let sourceRows=[],sourceOffset=0,sourceMore=false;\n  let listReturn=null,detailReturn=null;\n  function focusHere(node){if(currentScreen===\'discuss\'&&ownerNow()===owner&&node?.isConnected)node.focus({preventScroll:true});}\n  function rememberList(key){listReturn={tab,scroll:body.scrollTop,key};}\n  function openDetail(id,key){rememberList(key);detailReturn=null;detail(id);}')
s=replace(s,"p.classList.toggle('dq-error',error);p.textContent=text;}","p.classList.toggle('dq-error',error);p.setAttribute('role',error?'alert':'status');p.tabIndex=-1;p.textContent=text;if(error&&currentScreen==='discuss'){p.scrollIntoView({block:'nearest'});focusHere(p);}}")
s=replace(s,"function lockUI(value){busy=value;if(!screen)return;","function lockUI(value){busy=value;if(!screen)return;body.setAttribute('aria-busy',String(value));")
s=replace(s,"screen.dataset.view=title;}","screen.dataset.view=title;heading.tabIndex=-1;focusHere(heading);}")
s=replace(s,"function list(message=''){","function list(message='',restore=false){")
s=replace(s,"view('К разбору',()=>{goBack();switchTab('diary');});","if(restore&&listReturn)tab=listReturn.tab;view('К разбору',()=>{goBack();switchTab('diary');});")
s=replace(s,"button('Написать',()=>editor('new'),'dq-button dq-primary'),button('Из заметки',()=>{startDraft('new');pickSources();},'dq-button dq-secondary')","button('Написать',()=>{rememberList('write');editor('new');},'dq-button dq-primary'),button('Из заметки',()=>{rememberList('source');startDraft('new');pickSources();},'dq-button dq-secondary')")
s=replace(s,"body.append(actions);const next=meeting();","actions.children[0].dataset.listKey='write';actions.children[1].dataset.listKey='source';body.append(actions);const next=meeting();")
s=replace(s,"()=>{tab=value;list();},'dq-tab'","()=>{tab=value;list();focusHere(body.querySelector('[aria-pressed=true]'));},'dq-tab'")
s=replace(s,"if(!listLoaded){status('Загружаем записи…');}","if(!listLoaded&&!message){status('Загружаем записи…');}")
s=replace(s,"else if(!shown.length)","else if(listLoaded&&!shown.length)")
s=replace(s,"item.append(button(row.text||row.source?.excerpt||'',()=>detail(row.id),'dq-open'));","const title=button(row.text||row.source?.excerpt||'',()=>openDetail(row.id,'title:'+row.id),'dq-open');title.dataset.listKey='title:'+row.id;item.append(title);")
s=replace(s,"const a=button('Открыть',()=>detail(row.id),'dq-link');","const a=button('Открыть',()=>openDetail(row.id,'open:'+row.id),'dq-link');a.dataset.listKey='open:'+row.id;")
s=replace(s,"body.append(privacy());if(message)status(message);","body.append(privacy());if(message)status(message,true);if(restore&&listReturn){body.scrollTop=listReturn.scroll;focusHere([...body.querySelectorAll('[data-list-key]')].find(n=>n.dataset.listKey===listReturn.key));}")
s=replace(s,"body.append(button('Повторить загрузку',loadList,'dq-link'));","const retry=button('Попробовать ещё раз',loadList,'dq-button dq-secondary');body.append(retry);")
s=replace(s,"view(editing==='new'?'Новая запись':'Редактировать',()=>{keepDraft();list();});","view(editing==='new'?'Новая запись':'Редактировать',()=>{keepDraft();if(editing!=='new'&&rows.some(r=>r.id===editing))detail(editing,'',true);else list('',true);});")
s=replace(s,"const pending=structuredClone(draft.pending);keepDraft();lockUI(true);","const pending=structuredClone(draft.pending);keepDraft();lockUI(true);status('Сохраняем запись…');")
s=replace(s,"function detail(id,message=''){","function detail(id,message='',restore=false){")
s=replace(s,"enter();view('К разбору',()=>list());body.append(el('p','dq-meta',dateLabel(row.createdAt)+(row.done?' · Обсудили':'')));","enter();view('К разбору',()=>list('',true));body.append(el('p','dq-meta',dateLabel(row.createdAt)+(row.done?' · Обсудили':'')));if(message)status(message);")
s=replace(s,"button('Редактировать',()=>editor(id),'dq-button dq-secondary')","button('Редактировать',()=>{detailReturn={id,scroll:body.scrollTop};editor(id);},'dq-button dq-secondary')")
s=replace(s,"body.append(actions,privacy());if(message)status(message);","body.append(actions,privacy());if(restore&&detailReturn?.id===id){body.scrollTop=detailReturn.scroll;focusHere(actions.firstElementChild);}")
s=replace(s,"rows=[];listLoaded=false;draft=null;selectedSource=null;","rows=[];listLoaded=false;listReturn=null;detailReturn=null;draft=null;selectedSource=null;")
p.write_text(s,encoding='utf-8')
p=S/'app/css/discussion-notes.css';s=p.read_text(encoding='utf-8')+'''\n/* JAPP169: readable save/load feedback; existing palette and type scale. */
#screen-discuss .dq-status{padding:12px 14px;border-radius:12px;background:#e7ebdf;overflow-wrap:anywhere}
#screen-discuss .dq-status.dq-error{background:#f2e8e2;color:#783c30}
#screen-discuss .dq-detail-source+.dq-status{margin-bottom:16px}
#screen-discuss .dq-header h1:focus{outline:none}
''';p.write_text(s,encoding='utf-8')
subprocess.run(['node','scripts/build-static.mjs'],cwd=S,check=True)
changed=[f for f in files if f and(S/f).is_file()and(S/f).read_bytes()!=(C/f).read_bytes()];assert sorted(changed)==['app/css/discussion-notes.css','app/js/discussion-notes.js'],changed
(H/'source-baseline.json').write_text(json.dumps({'baseCommit':subprocess.check_output(['git','-C',str(C),'rev-parse','HEAD'],text=True).strip(),'sourceChanges':changed,'backendChanged':False,'apiChanged':False,'published':False},indent=2),encoding='utf-8')
print('PASS two sources, existing backend/API unchanged; local only')
