// Profile layout: retain original cards and session-bound access checks.
(() => {
 const esc=escapeAccessText;
 const arrow='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m9 5 7 7-7 7"/></svg>';
 const day=v=>new Date(v).toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'long',year:'numeric'});
 const when=v=>new Date(v).toLocaleString('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}).replace(' в ',' · ')+' МСК';
 const row=(label,action,sub='')=>`<button type="button" class="pc-row" data-profile-action="${action}"><span>${esc(label)}${sub?`<small>${esc(sub)}</small>`:''}</span>${arrow}</button>`;
 let origin=null,listTab=null,listStream=null,openedMeeting=null,updating=false;
 const owned=()=>Api.isAuthed()&&!Api.clubBlocked&&String(Storage._userId)===String(Api.userId);
 const sameOrigin=()=>origin&&origin.owner===Api.userId&&origin.generation===Api._authGeneration;
 const recordingsAllowed=s=>s?.canReadRecordings===true&&(!s.recordingsExpiresAt||programNow()<Date.parse(s.recordingsExpiresAt));
 const validUrl=(value,telegram=false)=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(!telegram||['t.me','telegram.me'].includes(u.hostname))?u.href:null}catch{return null}};
 function createScreen(id,title){
  let screen=document.getElementById('screen-'+id);if(screen)return screen;
  screen=document.createElement('section');screen.id='screen-'+id;screen.className='screen pc-native-screen';
  screen.innerHTML=`<header class="pc-screen-header"><button type="button" class="pc-back" aria-label="Назад">${arrow}</button><h1>${esc(title)}</h1></header><div class="screen-scroll pc-screen-body"></div>`;
  screen.querySelector('button').onclick=()=>goBack();document.body.append(screen);return screen;
 }
 function openList(){
  if(!owned()||!currentProgram())return;
  origin={owner:Api.userId,generation:Api._authGeneration,stream:selectedProgramId,button:document.querySelector('.pc-meeting-entry [data-profile-action="meetings"]'),scroll:document.querySelector('#tab-profile>.screen-scroll').scrollTop};
  listTab=null;listStream=null;createScreen('profile-meetings','Все встречи и записи');renderList();goTo('profile-meetings');
 }
 function openStreams(){
  if(!owned()||!sameOrigin())return;
  const screen=createScreen('profile-streams','Мои потоки');const body=screen.querySelector('.screen-scroll');
  body.innerHTML=(programAccess?.streams||[]).map(s=>row(s.name,s.id,`${day(s.startDate)} — ${day(s.endDate)} · ${s.phase==='completed'?'Завершён':s.phase==='upcoming'?'Начнётся скоро':'Поток идёт'}`)).join('');
  body.querySelectorAll('button').forEach(button=>button.onclick=()=>{
   if(!owned()||!sameOrigin()||!programAccess.streams.some(s=>s.id===button.dataset.profileAction))return;
   selectProgram(button.dataset.profileAction);listTab=null;listStream=null;goBack();renderList();
  });goTo('profile-streams');
 }
 function recordingsNotice(stream){
  if(!recordingsAllowed(stream))return `<p class="pc-note">${stream.accessExpired?'Доступ к материалам этого потока закрыт.':'Срок доступа к записям завершён.'}</p>`;
  const expiry=Number.isFinite(Date.parse(stream.recordingsExpiresAt))?day(new Date(Date.parse(stream.recordingsExpiresAt)-1).toISOString()):null;
  return `<p class="pc-note">${expiry?`Записи доступны до ${esc(expiry)} включительно.`:'Срок доступа к записям уточняется.'} Откройте прошедшую встречу, чтобы найти запись и код.</p>`;
 }
 function renderList(){
  const screen=document.getElementById('screen-profile-meetings');if(!screen)return;
  const body=screen.querySelector('.screen-scroll');
  if(!owned()||!sameOrigin()){body.replaceChildren();return}
  const stream=currentProgram();if(!stream){body.innerHTML='<p class="pc-note">Этот поток больше не доступен.</p>';return}
  const scroll=body.scrollTop,active=document.activeElement?.dataset?.focusKey;
  const all=[...(stream.meetings||[])].filter(m=>Number.isFinite(Date.parse(m.date))).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
  const upcoming=all.filter(m=>Date.parse(m.date)>=programNow()),previous=all.filter(m=>Date.parse(m.date)<programNow()).reverse();
  if(listStream!==stream.id){listStream=stream.id;listTab=upcoming.length?'upcoming':'past'}
  if(!listTab)listTab=upcoming.length?'upcoming':'past';
  const items=listTab==='upcoming'?upcoming:previous;
  body.innerHTML=`<h2 class="pc-stream-name">${esc(stream.name)}</h2>${recordingsNotice(stream)}<div class="pc-list-tabs" role="group" aria-label="Встречи по времени"><button type="button" data-focus-key="upcoming" aria-pressed="${listTab==='upcoming'}">Предстоящие</button><button type="button" data-focus-key="past" aria-pressed="${listTab==='past'}">Прошедшие</button></div><div class="pc-meeting-list"></div>`;
  body.querySelectorAll('.pc-list-tabs button').forEach(button=>button.onclick=()=>{listTab=button.dataset.focusKey;renderList()});
  const list=body.querySelector('.pc-meeting-list');
  if(!items.length)list.innerHTML=`<p class="pc-note">${listTab==='upcoming'?'Предстоящих встреч пока нет.':'Прошедших встреч пока нет.'}</p>`;
  items.forEach(meeting=>{
   const isPast=Date.parse(meeting.date)<programNow();
   const status=isPast?(recordingsAllowed(stream)?validUrl(meeting.recordingUrl)?'Запись эфира доступна':'Запись пока не добавлена':'Доступ к записи завершён'):'';
   const button=document.createElement('button');button.type='button';button.className='pc-row';button.dataset.programMeeting=meeting.id;button.dataset.focusKey='meeting:'+meeting.id;button.setAttribute('aria-haspopup','dialog');
   button.innerHTML=`<span><small>${esc(when(meeting.date))}</small><strong>${esc(meeting.topic||'Встреча '+meeting.number)}</strong>${status?`<small>${esc(status)}</small>`:''}${Storage.isAttended(meeting.id)?'<small>Участвовала</small>':''}</span>${arrow}`;
   button.onclick=()=>{if(owned()&&sameOrigin()&&currentProgram()?.id===stream.id)MeetingPanel.open(meeting.id)};list.append(button);
  });
  if(recordingsAllowed(stream)&&validUrl(stream.chatLink,true)){
   const hint=document.createElement('p');hint.className='pc-note';hint.textContent='Материалы потока также можно найти в Telegram-группе.';body.append(hint);
   const chat=document.createElement('div');chat.innerHTML=row('Чат потока','chat');chat.firstElementChild.onclick=()=>openChat(stream.id);body.append(chat);
  }
  if((programAccess?.streams||[]).some(s=>s.id!==stream.id)){
   const other=document.createElement('div');other.className='pc-other-streams';other.innerHTML=row('Другие мои потоки','streams');other.firstElementChild.onclick=openStreams;body.append(other);
  }
  body.scrollTop=scroll;if(active)body.querySelector(`[data-focus-key="${CSS.escape(active)}"]`)?.focus({preventScroll:true});
 }
 function openChat(id){
  const stream=currentProgram();if(!owned()||stream?.id!==id)return;
  if(!recordingsAllowed(stream)){void refreshProgramAccess().then(renderProfileTab);return}
  const url=validUrl(stream.chatLink,true);if(!url)return;
  if(tg?.openTelegramLink)tg.openTelegramLink(url);else window.open(url,'_blank','noopener');
 }
 function notice(container,text,retry){
  const block=document.createElement('div');block.className='pc-recovery';block.setAttribute('role','status');
  const p=document.createElement('p');p.textContent=text;block.append(p);
  if(retry){const button=document.createElement('button');button.type='button';button.className='btn btn--outline btn--sm';button.textContent='Повторить загрузку';button.onclick=async()=>{button.disabled=true;await refreshProgramAccess();renderProfileTab()};block.append(button)}container.append(block);
 }
 function history(){document.getElementById('ai-chat-btn')?.click();const details=document.querySelector('.ai-history-disclosure');if(details)details.open=true}
 renderNextMeeting=function(){
  const el=document.getElementById('next-meeting-card');if(!el)return;
  const focusedAction=currentScreen==='home'&&el.contains(document.activeElement)?document.activeElement.dataset.profileAction:null;
  const banner=document.getElementById('q-banner-wrap'),access=document.querySelector('#tab-profile .profile-program-access');
  if(banner&&access)access.parentElement.insertBefore(banner,access);
  StreamStatePanel.clear();el.replaceChildren();
  if(programRefreshError&&programAccess)notice(el,'Не получилось проверить расписание. Пока показаны последние загруженные даты.',true);
  if(!programAccess){notice(el,'Не получилось загрузить ваш поток и встречи.',true);return}
  const stream=currentProgram();if(!stream){notice(el,'Сейчас у вас нет активного потока. Дневник и Мой путь остаются доступны.',false);return}
  const owner=Api.userId,generation=Api._authGeneration,phase=stream.phase||streamState(stream);
  const panel=StreamStatePanel.render({stream:{...stream,phase:phase==='upcoming'?'current':phase},now:programNow,
   refreshAccess:()=>refreshProgramAccess().then(renderProfileTab),aiAvailable:programAccess.ai?.canWrite===true,serviceAccess:['host','admin'].includes(programAccess.ai?.reason),
   isCurrent:()=>owned()&&Api.userId===owner&&Api._authGeneration===generation&&currentProgram()?.id===stream.id,
   openTab:switchTab,appendLink:appendAccessLink,postState:()=>QuestionnaireCycle.getPostState(),openSummary:()=>QuestionnaireCycle.openSummary(),openAi:isHistory=>{if(isHistory)history();else document.getElementById('ai-chat-btn')?.click()}
  });
  if(panel){
   if(phase==='upcoming')panel.querySelector('.ss-status').lastChild.textContent='Начнётся скоро';
   if(phase==='completed'&&banner)panel.querySelector('[data-pre-slot]').append(banner);
   const section=document.createElement('div');section.className='pc-meeting-entry';
   section.innerHTML=row('Все встречи и записи','meetings')+(recordingsAllowed(stream)&&validUrl(stream.chatLink,true)?row('Чат потока','chat'):'');
   section.querySelector('[data-profile-action="meetings"]').onclick=openList;
   section.querySelector('[data-profile-action="chat"]')?.addEventListener('click',()=>openChat(stream.id));
   panel.querySelector('[data-reflection-slot]').after(section);el.append(panel);
  }
  decorate();
  if(focusedAction&&currentScreen==='home')el.querySelector(`[data-profile-action="${CSS.escape(focusedAction)}"]`)?.focus({preventScroll:true});
 };
 function decorate(){
  const root=document.getElementById('tab-profile');if(!root)return;root.classList.add('pc-layout');
  const panel=root.querySelector('.stream-state-panel'),q=document.getElementById('q-banner-wrap');
  if(q){const stream=currentProgram(),firstWeek=stream&&['current','upcoming'].includes(stream.phase||streamState(stream));const visible=!Api.isClubAdmin&&Api.userRole!=='HOST'&&(qStatusState==='loading'||qStatusState==='error'||firstWeek&&Boolean(q.querySelector('.q-banner')));q.hidden=!visible;const slot=q.closest('.ss-pre');if(slot)slot.hidden=!visible;}
  const hero=panel?.querySelector('.ss-hero');
  if(hero&&!hero.parentElement.classList.contains('pc-hero-wrap')){const wrap=document.createElement('div');wrap.className='pc-hero-wrap';hero.before(wrap);wrap.append(hero)}
  const personal=panel?.querySelectorAll('.ss-personal-row');
  if(personal?.length&&!personal[0].parentElement.classList.contains('pc-personal-links')){const wrap=document.createElement('section');wrap.className='pc-personal-links';personal[0].before(wrap);personal.forEach(button=>wrap.append(button))}
  if(!panel){
   let fallback=document.getElementById('pc-personal-fallback');if(!fallback){fallback=document.createElement('section');fallback.id='pc-personal-fallback';root.querySelector('.profile-program').append(fallback)}
   fallback.innerHTML=row('Дневник','diary','Сохранять новые наблюдения')+row('Мой путь','path','Отметки и динамика состояния')+row('История разговоров','history','Ваши сохранённые беседы с AI');
   fallback.querySelectorAll('button').forEach(button=>button.onclick=()=>button.dataset.profileAction==='history'?history():switchTab(button.dataset.profileAction==='path'?'diag':'diary'));
  }else document.getElementById('pc-personal-fallback')?.remove();
  const metrics=root.querySelector('.profile-metrics'),people=root.querySelector('.profile-people');if(metrics&&people&&metrics.nextElementSibling!==people)people.before(metrics);
  if(!updating&&currentScreen==='profile-meetings'){updating=true;renderList();updating=false}
 }
 const originalProfile=renderProfileTab;renderProfileTab=function(){originalProfile();decorate()};
 const originalBanner=renderQuestionnaireBanner;renderQuestionnaireBanner=function(){originalBanner();decorate()};
 const originalSchedule=renderSchedule;renderSchedule=function(){originalSchedule();decorate()};
 const originalGoBack=goBack;goBack=function(){
  const leaving=currentScreen==='profile-meetings'&&!MeetingPanel.isOpen();
  if(leaving&&sameOrigin()&&programAccess?.streams.some(s=>s.id===origin.stream))selectProgram(origin.stream);
  originalGoBack();if(leaving){decorate();document.querySelector('#tab-profile>.screen-scroll').scrollTop=origin?.scroll||0;const focus=origin?.button?.isConnected?origin.button:document.querySelector('.pc-meeting-entry [data-profile-action="meetings"]');focus?.focus({preventScroll:true});origin=null}
 };
 tg?.BackButton?.offClick?.(originalGoBack);syncTelegramBackNavigation();
 function tuneMeeting(){
  const stream=currentProgram(),meeting=stream?.meetings?.find(m=>String(m.id)===String(openedMeeting));
  const body=document.querySelector('#program-meeting-dialog[open] .meeting-panel-body');if(!body||!meeting)return;
  const past=Date.parse(meeting.date)<programNow();
  if(past){body.querySelectorAll('a').forEach(a=>{if(a.href===stream.zoomLink)a.remove()});const recording=body.querySelector('.meeting-recording');if(recording)body.prepend(recording)}
  body.querySelector('.pc-recording-state')?.remove();
  if(past&&!body.querySelector('.meeting-recording')){const note=document.createElement('p');note.className='pc-note pc-recording-state';note.textContent=recordingsAllowed(stream)?'Запись этой встречи пока не добавлена.':stream.accessExpired?'Доступ к материалам этого потока закрыт.':'Доступ к записи этой встречи завершён.';body.prepend(note)}
 }
 const originalOpen=MeetingPanel.open;MeetingPanel.open=function(id){openedMeeting=id;originalOpen(id);tuneMeeting()};
 const originalSync=MeetingPanel.sync;MeetingPanel.sync=function(){originalSync();tuneMeeting()};
 document.addEventListener('close',event=>{if(event.target.id==='program-meeting-dialog'&&currentScreen==='profile-meetings'){
  const id=openedMeeting;renderList();document.querySelector(`#screen-profile-meetings [data-program-meeting="${CSS.escape(String(id))}"]`)?.focus({preventScroll:true});openedMeeting=null;
 }},true);
 document.addEventListener('keydown',event=>{
  if(!['profile-meetings','profile-streams'].includes(currentScreen)||MeetingPanel.isOpen())return;
  if(event.key==='Escape'){event.preventDefault();goBack()}
  if(event.key==='Tab'){
   const screen=document.getElementById('screen-'+currentScreen),items=[...screen.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),[tabindex="0"]')].filter(el=>el.getClientRects().length);
   const first=items[0],last=items[items.length-1];if(!first)return;
   if(event.shiftKey&&(document.activeElement===first||document.activeElement===screen||!screen.contains(document.activeElement))){event.preventDefault();last.focus()}
   else if(!event.shiftKey&&(document.activeElement===last||!screen.contains(document.activeElement))){event.preventDefault();first.focus()}
  }
 });
 document.addEventListener('DOMContentLoaded',()=>{
  createScreen('profile-meetings','Все встречи и записи');createScreen('profile-streams','Мои потоки');
  if(owned()&&programAccess)decorate();
  syncTelegramBackNavigation();
 });
})();
