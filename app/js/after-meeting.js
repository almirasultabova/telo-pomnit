// Personal post-meeting notes. Server ACK is required before reporting success.
(() => {
  const icon='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3M8 2h8v5H8zM8 12h4M8 16h3M16 12l5-5 2 2-5 5-3 1z"/></svg>';
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  let records=[], owner=null, epoch=0, mounted=false, loading=false, loaded=false, busy=false, editing=null, draft=null, visibleCount=10;
  let screen,history,note,date,save,error,status;
  const current=()=>owner && owner===String(Api.userId) && owner===Storage._userId && Api.isAuthed() && !Api.clubBlocked;
  const scope=()=> 'after-meeting-v1:'+(editing?.id || 'new');
  const chosen=()=>screen.querySelector('input[name=am-kind]:checked')?.value||'';
  const payload=()=>({kind:chosen(),meetingDate:date.value,text:note.value.trim()});
  function sync(){
    const disabled=busy||!current()||!(chosen()&&date.value&&date.validity.valid&&date.value<=today()&&note.value.trim());
    // WebKit can cancel a pointer click if blur/change rewrites the pressed button's disabled attribute.
    if(save.disabled!==disabled)save.disabled=disabled;
    screen.querySelectorAll('input,textarea').forEach(x=>{if(x.disabled!==busy)x.disabled=busy;});
    const label=busy?'Сохраняем…':editing?'Сохранить изменения':'Сохранить заметку';
    if(save.textContent!==label)save.textContent=label;
  }
  function persist(){
    if(!current()||busy)return;
    draft={...draft,...payload(),text:note.value,editing:editing?{id:editing.id,revision:editing.revision}:null};
    const kept=Storage.saveFormDraft(scope(),draft);
    status.hidden=!note.value && !chosen();
    status.textContent=window.ScreenReviewMode?'Учебный черновик только в этом просмотре.':kept?'Черновик сохранён на этом устройстве.':'Черновик пока только в открытом приложении. Не закрывайте его до сохранения.';
  }
  function showError(text){error.textContent=text;error.hidden=false;}
  function invalidate(){
    epoch++;owner=null;records=[];loaded=false;loading=false;busy=false;editing=null;draft=null;
    if(!mounted)return;
    note.value='';date.value=today();screen.querySelectorAll('input[name=am-kind]').forEach(x=>x.checked=false);
    history.replaceChildren();history.hidden=true;status.hidden=true;error.hidden=true;sync();
  }
  function mount(){
    if(mounted)return true;
    const group=document.querySelector('#tab-diary .diary-observation-section');
    if(!group)return false;
    const arrow='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';
    const entry=document.createElement('button');entry.id='after-meeting-entry';entry.type='button';entry.innerHTML=`<span class="am-entry-icon">${icon}</span><span class="am-entry-copy"><strong>После встречи</strong><small>Заметка после разбора или практики</small></span><span class="am-entry-arrow">${arrow}</span>`;
    group.before(entry);
    history=document.createElement('section');history.className='am-journal';history.id='am-journal';history.hidden=true;history.setAttribute('aria-label','Заметки после встреч');
    document.querySelector('#tab-diary .diary-archive').before(history);
    screen=document.createElement('section');screen.className='screen';screen.id='screen-after-meeting';
    screen.innerHTML=`<header class="am-header"><button class="am-back" id="am-back" type="button" aria-label="Назад в дневник"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m14 6-6 6 6 6"/></svg></button><div><h1>После встречи</h1><p>Личная заметка</p></div></header>
      <div class="am-scroll screen-scroll"><p class="am-intro">Сохраните мысли и ощущения, к которым хочется вернуться.</p>
      <fieldset class="am-kind"><legend>После чего эта заметка?</legend><div class="am-types"><label class="am-option"><input type="radio" name="am-kind" value="analysis"><span>После разбора</span></label><label class="am-option"><input type="radio" name="am-kind" value="practice"><span>После практики</span></label></div></fieldset>
      <div class="am-date-row"><label for="am-date">Дата встречи</label><input type="date" id="am-date" aria-required="true"></div>
      <div class="am-writing-head"><label class="am-field-label" for="am-note">Что хочется сохранить?</label><span>В свободной форме</span></div>
      <textarea id="am-note" rows="6" maxlength="20000" aria-required="true" placeholder="Мысли, ощущения или то, что хочется запомнить…"></textarea>
      <p class="am-draft-status" id="am-draft-status" role="status" hidden></p><details class="am-prompts"><summary>Если не знаете, с чего начать</summary><ul><li>Что я заметила?</li><li>Что стало понятнее?</li><li>Что хочется сохранить?</li></ul><p>Это только подсказки. Можно написать о своём.</p></details>
      <p class="am-privacy"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/></svg>Личная запись. Ведущим она не отправляется.</p></div>
      <footer class="am-bottom"><p class="am-error" id="am-error" role="alert" hidden></p><button type="button" id="am-save" disabled>Сохранить заметку</button></footer>`;
    document.getElementById('app').append(screen);

    note=document.getElementById('am-note');date=document.getElementById('am-date');save=document.getElementById('am-save');error=document.getElementById('am-error');status=document.getElementById('am-draft-status');
    mounted=true;date.value=today();date.max=today();
    screen.addEventListener('input',()=>{error.hidden=true;persist();sync();});
    screen.addEventListener('change',()=>{persist();sync();});
    entry.onclick=()=>open();
    document.getElementById('am-back').onclick=()=>{if(!busy){document.activeElement?.blur();goBack();switchTab('diary');}};
    save.onclick=saveNote;
    // Only authored SVG geometry; no font-dependent arrows.
    screen._arrow=arrow;
    return true;
  }
  function ensureOwner(){
    if(!mount())return false;
    if(owner!==String(Api.userId)){invalidate();owner=Api.userId?String(Api.userId):null;}
    return current();
  }
  function open(row){
    if(!ensureOwner()||busy)return;
    editing=row||null;
    const cached=Storage.getFormDraft(scope());
    draft=cached && typeof cached==='object'?cached:{clientId:crypto.randomUUID(),...(row?{kind:row.kind,meetingDate:row.meetingDate,text:row.text}:{})};
    // An edit draft retains the revision it was based on: do not silently overwrite newer data.
    if(row && cached?.editing?.id===row.id)editing={...row,revision:cached.editing.revision};
    note.value=typeof draft.text==='string'?draft.text:'';date.value=draft.meetingDate||today();date.max=today();
    screen.querySelectorAll('input[name=am-kind]').forEach(x=>x.checked=x.value===draft.kind);
    screen.querySelector('details').open=false;error.hidden=true;status.hidden=true;
    if(note.value || chosen())persist();
    sync();goTo('after-meeting');screen.querySelector('.am-scroll').scrollTop=0;
  }
  function render(message=''){
    if(!mounted||!current())return;
    history.replaceChildren();history.hidden=!(records.length||message);
    if(records.length){const title=document.createElement('h2');title.className='am-journal-title';title.textContent='После встреч';history.append(title);}
    if(message){const p=document.createElement('p');p.className='am-history-status';p.setAttribute('role','status');p.textContent=message;history.append(p);
      if(!loading){const retry=document.createElement('button');retry.type='button';retry.className='am-edit';retry.textContent='Повторить загрузку заметок';retry.onclick=()=>refresh(true);history.append(retry);}}
    for(const row of records.slice(0,visibleCount)){
      const card=document.createElement('article');card.className='am-record';
      const meta=document.createElement('p');meta.className='am-record-meta';meta.textContent=(row.kind==='analysis'?'После разбора':'После практики')+' · '+new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Moscow'}).format(new Date(row.meetingDate+'T12:00:00+03:00'));
      const text=document.createElement('p');text.className='am-record-text';text.textContent=row.text;
      const button=document.createElement('button');button.type='button';button.className='am-edit';button.innerHTML='Открыть заметку '+screen._arrow;button.onclick=()=>open(row);
      card.append(meta,text,button);history.append(card);
    }
    if(records.length>visibleCount){const more=document.createElement('button');more.type='button';more.className='am-edit';more.textContent='Показать ещё';more.onclick=()=>{visibleCount+=10;render();};history.append(more);}
  }
  async function refresh(force=false){
    if(!ensureOwner()||loading||loaded&&!force)return;
    const version=epoch, person=owner;loading=true;render('Загружаем заметки…');
    try{const rows=await Api.getAfterMeetingNotes();if(version!==epoch||person!==owner||!current())return;
      if(!Array.isArray(rows)||rows.some(r=>!validRow(r)))throw new Error('INVALID_NOTES');
      records=rows;loaded=true;loading=false;render();
    }catch(e){if(version!==epoch||!current())return;loading=false;render('Не удалось загрузить заметки. Проверьте соединение и повторите.');}
  }
  const validRow=row=>row && typeof row.id==='string' && ['analysis','practice'].includes(row.kind) && /^\d{4}-\d{2}-\d{2}$/.test(row.meetingDate) && typeof row.text==='string' && Number.isInteger(row.revision);
  async function saveNote(){
    sync();if(save.disabled)return;
    const version=epoch, person=owner, data=payload(), draftScope=scope();
    persist();busy=true;sync();error.hidden=true;
    try{
      let saved;
      const existing=editing||draft.resolved;
      if(existing)saved=await Api.updateAfterMeetingNote(existing.id,{...data,revision:existing.revision});
      else{
        // Keep the first payload across ambiguous timeouts. Resolve it before editing the same note.
        const first=draft.pendingCreate||{...data,clientId:draft.clientId||crypto.randomUUID()};
        draft.pendingCreate=first;Storage.saveFormDraft(draftScope,draft);
        saved=await Api.createAfterMeetingNote(first);
        if(version!==epoch||person!==owner||!current())return;
        if(!validRow(saved))throw new Error('INVALID_NOTE_ACK');
        draft.resolved={id:saved.id,revision:saved.revision};Storage.saveFormDraft(draftScope,draft);
        if(saved.text!==data.text || saved.kind!==data.kind || saved.meetingDate!==data.meetingDate)
          saved=await Api.updateAfterMeetingNote(saved.id,{...data,revision:saved.revision});
      }
      if(version!==epoch||person!==owner||!current())return;
      if(!validRow(saved)||saved.text!==data.text||saved.kind!==data.kind||saved.meetingDate!==data.meetingDate)throw new Error('INVALID_NOTE_ACK');
      // A pre-save history request must not replace the newly acknowledged record.
      epoch++;loading=false;loaded=false;
      Storage.clearFormDraft(draftScope);records=records.filter(x=>x.id!==saved.id);records.push(saved);
      records.sort((a,b)=>b.meetingDate.localeCompare(a.meetingDate)||b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
      busy=false;editing=null;draft=null;note.value='';date.value=today();status.hidden=true;
      screen.querySelectorAll('input[name=am-kind]').forEach(x=>x.checked=false);sync();render();
      if(currentScreen==='after-meeting'){
        document.activeElement?.blur();goBack();switchTab('diary');history.scrollIntoView({block:'center',behavior:'auto'});
      }
    }catch(e){
      if(version!==epoch||person!==owner||!current())return;
      busy=false;sync();
      showError(e.status===409?e.message:'Не удалось подтвердить сохранение. Текст остался здесь — проверьте соединение и нажмите «Сохранить» ещё раз.');
    }
  }
  window.AfterMeeting={refresh,invalidate};
})();
