'use strict';
const $=id=>document.getElementById(id);
let store={mode:"loading",requestFilter:"waiting",ownerFilter:"all",kindFilter:"all"},returnFocus=null,summary=null,session=null,loadId=0;
const api={permitted:()=>Boolean(session&&store.data),visibleRequests:(s,m)=>m.requests.filter(r=>(s.requestFilter==='all'||(s.requestFilter==='waiting'?r.needsReply&&['new','in-progress'].includes(r.status):r.status==='answered'))&&(s.ownerFilter==='all'||(s.ownerFilter==='mine'?r.assignee===s.actor:s.ownerFilter==='assigned'?Boolean(r.assignee):!r.assignee))&&(s.kindFilter==='all'||r.kind===s.kindFilter))};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=(x,month='long')=>new Date(x).toLocaleDateString('ru-RU',{day:'numeric',month,timeZone:'Europe/Moscow'});
const clock=x=>new Date(x).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'});
const stamp=x=>date(x)+', '+clock(x);
const endDay=x=>new Date(Date.parse(x)-86400000);
const kinds={technical:'Приложение и доступ',programme:'Программа',schedule:'Расписание',feedback:'Обратная связь',unknown:'Тема не уточнена'};
const statuses={new:'Новое','in-progress':'В работе',answered:'Ответили','no-reply':'Ответ не требуется'};
function age(x){const h=Math.floor((Date.parse(store.data.asOf)-Date.parse(x))/3600000),d=Math.floor(h/24);if(d===0)return h?`${h} ч`:'Менее часа';return d+' '+({one:'день',few:'дня',many:'дней',other:'дня'}[new Intl.PluralRules('ru').select(d)]);}
function toast(text){$('toast').textContent=text;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').textContent='',4500);}
function show(title,context,html){const wasOpen=$('detail').open;if(!wasOpen)returnFocus=document.activeElement;$('detail-title').textContent=title;$('detail-context').textContent=context;$('detail-content').innerHTML=html;if(!wasOpen)$('detail').showModal();else $('close-detail').focus();}
function close(){ $('detail').close();if(returnFocus?.isConnected)returnFocus.focus();}
$('close-detail').onclick=close;
$('detail').addEventListener('click',e=>{if(e.target!==$('detail'))return;const r=$('detail').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();});
function focusQueue(){const h=$('requests-title');h.setAttribute('tabindex','-1');h.focus();}
function metrics(){
 const d=store.data,s=summary,requests=d.requests,waiting=requests.filter(r=>r.needsReply&&['new','in-progress'].includes(r.status));
 const weeks=s.weeks.map(w=>({...w,eligible:{size:w.eligibleCount},active:{size:w.activeCount}}));
 return {...s,members:d.members,pre:new Map(s.pre),post:new Map(s.post),paired:{length:s.pairedCount},postOpen:Date.parse(d.asOf)>=Date.parse(d.postOpensAt),weeks,current:weeks.at(-1),previous:weeks.at(-2),base:{size:s.baseCount},returned:{size:s.returnedCount},requests,waiting,inProgress:waiting.filter(r=>r.status==='in-progress'),legacy:d.legacy,categories:f=>({...s.experience[f],counts:new Map(s.experience[f].counts)})};
}
function state(title,text,retry=true){$('loaded-content').hidden=true;$('state-panel').hidden=false;$('state-panel').innerHTML=`<h2>${esc(title)}</h2><p>${esc(text)}</p>${retry?'<button id="retry">Попробовать снова</button>':''}`;if($('retry'))$('retry').onclick=()=>loadFlow($('stream').value);}
function reportParent(state){if(parent!==window)parent.postMessage({type:'telo-overview',state},location.origin);}
async function request(path,method='GET',body){
 let token='';try{token=parent!==window?parent.getStreamOverviewToken():'';}catch{}
 if(!token)throw Object.assign(Error('Откройте обзор из профиля приложения.'),{status:401});
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{const res=await fetch('/api/stream-overview'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:controller.signal,cache:'no-store'});const data=await res.json();if(!res.ok)throw Object.assign(Error(data.error||'Не удалось получить данные'),{status:res.status});return data;}finally{clearTimeout(timer);}
}
function render(){
 const d=store.data,m=metrics();$('loaded-content').hidden=false;$('state-panel').hidden=true;
 $('stream-dates').textContent=date(d.startDate)+' — '+date(endDay(d.endDate));
 $('freshness').textContent='Обновлено '+stamp(d.asOf)+' МСК';
 $('waiting-total').textContent=m.waiting.length;$('progress-total').textContent=m.inProgress.length;$('oldest-age').textContent=m.waiting.length?age(m.waiting[0].createdAt):'—';
 $('oldest-age').nextElementSibling.textContent=m.waiting.length?'самое давнее':'никто не ждёт';
 renderRequests(m);renderSurveys(m);renderActivity(m);renderOutcomes(m);
}
async function loadFlow(id){const version=++loadId;close();state('Загружаем обзор','Проверяем доступ и данные выбранного потока.',false);
 try{if(!session){session=await request('/session');store.actor=session.id;$('viewer').textContent=session.name;$('stream').innerHTML=session.streams.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');}
 if(version!==loadId)return;
 id=id||session.streams[0]?.id;if(!id){state('Потоков пока нет','Когда появится доступный поток, его данные будут здесь.',false);return;}
 $('stream').value=id;const result=await request('/'+encodeURIComponent(id));if(version!==loadId)return;
 store.data=result.data;summary=result.summary;store.policy={[store.actor]:{triage:result.rights.triage,streams:session.streams.map(s=>s.id)}};render();
 }catch(e){if(version!==loadId)return;store.data=null;summary=null;
 if(e.status===401||e.status===403){session=null;state('Доступ к обзору закрыт',e.message,false);}else state('Не удалось загрузить обзор','Данные не обновились. Это не означает, что анкет или обращений нет. Повторите попытку.');
 }finally{if(version===loadId){$('stream').disabled=!session;reportParent('ready');}}
}
function renderRequests(m=metrics()){
  const rows=api.visibleRequests(store,m);
  $('queue-summary').textContent=`Ждут ответа: ${m.waiting.length}. Всего сообщений по потоку: ${m.requests.length}. Сначала — самые давние.`;
  document.querySelectorAll('[data-status]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.status===store.requestFilter)));
  $('owner-filter').value=store.ownerFilter;$('kind-filter').value=store.kindFilter;
  $('request-list').innerHTML=rows.length?rows.map(r=>{
    const user={name:r.author};
    const timing=r.answeredAt?`Ответила ${r.answeredBy} · ${stamp(r.answeredAt)}`:r.takenAt?`Взяла ${r.assigneeName} · ${stamp(r.takenAt)}`:'';
    return `<article class="request-row"><div class="request-meta"><strong class="request-name">${esc(user.name)}</strong><time class="request-age" datetime="${esc(r.createdAt)}">${esc(age(r.createdAt))}</time></div><button class="request-subject" data-request="${esc(r.id)}">${esc(r.subject)}</button><div class="request-bottom"><span class="label">${esc(statuses[r.status])}</span><span>${esc(kinds[r.kind])}</span></div><p class="request-timing">${timing?esc(timing):r.needsReply?'Без ответственного':''}</p></article>`;
  }).join(''):`<div class="empty"><h3>${m.waiting.length===0&&store.requestFilter==='waiting'?'Никто не ждёт ответа':'По этим условиям обращений нет'}</h3><p>${m.waiting.length===0&&store.requestFilter==='waiting'?'Сообщения без запроса на ответ доступны во вкладке «Все».':'Можно выбрать всех ответственных и все темы.'}</p>${store.ownerFilter!=='all'||store.kindFilter!=='all'?'<button id="clear-filters" class="inline-action">Сбросить фильтры</button>':''}</div>`;
  $('legacy-list').innerHTML=m.legacy.length?`<div class="legacy-row"><button id="open-legacy">Нужно разобрать: ${m.legacy.length}</button><p>Пока неизвестно, к какому потоку относится сообщение и нужен ли ещё ответ. Проверьте прежнюю переписку.</p></div>`:'';
  if($('clear-filters'))$('clear-filters').onclick=()=>{store.ownerFilter='all';store.kindFilter='all';renderRequests();};
  if($('open-legacy'))$('open-legacy').onclick=()=>legacyDetail(m.legacy[0]);
  $('request-list').querySelectorAll('[data-request]').forEach(b=>b.onclick=()=>requestDetail(b.dataset.request));
}
function requestDetail(id){
  if(!api.permitted(store))return;
  const r=store.data.requests.find(x=>x.id===id&&x.streamId===store.data.id);if(!r)return;
  const u={name:r.author},revision=r.revision;
  const waiting=r.needsReply&&r.status!=='answered',other=r.assignee&&r.assignee!==store.actor;
  const controls=`<div class="dialog-actions">${r.contact?`<a href="${esc(r.contact)}" target="_blank" rel="noopener noreferrer">Открыть переписку в Telegram</a>`:'<p>Контакт Telegram недоступен. Ответьте через известную вам переписку.</p>'}${waiting&&!r.assignee?'<button id="take-request">Взять в работу</button>':''}${waiting?`<button id="answer-request" ${other?'disabled':''}>Отметить ответ</button>`:''}</div>`;
  const times=`<div class="detail-line">Получено: ${esc(stamp(r.createdAt))} МСК</div>${r.takenAt?`<div class="detail-line">Взяла ${esc(r.assigneeName)}: ${esc(stamp(r.takenAt))}</div>`:''}${r.answeredAt?`<div class="detail-line">Ответила ${esc(r.answeredBy)}: ${esc(stamp(r.answeredAt))}</div>`:''}`;
  show(r.subject,`${u.name} · ${kinds[r.kind]}`,`<p>${esc(statuses[r.status])}${r.assignee?' · '+esc(r.assigneeName):''}</p><blockquote>${esc(r.text)}</blockquote>${times}${other&&waiting?`<p>Вопрос уже взяла ${esc(r.assigneeName)}. Её отметку нельзя перезаписать.</p>`:''}${controls}<p class="small">Отметки сохраняются для команды. Ответ участнице отправьте отдельно в Telegram.</p>`);
  if($('take-request'))$('take-request').onclick=()=>saveAction(id,{revision,action:'take'});
  if($('answer-request'))$('answer-request').onclick=()=>{
    show('Ответ уже отправлен?','Отметка для команды',`<p>Отметка будет сохранена от имени «${esc(session.name)}». Сначала нужно ответить участнице отдельно.</p><label class="confirm-label"><input id="reply-confirmed" type="checkbox"> Я уже ответила участнице</label><div class="dialog-actions"><button id="confirm-answer" disabled>Сохранить отметку</button><button id="cancel-answer" class="secondary">Назад</button></div><p class="small">Кнопка не отправляет ответ в Telegram.</p>`);
    $('reply-confirmed').onchange=()=>{$('confirm-answer').disabled=!$('reply-confirmed').checked;};
    $('confirm-answer').onclick=()=>saveAction(id,{revision,action:'answer',confirmed:$('reply-confirmed').checked});
    $('cancel-answer').onclick=()=>requestDetail(id);
  };
  $('detail-content').dataset.requestId=id;
}
$('detail-content').addEventListener('click',e=>{if(e.target.id==='back-to-request')requestDetail($('detail-content').dataset.requestId);});
async function saveAction(id,body){document.querySelectorAll('.dialog-actions button').forEach(b=>b.disabled=true);try{await request('/requests/'+encodeURIComponent(id),'POST',body);close();await loadFlow(store.data.id);toast('Отметка сохранена для команды.');}catch(e){close();await loadFlow($('stream').value);toast(e.status===409?'Обращение уже изменилось. Откройте обновлённую карточку.':e.message);}}
function legacyDetail(r){
  if(!store.policy[store.actor].triage)return;
  const revision=r.revision;
  show('Уточнить прежнее сообщение','Разбор прежних сообщений · владелец',`<blockquote>${esc(r.text)}</blockquote><p>У сообщения нет подтверждённого потока и запроса на ответ. Старое уведомление не показывает, ответила ли команда.</p><label for="legacy-intent">Нужен ли ответ</label><select id="legacy-intent"><option value="">Выберите после проверки</option><option value="yes">Да, ответ ещё нужен</option><option value="no">Ответ не требуется</option></select><label for="legacy-kind">Тема</label><select id="legacy-kind">${Object.entries(kinds).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select><label class="confirm-label"><input type="checkbox" id="legacy-flow"> Подтверждаю связь с выбранным потоком</label><div class="dialog-actions"><button id="classify-legacy" disabled>Сохранить разбор</button></div>`);
  $('legacy-kind').value='unknown';
  function ready(){$('classify-legacy').disabled=!$('legacy-flow').checked||!$('legacy-intent').value;}
  $('legacy-flow').onchange=ready;$('legacy-intent').onchange=ready;
  $('classify-legacy').onclick=()=>saveAction(r.id,{action:'classify',revision,confirmed:$('legacy-flow').checked,streamId:store.data.id,needsReply:$('legacy-intent').value==='yes',kind:$('legacy-kind').value});
}
function renderSurveys(m){
  const n=m.members.length;
  if(!n){$('survey-summary').innerHTML='<div class="empty"><h3>Состав ещё не набран</h3><p>В этом потоке пока нет участниц с подтверждённым зачислением. Когда они появятся, здесь будут статусы анкет.</p></div>';$('survey-context').textContent='Ведущие и владелец в состав участниц не входят.';return;}
  const panel=(label,value,caption)=>`<div class="survey-panel"><p class="survey-label">${label}</p><div class="metric-number"><strong>${value}</strong><span>из ${n}</span></div><div class="meter" aria-hidden="true"><span style="width:${n?100*value/n:0}%"></span></div><p class="metric-caption">${caption}</p></div>`;
  $('survey-summary').innerHTML=panel('Первая неделя',m.pre.size,'отправили анкету')+(m.postOpen?panel('После потока',m.post.size,'поделились итогами'):`<div class="survey-panel"><p class="survey-label">После потока</p><p class="not-open">Откроется<br>${esc(date(store.data.postOpensAt))}</p><p class="metric-caption">Заполнение ещё не ожидается</p></div>`);
  $('survey-context').textContent=m.postOpen?`У ${m.paired.length} участниц есть обе анкеты. Полнота отдельных вопросов может отличаться.`:`Начальная анкета пока не отправлена у ${n-m.pre.size} из ${n} участниц.`;
}
function renderActivity(m){
 const c=m.current,p=m.previous,known=c?.known,comparison=known&&p?.known;
 $('activity-period').textContent=c?`${date(c.start)} — ${date(endDay(c.end))} · полная неделя`:'Полных недель пока нет';
 $('active-value').textContent=known?`${c.active.size} из ${c.eligible.size}`:'Нет истории';
 $('returned-value').textContent=comparison&&m.base.size?`${m.returned.size} из ${m.base.size}`:'Пока нет сравнения';
 $('return-note').textContent=comparison&&m.base.size?`Сравнение с предыдущей полной неделей. Впервые за две недели сохранили запись: ${m.newlyActive}. Исключено из сравнения из-за доступа: ${m.excludedPrevious}.`:`Достоверная история допуска и новых сохранений собирается с ${stamp(store.data.historySince)} МСК. Для возвращения нужны две полные недели после этой даты. Предыдущие недели не считаем нулевыми.`;
 $('week-chart').innerHTML=m.weeks.length?m.weeks.map(w=>`<div class="week-row"><span>${esc(date(w.start,'short'))}</span><div class="week-bar" aria-hidden="true"><span style="width:${w.known&&w.eligible.size?100*w.active.size/w.eligible.size:0}%"></span></div><span class="week-value">${w.known?w.active.size+'/'+w.eligible.size:'—'}</span><span class="sr-only">${w.known?'сохранили новую запись':'история допуска не подтверждена'}</span></div>`).join(''):'<p class="body-note">Недельная история ещё не собрана.</p>';
}
const questions={benefit_group:'Польза групповых встреч',benefit_body:'Польза телесных практик',benefit_recordings:'Польза записей встреч',benefit_practice:'Польза самостоятельной практики',benefit_app:'Польза приложения',difficulties:'Возникали ли трудности',appBarrier:'Что мешало пользоваться приложением',nextStep:'Желаемый следующий шаг'};
function renderOutcomes(m){
  if(!m.postOpen||m.post.size===0){
    $('outcome-content').innerHTML=`<div class="empty"><h3>${m.postOpen?'Пока нет итоговых ответов':'Время подвести итоги ещё впереди'}</h3><p>${m.postOpen?'Сравнение появится после отправки итоговых анкет. Отсутствие ответов не означает отсутствие изменений.':'Итоговая анкета откроется '+esc(date(store.data.postOpensAt))+'. До этого сравнение не рассчитывается.'}</p></div>`;

    return;
  }
  function scale(title,s,labels,values){
    const tones=['tone-helpful','tone-same','tone-harder'];
    return `<div class="scale-block"><h3>${title}</h3><p>Ответили на вопрос до и после: ${s.n} из ${m.paired.length}</p>${s.n?`<div class="distribution" aria-hidden="true">${values.map((v,i)=>`<span class="${tones[i]}" style="width:${100*v/s.n}%"></span>`).join('')}</div><ul class="distribution-labels">${values.map((v,i)=>`<li><span class="swatch ${tones[i]}" aria-hidden="true"></span><span>${labels[i]}</span><span class="n">${v} из ${s.n}</span></li>`).join('')}</ul>`:'<p>Для этой шкалы пока нет полных пар.</p>'}<p class="scale-missing">${s.missing?`Не включены из-за пропущенной оценки: ${s.missing}.`:'Вопрос заполнен в обеих анкетах у всех сопоставляемых участниц.'}</p></div>`;
  }
  $('outcome-content').innerHTML=`<p class="outcome-note">Начало и итог у одних и тех же участниц. Сравниваем только ответы на два одинаковых вопроса.</p><div class="outcome-grid">${scale('Контакт с телом',m.contact,['Оценка стала выше','Не изменилась','Оценка стала ниже'],[m.contact.up,m.contact.same,m.contact.down])}${scale('Тревога в обычный день',m.anxiety,['Оценка стала ниже','Не изменилась','Оценка стала выше'],[m.anxiety.down,m.anxiety.same,m.anxiety.up])}</div><p class="outcome-note">Так участницы оценивают свой опыт. В расчёт включены только заполненные пары ответов; шкалы не объединяются в общий балл.</p><div class="structured"><div class="structured-head"><h3>Опыт участия</h3><label for="experience-field" class="sr-only">Вопрос итоговой анкеты</label><select id="experience-field">${Object.entries(questions).map(([key,value])=>`<option value="${key}">${value}</option>`).join('')}</select></div><div id="experience-rows"></div></div>`;
  $('experience-field').onchange=()=>renderExperience(m,$('experience-field').value);
  renderExperience(m,'benefit_group');
}
function renderExperience(m,field){
  const result=m.categories(field);
  $('experience-rows').innerHTML=`<p class="body-note">На этот вопрос ответили ${result.answered} из ${result.total} отправивших итоговую анкету.</p>${[...result.counts,...(result.missing?[['Нет ответа',result.missing]]:[])].map(([label,count])=>`<div class="category-row"><span>${esc(label)}</span><div class="week-bar" aria-hidden="true"><span style="width:${100*count/result.total}%"></span></div><span class="week-value">${count}/${result.total}</span></div>`).join('')}<p class="outcome-note">Эти ответы относятся к отправленным итоговым анкетам. На всю группу их не переносим.</p>`;
}
function surveyList(type='pre'){
  const m=metrics(),list=type==='pre'?m.pre:m.post;
  show('Статусы анкет','Участницы выбранного потока',`<div class="dialog-tabs" role="group" aria-label="Тип анкеты"><button id="list-pre" aria-pressed="${type==='pre'}">Первая неделя</button><button id="list-post" aria-pressed="${type==='post'}">После потока</button></div>${type==='post'&&!m.postOpen?`<p>Анкета откроется ${esc(date(store.data.postOpensAt))}. Она ещё не ожидается от участниц.</p>`:`<ul class="status-list">${m.members.map(u=>`<li><span>${esc(u.name)}</span><span class="status">${list.has(u.id)?'Отправлена':'Пока не отправлена'}</span></li>`).join('')}</ul>`}<p class="small">Статус не показывает, начинала ли участница заполнение и есть ли у неё черновик.</p>`);
  $('list-pre').onclick=()=>surveyList('pre');$('list-post').onclick=()=>surveyList('post');
}
const help={requests:['Обращения и ответ','В очередь попадают сообщения с явным запросом ответа и подтверждённым потоком. Взятое в работу остаётся ожидающим до отметки об ответе. Назначенного ответственного нельзя перезаписать. Прежние сообщения разбирает владелец.'],surveys:['Анкеты и состав','Считаем уникальных участниц своего потока с активным или завершённым подтверждённым зачислением. Ведущие, владелец, удалённые и исключённые из аналитики аккаунты не входят в состав. Итоговая открывается после последнего московского дня потока.'],activity:['Использование и возвращение','Учитываем новые серверные сохранения дневника своего потока за полные недели, начиная с даты сбора истории. В составе недели — участницы с непрерывным подтверждённым доступом от её начала до конца. Редактирование и личные тексты не учитываем. Недели до начала сбора истории не восстанавливаем из текущего допуска.'],outcomes:['Как сравниваются ответы','Каждая шкала — только полные пары одной участницы: начальная анкета версии 1 и итоговая версии 2. Пропуск не ноль. Два одинаковых вопроса считаются отдельно. Опыт участия — выбранные варианты итоговой анкеты, без анализа личных текстов.']};
document.querySelectorAll('[data-help]').forEach(b=>b.onclick=()=>{const [title,...text]=help[b.dataset.help];show(title,'Определение показателя',text.map(p=>`<p>${esc(p)}</p>`).join(''));});
document.querySelectorAll('[data-status]').forEach(b=>b.onclick=()=>{store.requestFilter=b.dataset.status;renderRequests();});
$('owner-filter').onchange=()=>{store.ownerFilter=$('owner-filter').value;renderRequests();};
$('kind-filter').onchange=()=>{store.kindFilter=$('kind-filter').value;renderRequests();};
$('stream').onchange=()=>loadFlow($('stream').value);
$('survey-list').onclick=()=>surveyList();
$('go-waiting').onclick=()=>{store.requestFilter='waiting';store.ownerFilter='all';store.kindFilter='all';renderRequests();focusQueue();};
$('go-progress').onclick=()=>{store.requestFilter='waiting';store.ownerFilter='assigned';store.kindFilter='all';renderRequests();focusQueue();};
$('permissions').onclick=()=>show('Доступ команды',session?.name||'Обзор потока','<p>Сервер проверяет ваш аккаунт и разрешённый поток при каждом запросе. Личные записи дневника, ответы свободным текстом и переписка с AI сюда не передаются.</p><p>Назначение и отметка ответа фиксируются с автором и временем. При одновременной обработке устаревшая карточка не перезаписывает новую.</p>');
$('about').onclick=()=>loadFlow($('stream').value);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadFlow($('stream').value);});
loadFlow();
