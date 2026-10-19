// Private unified history. Favorite truth comes only from the authenticated server.
(() => {
  const icons={
    back:'<path d="m14 6-6 6 6 6"/>',arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
    search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    clear:'<path d="m6 6 12 12M18 6 6 18"/>',star:'<path d="m12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.2-.9z"/>',
    book:'<path d="M12 6v15M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2z"/>'
  };
  const svg=name=>`<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`;
  const names={body:'Наблюдение за телом',state:'Отметка состояния',reaction:'Моя реакция',analysis:'После разбора',practice:'После практики'};

  const state={query:'',period:'all',kind:'all',onlyImportant:false,from:'',to:''};
  let ready=false,rows=[],total=0,hasMore=false,epoch=0,sequence=0,detailSequence=0,timer=null,owner=null,loading=false,loadError=false,local=false;
  let rememberedScroll=0,activeRecord=null,controlsRoot,headerTitle;
  let list,search,period,kind,count,range,from,to,error,reset,notice,detail;
  const pending=new Set(),key=row=>row.source+':'+row.id;
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const normalize=s=>s.toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
  const tokens=()=>normalize(state.query).trim().split(/\s+/).filter(Boolean);
  const plural=n=>n%10===1&&n%100!==11?'запись':n%10>=2&&n%10<=4&&!(n%100>=12&&n%100<=14)?'записи':'записей';
  const fullDate=row=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Moscow'}).format(new Date(row.day+'T12:00:00Z'));
  const time=row=>new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'}).format(new Date(row.date));
  function highlight(node,text){
    const terms=tokens(),normalized=normalize(text),spans=[];
    for(const term of terms){let start=0,index;while((index=normalized.indexOf(term,start))!==-1){spans.push([index,index+term.length]);start=index+term.length;}}
    spans.sort((a,b)=>a[0]-b[0]);let merged=[];
    for(const span of spans){const prev=merged.at(-1);if(prev&&span[0]<=prev[1])prev[1]=Math.max(prev[1],span[1]);else merged.push([...span]);}
    let cursor=0;for(const[start,end]of merged){node.append(document.createTextNode(text.slice(cursor,start)));node.append(el('mark','',text.slice(start,end)));cursor=end;}node.append(document.createTextNode(text.slice(cursor)));
  }

  const ownerNow=()=>Api.userId && Storage._userId===Api.userId ? Api.userId+':'+Api._authGeneration : null;
  const session=()=>({epoch,owner:ownerNow()});
  const valid=s=>s.epoch===epoch && s.owner && s.owner===ownerNow();
  const rowValid=r=>r&&typeof r.id==='string'&&['body','state','reaction','meeting'].includes(r.source)&&typeof r.title==='string'&&typeof r.text==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(r.day)&&Number.isFinite(Date.parse(r.date))&&typeof r.important==='boolean';
  const filterActive=()=>Boolean(state.query.trim()||state.period!=='all'||state.kind!=='all');
  function button(text,fn,cls='hm-more'){const b=el('button',cls,text);b.type='button';b.onclick=fn;return b;}
  function sync(){range.hidden=state.period!=='custom';reset.hidden=!filterActive();document.getElementById('hm-clear').hidden=!state.query;document.getElementById('hm-all').setAttribute('aria-pressed',String(!state.onlyImportant));document.getElementById('hm-important').setAttribute('aria-pressed',String(state.onlyImportant));}
  function clearFilters(){Object.assign(state,{query:'',period:'all',kind:'all',from:'',to:''});search.value='';period.value='all';kind.value='all';from.value='';to.value='';sync();load();}
  function message(title,text,action,label){const box=el('section','hm-empty');box.innerHTML=svg('book');box.append(el('h2','',title),el('p','',text));if(action)box.append(button(label,action));list.append(box);}
  function preserveFocus(root,draw){
    const focused=document.activeElement;
    const selector=focused?.matches('.hm-star')?'.hm-star':focused?.matches('.hm-open')?'.hm-open':focused?.matches('.hm-more')?'.hm-more':null;
    const owned=selector&&root.contains(focused),id=owned?focused.dataset.recordId||focused.closest('[data-record-id]')?.dataset.recordId:null;
    const index=owned?[...root.querySelectorAll(selector)].indexOf(focused):-1;
    draw();
    if(!owned||focused.isConnected||!root.closest('.screen--active'))return;
    const controls=[...root.querySelectorAll(selector)];
    const same=id&&controls.find(node=>(node.dataset.recordId||node.closest('[data-record-id]')?.dataset.recordId)===id);
    const target=same||controls[Math.min(index,controls.length-1)]||document.getElementById('hm-important');
    target?.focus({preventScroll:true});
  }
  function render(){preserveFocus(list,renderRows);}
  function renderRows(){
    if(local)return;
    sync();list.setAttribute('aria-busy',String(loading));count.textContent=loading?'Загружаем…':loadError?'':total+' '+plural(total);list.replaceChildren();
    if(loadError&&!rows.length){message('История пока не загрузилась','Проверьте соединение и попробуйте ещё раз.',()=>load(),'Повторить');list.append(button('Открыть записи на устройстве',showLocal));return;}
    if(loading&&!rows.length){const n=el('p','hm-load','Загружаем записи…');n.setAttribute('role','status');list.append(n);return;}
    if(!rows.length){
      if(filterActive())message('Записи не нашлись','Попробуйте другое слово или измените период и тип записи.',clearFilters,'Сбросить фильтры');
      else if(state.onlyImportant)message('Важное пока не отмечено','Нажмите на звёздочку у записи, к которой хочется вернуться.',()=>{state.onlyImportant=false;load();},'Посмотреть все записи');
      else message('Здесь будут ваши записи','Сохранённые наблюдения и заметки после встреч появятся здесь.');
      return;
    }
    let group='';
    for(const row of rows){
      if(group!==row.day){group=row.day;list.append(el('h2','hm-date',fullDate(row)));}
      const card=el('article','hm-card');card.dataset.recordId=key(row);
      const head=el('div','hm-card-head'),copy=el('div'),title=el('h3','hm-card-title');highlight(title,row.title);
      copy.append(title,el('p','hm-meta',meta(row)));head.append(copy,star(row));
      const text=el('p','hm-card-text');highlight(text,row.text||summary(row));
      const openButton=button('Открыть запись',()=>open(row),'hm-open');openButton.insertAdjacentHTML('beforeend',svg('arrow'));card.append(head,text,openButton);list.append(card);
    }
    if(loadError)list.append(el('p','hm-write-error','Не удалось загрузить записи. Попробуйте ещё раз.'));
    if(hasMore||loadError){const more=button(loading?'Загружаем…':loadError?'Повторить':'Показать ещё',()=>load({append:true}));more.disabled=loading;list.append(more);}
  }
  function meta(row){return row.source==='meeting'?'Записано '+new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'}).format(new Date(row.date)):(names[row.kind]||'')+' · '+time(row);}
  function summary(row){return row.tags?.length?row.tags.join(' · '):Object.entries(row.scores||{}).map(([name,value])=>name+': '+value+' из 10').join(' · ');}
  async function load({append=false,retain=false}={}){
    clearTimeout(timer);const seq=++sequence,s=session();if(!s.owner){invalidate();return;}
    local=false;controlsRoot.hidden=false;headerTitle.textContent='История записей';
    const scroll=retain||append?list.scrollTop:0,limit=retain?Math.min(Math.max(rows.length,10),100):10,offset=append?rows.length:0;
    if(!append&&!retain)rows=[];
    const invalid=state.period==='custom'&&state.from&&state.to&&state.from>state.to;error.hidden=!invalid;
    if(invalid){loading=false;loadError=false;rows=[];list.replaceChildren();count.textContent='Проверьте даты';message('Проверьте период','Дата начала должна быть раньше даты окончания.');return;}
    if(state.query.trim().split(/\s+/).filter(Boolean).length>16){loading=false;rows=[];count.textContent='';list.replaceChildren();message('Сократите запрос','Для поиска используйте до 16 слов.');return;}
    loading=true;loadError=false;notice.textContent='';render();list.scrollTop=scroll;
    try{
      const data=await Api.searchDiaryHistory({query:state.query,period:state.period,kind:state.kind,important:state.onlyImportant,limit,offset,...(state.period==='custom'&&state.from?{from:state.from}:{}),...(state.period==='custom'&&state.to?{to:state.to}:{})});
      if(!valid(s)||seq!==sequence)return;
      if(!data||!Array.isArray(data.entries)||!data.entries.every(rowValid)||!Number.isInteger(data.total)||typeof data.hasMore!=='boolean')throw Error('Invalid history response');
      const combined=append?rows.concat(data.entries):data.entries;rows=[...new Map(combined.map(r=>[key(r),r])).values()];total=data.total;hasMore=data.hasMore;
    }catch{if(!valid(s)||seq!==sequence)return;loadError=true;}
    if(!valid(s)||seq!==sequence)return;loading=false;render();list.scrollTop=scroll;
  }
  function star(row){
    const b=button('',()=>toggle(row),'hm-star');b.innerHTML=svg('star');b.dataset.recordId=key(row);b.setAttribute('aria-disabled',String(pending.has(key(row))));b.setAttribute('aria-busy',String(pending.has(key(row))));b.setAttribute('aria-pressed',String(row.important));b.setAttribute('aria-label',(row.important?'Убрать из важного: ':'Отметить как важное: ')+row.title);return b;
  }
  async function toggle(row){
    const id=key(row);if(pending.has(id))return;const s=session(),desired=!row.important;pending.add(id);notice.textContent='';
    document.querySelectorAll('.hm-write-error').forEach(n=>n.remove());const oldScroll=list.scrollTop;render();list.scrollTop=oldScroll;if(activeRecord&&key(activeRecord)===id)renderDetail(activeRecord);
    try{
      const ack=await Api.setDiaryImportant(row.source,row.id,desired);if(!valid(s))return;
      if(ack?.source!==row.source||ack.id!==row.id||ack.important!==desired)throw Error('Invalid favorite acknowledgment');
      row.important=desired;for(const r of rows)if(key(r)===id)r.important=desired;if(activeRecord&&key(activeRecord)===id)activeRecord.important=desired;
      await load({retain:true});
    }catch{if(valid(s)){const text='Не удалось подтвердить отметку. Нажмите на звёздочку ещё раз.';notice.textContent=text;if(currentScreen==='history-record'){const n=el('p','hm-write-error',text);n.setAttribute('role','alert');detail.querySelector('.hm-detail-scroll').append(n);}}}
    finally{pending.delete(id);if(valid(s)){const scroll=list.scrollTop;render();list.scrollTop=scroll;if(activeRecord&&key(activeRecord)===id)renderDetail(activeRecord);}}
  }
  async function open(row){
    rememberedScroll=list.scrollTop;activeRecord=null;goTo('history-record');document.getElementById('app').scrollTop=0;await fetchDetail(row);
  }
  async function fetchDetail(row){
    const seq=++detailSequence,s=session(),content=detail.querySelector('.hm-detail-scroll');content.replaceChildren(el('p','hm-load','Открываем запись…'));
    try{const data=await Api.getDiaryHistoryRecord(row.source,row.id);if(!valid(s)||seq!==detailSequence||currentScreen!=='history-record')return;if(!rowValid(data))throw Error('Invalid record');activeRecord=data;renderDetail(data);content.scrollTop=0;}
    catch{if(valid(s)&&seq===detailSequence&&currentScreen==='history-record'){content.replaceChildren(el('p','hm-load','Не удалось открыть запись. Проверьте соединение и попробуйте ещё раз.'),button('Повторить',()=>fetchDetail(row)));}}
  }
  function renderDetail(row){
    preserveFocus(detail.querySelector('.hm-detail-scroll'),()=>renderDetailContent(row));
  }
  function renderDetailContent(row){
    const content=detail.querySelector('.hm-detail-scroll'),scroll=content.scrollTop;content.replaceChildren();const top=el('div','hm-detail-top'),copy=el('div');copy.append(el('h2','',row.title),el('p','hm-meta',fullDate(row)+' · '+meta(row)));top.append(copy,star(row));content.append(top);
    if(row.tags?.length){const tags=el('div','hm-tags');for(const tag of row.tags)tags.append(el('span','',tag));content.append(tags);}
    if(row.scores){const scores=el('dl','hm-scores');for(const[name,value]of Object.entries(row.scores)){const line=el('div');line.append(el('dt','',name),el('dd','',value+' из 10'));scores.append(line);}content.append(scores);}
    if(row.source==='meeting'&&row.hasStep){content.append(button('Открыть личный шаг',()=>window.AfterMeeting.openStepById(row.id).catch(()=>{const n=el('p','hm-write-error','Не удалось открыть личный шаг. Попробуйте ещё раз.');content.append(n);}),'hm-open'));}
    if(row.text){const text=el('p','hm-full-text');highlight(text,row.text);content.append(text);}if(notice.textContent){const n=el('p','hm-write-error',notice.textContent);n.setAttribute('role','alert');content.append(n);}content.scrollTop=scroll;
  }
  function showLocal(){++sequence;loading=false;local=true;controlsRoot.hidden=true;headerTitle.textContent='Записи на устройстве';renderLocalDiaryHistory();const caption=el('div','hm-local-caption','Здесь только наблюдения, сохранённые на этом устройстве. Поиск и «Важное» появятся после подключения.');caption.append(button('Загрузить всю историю',()=>load()));list.prepend(caption);}
  function setup(){
    if(ready)return;ready=true;const screen=document.getElementById('screen-history'),header=screen.querySelector('.screen-header'),pdf=document.getElementById('export-pdf-btn');header.className='hm-header';header.innerHTML=`<button type="button" class="hm-back" id="hm-back" aria-label="Назад в Дневник">${svg('back')}</button><h1>История записей</h1>`;headerTitle=header.querySelector('h1');
    if(pdf){pdf.className='hm-export';pdf.textContent='PDF';pdf.setAttribute('aria-label','Скачать дневник в PDF');pdf.title='Скачать дневник в PDF';header.append(pdf);}
    const controls=el('div','hm-controls');controls.innerHTML=`
      <div class="hm-search">${svg('search')}<input id="hm-search" type="search" placeholder="Найти в записях" aria-label="Поиск по записям" autocomplete="off"><button type="button" class="hm-clear" id="hm-clear" aria-label="Очистить поиск" hidden>${svg('clear')}</button></div>
      <div class="hm-filters"><label class="hm-field"><span>Период</span><select id="hm-period"><option value="all">За всё время</option><option value="week">Последние 7 дней</option><option value="month">Последние 30 дней</option><option value="custom">Выбрать даты</option></select></label><label class="hm-field"><span>Тип записи</span><select id="hm-kind"><option value="all">Все типы</option><option value="body">Наблюдения за телом</option><option value="state">Отметки состояния</option><option value="reaction">Мои реакции</option><option value="analysis">После разбора</option><option value="practice">После практики</option></select></label></div>
      <div class="hm-range" id="hm-range" hidden><label class="hm-field"><span>С</span><input type="date" id="hm-from" aria-label="Начало периода"></label><label class="hm-field"><span>По</span><input type="date" id="hm-to" aria-label="Конец периода"></label></div><p class="hm-invalid" id="hm-invalid" role="alert" hidden>Дата начала позже даты окончания.</p>
      <div class="hm-tabs-line"><div class="hm-tabs" role="group" aria-label="Отбор записей"><button class="hm-tab" id="hm-all" type="button" aria-pressed="true">Все</button><button class="hm-tab" id="hm-important" type="button" aria-pressed="false">${svg('star')}Важное</button></div><span id="hm-count" class="hm-count" role="status" aria-live="polite"></span></div><button class="hm-reset" id="hm-reset" type="button" hidden>Сбросить фильтры</button><p class="hm-local-status" id="hm-local-status" role="status"></p>`;
    header.after(controls);controlsRoot=controls;list=document.getElementById('history-list');list.className='hm-results screen-scroll';
    [search,period,kind,count,range,from,to,error,reset,notice]=['hm-search','hm-period','hm-kind','hm-count','hm-range','hm-from','hm-to','hm-invalid','hm-reset','hm-local-status'].map(id=>document.getElementById(id));

    search.maxLength=200;
    const update=(debounce=false)=>{++sequence;clearTimeout(timer);state.query=search.value;state.period=period.value;state.kind=kind.value;state.from=from.value;state.to=to.value;sync();if(debounce)timer=setTimeout(()=>load(),220);else load();};
    search.addEventListener('input',()=>update(true));for(const n of[period,kind])n.addEventListener('change',()=>update());for(const n of[from,to])n.addEventListener('input',()=>update());
    document.getElementById('hm-clear').onclick=()=>{search.value='';update();search.focus();};reset.onclick=clearFilters;
    for(const id of ['hm-all','hm-important'])document.getElementById(id).onclick=()=>{state.onlyImportant=id==='hm-important';load();};
    document.getElementById('hm-back').onclick=()=>{++detailSequence;goBack();switchTab('diary');};
    detail=el('section','screen');detail.id='screen-history-record';detail.innerHTML=`<header class="hm-header"><button class="hm-back" type="button" id="hm-detail-back" aria-label="Назад к записям">${svg('back')}</button><h1>Ваша запись</h1></header><div class="hm-detail-scroll screen-scroll"></div>`;document.getElementById('app').append(detail);
    document.getElementById('hm-detail-back').onclick=()=>{++detailSequence;goBack();render();list.scrollTop=rememberedScroll;const card=[...list.querySelectorAll('.hm-card')].find(c=>c.dataset.recordId===(activeRecord&&key(activeRecord)));(card?.querySelector('.hm-open')||document.getElementById('hm-important')).focus({preventScroll:true});};
  }
  function invalidate(){++epoch;++sequence;++detailSequence;clearTimeout(timer);owner=null;rows=[];total=0;activeRecord=null;pending.clear();if(!ready)return;list.replaceChildren();detail.querySelector('.hm-detail-scroll').replaceChildren();Object.assign(state,{query:'',period:'all',kind:'all',onlyImportant:false,from:'',to:''});search.value='';period.value='all';kind.value='all';from.value='';to.value='';count.textContent='';notice.textContent='';error.hidden=true;sync();}
  window.DiaryHistory={refresh(){setup();const next=ownerNow();if(owner!==next){invalidate();owner=next;}return load({retain:true});},invalidate};
})();
