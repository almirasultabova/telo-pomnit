// Owner-only preparation for a discussion. No host sharing, AI or notifications.
(() => {
  'use strict';
  let screen,body,heading,back,rows=[],owner=null,epoch=0,busy=false,tab='ready',editing='new',draft=null,selectedSource=null,lastSelection='',listLoaded=false;
  let sourceRows=[],sourceOffset=0,sourceMore=false;
  const scope=id=>'discussion-v1:'+id;
  const ownerNow=()=>Api.userId&&String(Storage._userId)===String(Api.userId)&&Api.isAuthed()&&!Api.clubBlocked?String(Api.userId)+':'+Api._authGeneration:null;
  const session=()=>({epoch,owner:ownerNow()});
  const valid=s=>s.epoch===epoch&&s.owner&&s.owner===ownerNow()&&owner===s.owner;
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const svg=path=>`<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  const arrow=svg('<path d="M5 12h14m-6-6 6 6-6 6"/>'),chevron=svg('<path d="m14 6-6 6 6 6"/>'),lock=svg('<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'),bookmark=svg('<path d="M6 4h12v17l-6-4-6 4z"/>');
  const dateLabel=date=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',timeZone:'Europe/Moscow'}).format(new Date(date));
  const sourceDate=s=>dateLabel(s.day+'T12:00:00+03:00');
  const rowValid=r=>r&&typeof r.id==='string'&&typeof r.clientId==='string'&&typeof r.text==='string'&&typeof r.done==='boolean'&&Number.isInteger(r.revision)&&r.revision>0&&Number.isFinite(Date.parse(r.createdAt))&&(!r.source||['body','state','reaction','meeting'].includes(r.source.type)&&typeof r.source.id==='string'&&typeof r.source.excerpt==='string'&&typeof r.source.label==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(r.source.day));
  function button(text,fn,cls='dq-button'){const b=el('button',cls,text);b.type='button';b.onclick=fn;return b;}
  function status(text,error=false){let p=body.querySelector('#dq-status');if(!p){p=el('p','dq-status');p.id='dq-status';p.setAttribute('role','status');body.append(p);}p.classList.toggle('dq-error',error);p.textContent=text;}
  function privacy(){const p=el('p','dq-private');p.innerHTML=lock;p.append(document.createTextNode('Только для вас. Ведущим не отправляется.'));return p;}
  function lockUI(value){busy=value;if(!screen)return;screen.querySelectorAll('button,input,textarea').forEach(b=>b.disabled=value);if(!value){if(document.getElementById('dq-save'))syncEditor();const selection=document.getElementById('dq-use-selection');if(selection)selection.disabled=!lastSelection;}}
  function view(title,backFn){heading.textContent=title;body.replaceChildren();body.scrollTop=0;back.onclick=()=>{if(!busy){document.activeElement?.blur();backFn();}};screen.dataset.view=title;}
  function enter(){if(currentScreen!=='discuss')goTo('discuss');}
  function setRow(row){const i=rows.findIndex(r=>r.id===row.id);if(i<0)rows.unshift(row);else rows[i]=row;}
  function meeting(){
    if(typeof programAccess==='undefined')return null;
    const next=(programAccess.streams||[]).filter(s=>s.canAttend).flatMap(s=>s.meetings||[]).filter(m=>/разбор/iu.test(m.topic||'')&&Date.parse(m.date)>Date.now()).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date))[0];
    if(!next)return null;const n=el('div','dq-meeting');n.append(el('span','','Ближайший разбор'),el('strong','',new Intl.DateTimeFormat('ru-RU',{weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'}).format(new Date(next.date))+' · МСК'));return n;
  }
  function list(message=''){
    if(!ownerNow())return;enter();view('К разбору',()=>{goBack();switchTab('diary');});
    body.append(el('p','dq-intro','Сохраните то, что хочется обсудить на встрече. Можно пока не искать точные слова.'));
    const actions=el('div','dq-start-actions');actions.append(button('Написать',()=>editor('new'),'dq-button dq-primary'),button('Из заметки',()=>{startDraft('new');pickSources();},'dq-button dq-secondary'));body.append(actions);const next=meeting();if(next)body.append(next);
    const tabs=el('div','dq-tabs');tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Записи к разбору');for(const [value,title]of [['ready','К встрече'],['done','Обсудили']]){const b=button(title,()=>{tab=value;list();},'dq-tab');b.setAttribute('aria-pressed',String(tab===value));tabs.append(b);}body.append(tabs);
    const shown=rows.filter(r=>r.done===(tab==='done'));
    if(!listLoaded){status('Загружаем записи…');}
    else if(!shown.length){const empty=el('div','dq-empty');const icon=el('div','dq-empty-icon');icon.innerHTML=bookmark;empty.append(icon,el('h2','',tab==='done'?'Здесь будет то, что вы обсудили':'Что хочется обсудить?'),el('p','',tab==='done'?'После встречи можно отметить запись — она останется здесь.':'Ситуацию, чувство или вопрос можно сохранить здесь и вернуться перед разбором.'));body.append(empty);}
    for(const row of shown){const item=el('article','dq-record');item.append(el('p','dq-meta',dateLabel(row.createdAt)));item.append(button(row.text||row.source?.excerpt||'',()=>detail(row.id),'dq-open'));if(row.source&&row.text)item.append(el('p','dq-list-quote',row.source.excerpt));const bottom=el('div','dq-record-bottom');bottom.append(el('span','dq-meta',row.source?'Из заметки · '+row.source.label:'Своя запись'));const a=button('Открыть',()=>detail(row.id),'dq-link');a.innerHTML='Открыть '+arrow;bottom.append(a);item.append(bottom);body.append(item);}
    body.append(privacy());if(message)status(message);
  }
  async function loadList(){
    if(busy||!ownerNow())return;const s=session();list();lockUI(true);
    try{const data=await Api.getDiscussionNotes();if(!valid(s))return;if(!Array.isArray(data)||!data.every(rowValid))throw Error('Invalid response');rows=data;listLoaded=true;list();}
    catch{if(valid(s)){list('Не удалось загрузить записи. Уже открытые записи остались на экране.');body.append(button('Повторить загрузку',loadList,'dq-link'));}}
    finally{if(valid(s))lockUI(false);}
  }
  function startDraft(id){
    editing=id;const row=rows.find(r=>r.id===id);draft=Storage.getFormDraft(scope(id))||{clientId:row?.clientId||crypto.randomUUID(),text:row?.text||'',source:row?.source?structuredClone(row.source):null,revision:row?.revision||null,pending:null};
  }
  function keepDraft(){if(!draft||!ownerNow())return false;const ok=Storage.saveFormDraft(scope(editing),draft);const p=body.querySelector('#dq-draft-status');if(p)p.textContent=window.ScreenReviewMode?'Учебный черновик только в этом просмотре.':ok?'Черновик сохранён на этом устройстве.':'Черновик пока только в открытом приложении. Не закрывайте его до сохранения.';return ok;}
  function syncEditor(){const save=document.getElementById('dq-save');if(save)save.disabled=busy||!ownerNow()||!(draft?.text.trim()||draft?.source?.excerpt.trim())||draft.text.length>6000||(draft.source?.excerpt.length||0)>6000;}
  function editor(id='new',resume=false){
    if(!ownerNow())return;if(!resume)startDraft(id);enter();view(editing==='new'?'Новая запись':'Редактировать',()=>{keepDraft();list();});
    const label=el('label','dq-label','Что хочется обсудить?');label.htmlFor='dq-text';body.append(label,el('p','dq-help','Вопрос, ситуация или то, что сейчас чувствуете.'));
    const field=el('textarea','dq-field');field.id='dq-text';field.rows=5;field.maxLength=6000;field.placeholder='Можно начать с того, что произошло…';field.value=draft.text;body.append(field);const ds=el('p','dq-draft-status');ds.id='dq-draft-status';ds.setAttribute('role','status');body.append(ds);
    if(draft.source){const source=el('section','dq-excerpt'),top=el('div','dq-excerpt-top');top.append(el('h2','','Фрагмент заметки'),button('Убрать',()=>{draft.source=null;keepDraft();editor(editing,true);},'dq-link'));source.append(top,el('p','dq-meta',draft.source.label+' · '+sourceDate(draft.source)));const l=el('label','dq-sr','Фрагмент заметки');l.htmlFor='dq-excerpt';const t=el('textarea','dq-excerpt-field');t.id='dq-excerpt';t.rows=3;t.maxLength=6000;t.value=draft.source.excerpt;t.oninput=()=>{draft.source.excerpt=t.value;keepDraft();syncEditor();};source.append(l,t,el('p','dq-help','Можно сократить или изменить. Исходная заметка останется целой.'));body.append(source);if(t.value.length>6000)body.append(el('p','dq-status dq-error','Сократите фрагмент до 6000 символов, чтобы сохранить запись.'));}
    else body.append(button('Добавить фрагмент заметки',()=>{keepDraft();pickSources();},'dq-link dq-source-link'));
    const prompts=el('details','dq-prompts');prompts.append(el('summary','','Если трудно начать'),el('p','','Что произошло? Что вы тогда заметили? К чему хочется вернуться на встрече?'));body.append(prompts,privacy());const save=button(draft.pending?'Повторить сохранение':'Сохранить для себя',saveDraft,'dq-button dq-primary');save.id='dq-save';body.append(save);field.oninput=()=>{draft.text=field.value;keepDraft();syncEditor();};syncEditor();if(Storage.getFormDraft(scope(editing)))keepDraft();
  }
  const contentPayload=()=>({text:draft.text.trim(),source:draft.source&&draft.source.excerpt.trim()?{type:draft.source.type,id:draft.source.id,excerpt:draft.source.excerpt.trim()}:null});
  function matches(row,payload){return row.text===payload.text&&JSON.stringify(row.source?{type:row.source.type,id:row.source.id,excerpt:row.source.excerpt}:null)===JSON.stringify(payload.source);}
  async function saveDraft(){
    if(busy||!ownerNow()||!draft)return;const s=session(),oldEditing=editing;
    if(!draft.pending)draft.pending={id:editing,body:{...contentPayload(),...(editing==='new'?{clientId:draft.clientId}:{revision:draft.revision})}};
    const pending=structuredClone(draft.pending);keepDraft();lockUI(true);
    try{
      const row=await(pending.id==='new'?Api.createDiscussionNote(pending.body):Api.updateDiscussionNote(pending.id,pending.body));if(!valid(s))return;
      if(!rowValid(row)||!matches(row,pending.body)||(pending.id==='new'?row.clientId!==pending.body.clientId:row.id!==pending.id))throw Error('Unconfirmed response');setRow(row);listLoaded=true;
      const editedAfterRequest=!matches(row,contentPayload());Storage.clearFormDraft(scope(oldEditing));
      if(editedAfterRequest){editing=row.id;draft={...draft,clientId:row.clientId,revision:row.revision,pending:null};keepDraft();lockUI(false);editor(editing,true);status('Первая версия сохранена. Изменённый текст остался черновиком — проверьте его перед новым сохранением.');}
      else{draft=null;lockUI(false);detail(row.id,'Запись сохранена для вас.');}
    }catch(e){if(!valid(s))return;lockUI(false);
      if(e.status===409||e.statusCode===409){draft.pending=null;keepDraft();status('Сохранённая запись изменилась. Ваш текст остался в форме. Обновите сохранённую версию и проверьте изменения.',true);body.append(button('Обновить сохранённую версию',reloadRevision,'dq-link'));}
      else{status('Не удалось подтвердить сохранение. Текст остался у вас. Нажмите «Повторить сохранение».',true);document.getElementById('dq-save').textContent='Повторить сохранение';}
    }finally{if(valid(s)&&busy)lockUI(false);}
  }
  async function reloadRevision(){
    if(busy)return;const s=session();lockUI(true);
    try{let row;if(editing==='new'){const all=await Api.getDiscussionNotes();row=all.find(r=>r.clientId===draft.clientId);}else row=await Api.getDiscussionNote(editing);if(!valid(s))return;if(!rowValid(row))throw Error('No saved version');const before=editing;editing=row.id;draft.revision=row.revision;draft.pending=null;Storage.clearFormDraft(scope(before));setRow(row);keepDraft();lockUI(false);editor(editing,true);const existing=el('details','dq-prompts');existing.append(el('summary','','Сохранённая версия'),el('p','',row.text||row.source?.excerpt||''));body.append(existing);status('Сохранённая версия обновлена. Ваш текст остался черновиком — сравните его перед сохранением.');}
    catch{if(valid(s))status('Не удалось обновить сохранённую версию. Черновик остался у вас.',true);}finally{if(valid(s))lockUI(false);}
  }
  async function pickSources(append=false){
    if(busy||!ownerNow())return;const s=session();if(!append){sourceRows=[];sourceOffset=0;}enter();view('Из заметки',()=>editor(editing,true));body.append(el('p','dq-intro','Выберите запись, затем оставьте только то, к чему хочется вернуться.'));status('Загружаем заметки…');lockUI(true);
    try{const data=await Api.searchDiaryHistory({period:'all',kind:'all',limit:10,offset:sourceOffset});if(!valid(s))return;if(!Array.isArray(data.entries))throw Error('Invalid history');sourceRows=append?[...sourceRows,...data.entries]:data.entries;sourceOffset=sourceRows.length;sourceMore=data.hasMore;drawSources();}
    catch{if(valid(s)){body.querySelector('#dq-status')?.remove();status('Не удалось загрузить заметки. Ваш черновик остался у вас.',true);body.append(button('Повторить загрузку',()=>pickSources(append),'dq-link'));}}finally{if(valid(s))lockUI(false);}
  }
  function drawSources(scroll=0,returnKey=null){
    if(!ownerNow()||ownerNow()!==owner)return;
    view('Из заметки',()=>editor(editing,true));body.append(el('p','dq-intro','Выберите запись, затем оставьте только то, к чему хочется вернуться.'));
    const textRows=sourceRows.filter(r=>typeof r.text==='string'&&r.text.trim());
    for(const row of textRows){const card=el('article','dq-source-record');card.append(el('p','dq-meta',row.title+' · '+dateLabel(row.day+'T12:00:00+03:00')),el('p','dq-source-copy',row.text));const choose=button('Выбрать фрагмент',()=>openSource(row),'dq-link');choose.dataset.sourceKey=row.source+':'+row.id;card.append(choose);body.append(card);}
    if(!textRows.length)body.append(el('p','dq-intro',sourceMore?'На этой странице нет записей с текстом. Можно посмотреть следующие.':'Пока нет заметок с текстом. Можно написать отдельно.'));
    if(sourceMore)body.append(button('Показать ещё',()=>pickSources(true),'dq-link'));body.append(button('Написать отдельно',()=>editor(editing,true),'dq-link'));
    body.scrollTop=scroll;if(returnKey)[...body.querySelectorAll('[data-source-key]')].find(item=>item.dataset.sourceKey===returnKey)?.focus({preventScroll:true});
  }
  async function openSource(row){
    if(busy)return;const s=session(),returnTo={scroll:body.scrollTop,key:row.source+':'+row.id};lockUI(true);
    try{const full=await Api.getDiaryHistoryRecord(row.source,row.id);if(!valid(s))return;if(!full?.text?.trim())throw Error('Empty source');lockUI(false);selectFragment({...full,type:full.source,label:full.title},returnTo);}
    catch{if(valid(s))status('Не удалось открыть заметку. Выберите другую запись или попробуйте ещё раз.',true);}finally{if(valid(s))lockUI(false);}
  }
  function selectFragment(row,returnTo){
    selectedSource=row;lastSelection='';view('Выбрать фрагмент',()=>drawSources(returnTo.scroll,returnTo.key));body.append(el('p','dq-meta',row.label+' · '+sourceDate(row)));const label=el('label','dq-label','Что взять из этой записи?');label.htmlFor='dq-source-text';body.append(label,el('p','dq-help','Выделите нужные слова в тексте. Или возьмите всю запись и сократите её на следующем экране.'));const field=el('textarea','dq-field dq-selection');field.id='dq-source-text';field.readOnly=true;field.value=row.text;field.rows=8;body.append(field);const selected=el('p','dq-selection-status','Фрагмент пока не выделен.');selected.setAttribute('role','status');body.append(selected);const use=button('Взять выделенное',()=>attach(lastSelection),'dq-button dq-primary');use.id='dq-use-selection';use.disabled=true;
    const preview=el('details','dq-fragment-preview');preview.hidden=true;preview.append(el('summary','','Посмотреть выделенный фрагмент'));const quote=el('blockquote','');quote.tabIndex=0;quote.setAttribute('role','region');quote.setAttribute('aria-label','Выделенный фрагмент');preview.append(quote);body.append(preview);
    const selection=()=>{lastSelection=field.value.slice(field.selectionStart,field.selectionEnd).trim();use.disabled=!lastSelection;selected.textContent=lastSelection?'Выделено: '+lastSelection.length+' симв.'+(lastSelection.length>6000?' Для сохранения сократите копию до 6000 символов на следующем экране.':''):'Фрагмент пока не выделен.';preview.hidden=!lastSelection;quote.textContent=lastSelection;};field.onselect=selection;field.onkeyup=selection;field.onpointerup=selection;
    const actions=el('div','dq-fragment-actions');actions.append(use,button('Взять всю запись',()=>attach(row.text),'dq-button dq-secondary dq-all-text'));body.append(actions);
  }
  function attach(text){if(!text.trim())return;draft.source={type:selectedSource.type,id:selectedSource.id,label:selectedSource.label,day:selectedSource.day,excerpt:text.trim()};keepDraft();editor(editing,true);}
  function detail(id,message=''){
    const row=rows.find(r=>r.id===id);if(!row){list();return;}enter();view('К разбору',()=>list());body.append(el('p','dq-meta',dateLabel(row.createdAt)+(row.done?' · Обсудили':'')));if(row.text)body.append(el('h2','dq-detail-heading','Что хочется обсудить'),el('p','dq-full-text',row.text));if(row.source){const quote=el('section','dq-detail-source');quote.append(el('h2','','Из моей заметки'),el('p','dq-meta',row.source.label+' · '+sourceDate(row.source)),el('blockquote','',row.source.excerpt));body.append(quote);}const actions=el('div','dq-detail-actions');actions.append(button('Редактировать',()=>editor(id),'dq-button dq-secondary'),button(row.done?'Вернуть к встрече':'Отметить: обсудили',()=>markDone(row),'dq-link'));body.append(actions,privacy());if(message)status(message);
  }
  async function markDone(row){
    if(busy||!ownerNow())return;const s=session(),done=!row.done;lockUI(true);
    try{const result=await Api.updateDiscussionNote(row.id,{done,revision:row.revision});if(!valid(s))return;if(!rowValid(result)||result.id!==row.id||result.done!==done)throw Error('Unconfirmed status');setRow(result);lockUI(false);detail(row.id,done?'Сохранено в разделе «Обсудили».':'Запись снова в списке к встрече.');}
    catch(e){if(valid(s)){status(e.status===409?'Запись изменилась. Обновите список и попробуйте ещё раз.':'Не удалось подтвердить отметку. Попробуйте ещё раз.',true);body.append(button('Обновить список',loadList,'dq-link'));}}finally{if(valid(s))lockUI(false);}
  }
  function mount(){
    if(screen)return;const archive=document.querySelector('#tab-diary .diary-archive');if(!archive)return;screen=el('section','screen');screen.id='screen-discuss';const header=el('header','dq-header');back=button('',()=>list(),'dq-back');back.innerHTML=chevron;back.setAttribute('aria-label','Назад');heading=el('h1','','К разбору');header.append(back,heading);body=el('div','dq-scroll');screen.append(header,body);document.getElementById('app').append(screen);const group=el('section','dq-diary-entry'),entry=button('',()=>{tab='ready';loadList();},'dq-entry-button');entry.id='discuss-entry';entry.innerHTML=bookmark+'<span><strong>К разбору</strong><small>То, что хочется обсудить на встрече</small></span>'+arrow;group.append(entry);archive.before(group);
  }
  function invalidate(){epoch++;owner=null;rows=[];listLoaded=false;draft=null;selectedSource=null;sourceRows=[];busy=false;if(screen){body.replaceChildren();heading.textContent='К разбору';back.disabled=false;}}
  function refresh(){mount();if(!screen)return;const now=ownerNow();if(now!==owner){invalidate();owner=now;}}
  window.DiscussionNotes={refresh,invalidate};
})();
