// Personal post-meeting notes. Server ACK is required before reporting success.
(() => {
  const icon='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3M8 2h8v5H8zM8 12h4M8 16h3M16 12l5-5 2 2-5 5-3 1z"/></svg>';
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  let records=[], owner=null, epoch=0, mounted=false, loading=false, loaded=false, busy=false, editing=null, draft=null, visibleCount=10;
  let screen,history,note,date,save,error,status,stepInput;
  const current=()=>owner && owner===String(Api.userId) && owner===Storage._userId && Api.isAuthed() && !Api.clubBlocked;
  const scope=()=> 'after-meeting-v1:'+(editing?.id || 'new');
  const chosen=()=>screen.querySelector('input[name=am-kind]:checked')?.value||'';
  const payload=()=>({kind:chosen(),meetingDate:date.value,text:note.value.trim(),stepText:stepInput.value.trim()});
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
    invalidateStep();epoch++;owner=null;records=[];loaded=false;loading=false;busy=false;editing=null;draft=null;
    if(!mounted)return;
    note.value='';stepInput.value='';date.value=today();screen.querySelectorAll('input[name=am-kind]').forEach(x=>x.checked=false);
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
      <details class="ps-add-step" id="am-step"><summary>Добавить личный шаг <span>По желанию</span></summary><label for="am-step-input">Что хочется попробовать после встречи?</label><p>Один небольшой шаг, который вы выбираете для себя.</p><textarea id="am-step-input" rows="3" maxlength="1200" placeholder="Например, дать себе паузу перед ответом…"></textarea></details><p class="am-privacy"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/></svg>Личная запись. Ведущим она не отправляется.</p></div>
      <footer class="am-bottom"><p class="am-error" id="am-error" role="alert" hidden></p><button type="button" id="am-save" disabled>Сохранить заметку</button></footer>`;
    document.getElementById('app').append(screen);

    note=document.getElementById('am-note');date=document.getElementById('am-date');save=document.getElementById('am-save');error=document.getElementById('am-error');status=document.getElementById('am-draft-status');
    stepInput=document.getElementById('am-step-input');mounted=true;date.value=today();date.max=today();
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
    draft=cached && typeof cached==='object'?cached:{clientId:crypto.randomUUID(),...(row?{kind:row.kind,meetingDate:row.meetingDate,text:row.text,stepText:row.stepText||''}:{})};
    // An edit draft retains the revision it was based on: do not silently overwrite newer data.
    if(row && cached?.editing?.id===row.id)editing={...row,revision:cached.editing.revision};
    note.value=typeof draft.text==='string'?draft.text:'';date.value=draft.meetingDate||today();date.max=today();
    screen.querySelectorAll('input[name=am-kind]').forEach(x=>x.checked=x.value===draft.kind);
    stepInput.value=typeof draft.stepText==='string'?draft.stepText:'';document.getElementById('am-step').open=Boolean(stepInput.value);
    screen.querySelector('details').open=false;error.hidden=true;status.hidden=true;
    if(note.value || chosen())persist();
    sync();goTo('after-meeting');document.getElementById('app').scrollTop=0;screen.querySelector('.am-scroll').scrollTop=0;
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
      card.append(meta,text);
      if(row.stepText){const stepCopy=document.createElement('div');stepCopy.className='ps-card-step';const title=document.createElement('span');title.textContent=row.stepPaused?'Личный шаг · отложен':'Личный шаг';const p=document.createElement('p');p.textContent=row.stepText;stepCopy.append(title,p);card.append(stepCopy);}
      const actions=document.createElement('div');actions.className='ps-card-actions';actions.append(button);const stepButton=document.createElement('button');stepButton.type='button';stepButton.className='am-edit';stepButton.textContent=(row.stepText||row.events?.length)?row.events?.some(e=>e.type==='observation')?'Посмотреть продолжение':'Вернуться к шагу':'Добавить личный шаг';stepButton.onclick=()=>openStep(row);actions.append(stepButton);card.append(actions);history.append(card);
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
  const validRow=row=>row && typeof row.id==='string' && ['analysis','practice'].includes(row.kind) && /^\d{4}-\d{2}-\d{2}$/.test(row.meetingDate) && typeof row.text==='string' && Number.isInteger(row.revision) && typeof row.stepText==='string' && typeof row.stepPaused==='boolean' && Array.isArray(row.events) && row.events.every(e=>e&&['change','observation'].includes(e.type)&&typeof e.text==='string'&&typeof e.stepText==='string'&&Number.isFinite(Date.parse(e.date)));
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
        if(saved.text!==data.text || saved.kind!==data.kind || saved.meetingDate!==data.meetingDate || saved.stepText!==data.stepText)
          saved=await Api.updateAfterMeetingNote(saved.id,{...data,revision:saved.revision});
      }
      if(version!==epoch||person!==owner||!current())return;
      if(!validRow(saved)||saved.text!==data.text||saved.kind!==data.kind||saved.meetingDate!==data.meetingDate || saved.stepText!==data.stepText)throw new Error('INVALID_NOTE_ACK');
      // A pre-save history request must not replace the newly acknowledged record.
      epoch++;loading=false;loaded=false;
      Storage.clearFormDraft(draftScope);records=records.filter(x=>x.id!==saved.id);records.push(saved);
      records.sort((a,b)=>b.meetingDate.localeCompare(a.meetingDate)||b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
      busy=false;editing=null;draft=null;note.value='';stepInput.value='';date.value=today();status.hidden=true;
      screen.querySelectorAll('input[name=am-kind]').forEach(x=>x.checked=false);sync();render();
      if(currentScreen==='after-meeting'){
        document.activeElement?.blur();goBack();switchTab('diary');
        const scroll=document.querySelector('#tab-diary .screen-scroll');
        scroll.scrollTop+=history.getBoundingClientRect().top-scroll.getBoundingClientRect().top-16;
      }
    }catch(e){
      if(version!==epoch||person!==owner||!current())return;
      busy=false;sync();
      showError(e.status===409?e.message:'Не удалось подтвердить сохранение. Текст остался здесь — проверьте соединение и нажмите «Сохранить» ещё раз.');
    }
  }
  // Private server-backed personal step; no automatic sharing or reminders.
  const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const action=(text,fn,cls='ps-text-button')=>{const n=make('button',cls,text);n.type='button';n.onclick=fn;return n;};
  const arrow='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';
  let stepScreen=null,currentStepId=null,stepSaving=false,stepLoadSequence=0,replyDraft=null,stepDisabled=[];
  const dateLabel=d=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Moscow'}).format(new Date(d.length===10?d+'T12:00:00Z':d));
  const stepRow=()=>records.find(r=>r.id===currentStepId);
  function stepMount(){
    if(stepScreen)return;
    stepScreen=make('section','screen');stepScreen.id='screen-after-step';
    stepScreen.innerHTML=`<header class="am-header"><button class="am-back" type="button" id="ps-back" aria-label="Назад в дневник"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m14 6-6 6 6 6"/></svg></button><div><h1>Личный шаг</h1><p id="ps-context"></p></div></header><div class="ps-scroll screen-scroll" id="ps-content"></div>`;
    document.getElementById('app').append(stepScreen);
    document.getElementById('ps-back').onclick=()=>{if(stepSaving)return;document.activeElement?.blur();goBack();if(currentScreen==='home')switchTab('diary');};
  }
  const stepSession=()=>({version:epoch,person:owner,id:currentStepId});
  const stepCurrent=s=>s.version===epoch&&s.person===owner&&current();
  function invalidateStep(){stepLoadSequence++;currentStepId=null;replyDraft=null;stepSaving=false;stepDisabled=[];if(stepScreen){stepScreen.querySelector('#ps-content').replaceChildren();stepScreen.querySelector('#ps-context').textContent='';}}
  function openStep(row){
    if(!ensureOwner()||!validRow(row))return;stepLoadSequence++;stepMount();currentStepId=row.id;
    const cached=Storage.getFormDraft('step-result-v1:'+row.id);replyDraft=cached&&typeof cached.text==='string'?cached:{clientId:crypto.randomUUID(),text:'',stepText:row.stepText};
    drawStep();goTo('after-step');document.getElementById('app').scrollTop=0;document.getElementById('ps-content').scrollTop=0;
  }
  async function openStepById(id){
    if(!ensureOwner())return;const request=++stepLoadSequence,s=stepSession();const row=await Api.getAfterMeetingNote(id);
    if(!stepCurrent(s)||request!==stepLoadSequence)return;if(!validRow(row)||row.id!==id)throw Error('INVALID_NOTE');setRow(row);openStep(row);
  }
  function setRow(row){epoch++;loading=false;loaded=false;records=records.filter(r=>r.id!==row.id);records.push(row);records.sort((a,b)=>b.meetingDate.localeCompare(a.meetingDate)||b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));render();}
  function stepBusy(on){stepSaving=on;if(on){stepDisabled=[...stepScreen.querySelectorAll('button,input,textarea')].map(n=>[n,n.disabled]);stepDisabled.forEach(([n])=>n.disabled=true);}else{stepDisabled.forEach(([n,disabled])=>n.disabled=disabled);stepDisabled=[];}}
  function stepError(e,s){
    if(!stepCurrent(s)||s.id!==currentStepId)return;
    const notice=document.getElementById('ps-message');notice.textContent=e.status===409?e.message:'Не удалось подтвердить сохранение. Текст остался здесь — попробуйте ещё раз.';notice.setAttribute('role','alert');
    if(e.status===409)notice.append(action('Обновить запись',()=>openStepById(s.id).catch(()=>{notice.textContent='Не удалось обновить запись. Попробуйте ещё раз.';})));
  }
  async function updateStep(data){
    const row=stepRow();if(!current()||!row||stepSaving)return;const s=stepSession(),scroll=document.getElementById('ps-content').scrollTop;stepBusy(true);
    try{const result=await Api.updateAfterMeetingStep(row.id,{...data,revision:row.revision});if(!stepCurrent(s))return;
      if(!validRow(result)||result.id!==row.id||data.stepText!==undefined&&result.stepText!==data.stepText||data.stepPaused!==undefined&&result.stepPaused!==data.stepPaused)throw Error('INVALID_STEP_ACK');
      setRow(result);stepBusy(false);if(currentScreen==='after-step'&&currentStepId===s.id){drawStep('Изменения сохранены.');document.getElementById('ps-content').scrollTop=scroll;}
    }catch(e){if(stepCurrent(s)){stepBusy(false);stepError(e,s);}}
    finally{if(stepCurrent(s))stepSaving=false;}
  }
  function drawStep(message=''){
    const row=stepRow();if(!row)return;const content=document.getElementById('ps-content');content.replaceChildren();
    document.getElementById('ps-context').textContent=(row.kind==='analysis'?'После разбора':'После практики')+' · '+dateLabel(row.meetingDate);
    const source=make('details','ps-source'),summary=make('summary','', 'Моя заметка после встречи');summary.insertAdjacentHTML('beforeend','<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m6 9 6 6 6-6"/></svg>');source.append(summary,make('p','',row.text));content.append(source);
    const step=make('section','ps-current');step.append(make('h2','',row.stepText?'Хочу попробовать':'Мой личный шаг'));
    const edit=make('div','ps-step-editor');edit.hidden=Boolean(row.stepText);
    const label=make('label','', 'Что хочется попробовать?');label.htmlFor='ps-edit-text';const input=make('textarea');input.id='ps-edit-text';input.rows=3;input.maxLength=1200;input.value=row.stepText||'';input.placeholder='Один небольшой шаг для себя…';
    const saveEdit=action('Сохранить шаг',()=>updateStep({stepText:input.value.trim()}),'ps-button');saveEdit.id='ps-edit-save';saveEdit.disabled=!input.value.trim();input.oninput=()=>{saveEdit.disabled=!input.value.trim();};
    const cancel=action('Отменить',()=>{edit.hidden=true;read.hidden=false;});cancel.hidden=!row.stepText;
    edit.append(label,input,saveEdit,cancel);
    const read=make('div');read.hidden=!row.stepText;read.append(make('p','ps-step-copy',row.stepText));
    const controls=make('div','ps-step-actions');controls.append(action('Изменить',()=>{read.hidden=true;edit.hidden=false;input.focus();}),action(row.stepPaused?'Вернуться к шагу':'Отложить',()=>updateStep({stepPaused:!row.stepPaused})));read.append(controls);
    if(row.stepPaused)read.append(make('p','ps-paused','Шаг отложен. Можно вернуться, когда захочется.'));
    step.append(read,edit);content.append(step);
    const notice=make('p','ps-message',message);notice.id='ps-message';notice.setAttribute('role','status');content.append(notice);
    if(!row.stepText)content.append(make('p','ps-optional','Шаг необязательный. Можно оставить только заметку после встречи.'));
    if(row.stepText){
    const response=make('section','ps-response');response.append(make('h2','', 'Что получилось?'),make('p','ps-help','Можно написать, что заметили, что было трудно или почему пока не попробовали.'));
    const responseLabel=make('label','ps-response-label','Ваше наблюдение');responseLabel.htmlFor='ps-reply';const reply=make('textarea');reply.id='ps-reply';reply.rows=4;reply.maxLength=4000;reply.value=replyDraft?.text||'';reply.placeholder='Пишите так, как вам удобно…';
    const draftStatus=make('p','ps-draft');draftStatus.id='ps-draft';draftStatus.setAttribute('role','status');
    const saveReply=action('Сохранить наблюдение',saveObservation,'ps-button');saveReply.id='ps-reply-save';saveReply.disabled=!reply.value.trim();
    reply.oninput=()=>{replyDraft={...(replyDraft||{clientId:crypto.randomUUID(),stepText:row.stepText}),text:reply.value};const kept=Storage.saveFormDraft('step-result-v1:'+row.id,replyDraft);draftStatus.textContent=window.ScreenReviewMode?'Учебный черновик только в этом просмотре.':kept?'Черновик сохранён на этом устройстве.':'Черновик пока только в открытом приложении. Не закрывайте его до сохранения.';saveReply.disabled=!reply.value.trim();};
    if(replyDraft?.stepText!==row.stepText&&reply.value){
      saveReply.disabled=true;draftStatus.textContent='Шаг изменился. Текст наблюдения сохранён как черновик. Проверьте, относится ли он к новому шагу.';
      response.append(action('Писать о текущем шаге',()=>{replyDraft={...replyDraft,stepText:row.stepText,pending:null,clientId:crypto.randomUUID()};Storage.saveFormDraft('step-result-v1:'+row.id,replyDraft);drawStep();}));
      const changedDraft=reply.oninput;reply.oninput=()=>{changedDraft();saveReply.disabled=true;};
    }
    response.append(responseLabel,reply,draftStatus,saveReply);content.append(response);
    }
    const events=row.events||[];
    if(events.length){const past=make('section','ps-past');past.append(make('h2','', 'Мои наблюдения'));
      for(const event of [...events].reverse()){
        const item=make('article','ps-event');item.append(make('p','ps-event-date',dateLabel(event.date)));
        if(event.type==='change'){item.append(make('h3','', 'Шаг изменён'),make('p','ps-previous','Раньше: '+event.from),make('p','',event.text||'Шаг убран'));}
        else{if(event.stepText&&event.stepText!==row.stepText){const context=make('details','ps-event-context');context.append(make('summary','', 'К какому шагу эта запись'),make('p','',event.stepText));item.append(context);}item.append(make('p','ps-observation-text',event.text||'Шаг убран'));}
        past.append(item);
      }content.append(past);
    }
    const privacy=make('p','ps-private','Личная запись. Ведущим она не отправляется.');content.append(privacy);
  }
  async function saveObservation(){
    const row=stepRow(),field=document.getElementById('ps-reply');if(!current()||!row||stepSaving||!field?.value.trim()||replyDraft.stepText!==row.stepText)return;
    const s=stepSession(),text=field.value.trim(),pending=replyDraft.pending||{clientId:replyDraft.clientId,text,stepText:replyDraft.stepText};
    replyDraft={...replyDraft,pending};Storage.saveFormDraft('step-result-v1:'+row.id,replyDraft);stepBusy(true);const b=document.getElementById('ps-reply-save');b.textContent='Сохраняем…';
    try{const result=await Api.addAfterMeetingObservation(row.id,pending);if(!stepCurrent(s))return;
      if(!validRow(result)||result.id!==row.id||!result.events.some(e=>e.clientId===pending.clientId&&e.type==='observation'&&e.text===pending.text&&e.stepText===pending.stepText))throw Error('INVALID_OBSERVATION_ACK');
      setRow(result);const edited=text!==pending.text;
      replyDraft={clientId:crypto.randomUUID(),text:edited?field.value:'',stepText:row.stepText};
      edited?Storage.saveFormDraft('step-result-v1:'+row.id,replyDraft):Storage.clearFormDraft('step-result-v1:'+row.id);
      stepBusy(false);if(currentScreen==='after-step'&&s.id===currentStepId){drawStep(edited?'Прежнее наблюдение сохранено. Изменённый текст остался черновиком.':'Наблюдение сохранено.');if(!edited){document.querySelector('.ps-past')?.scrollIntoView({block:'start',behavior:'auto'});document.getElementById('app').scrollTop=0;}}
    }catch(e){if(stepCurrent(s)){stepBusy(false);b.textContent='Сохранить наблюдение';stepError(e,s);}}
    finally{if(stepCurrent(s))stepSaving=false;}
  }

  window.AfterMeeting={refresh,invalidate,openStepById};
})();
