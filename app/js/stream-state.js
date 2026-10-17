// Native stream summary. The server owns access; this component only presents its flags.
window.StreamStatePanel = (() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const arrow = '<svg class="ss-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';
  const symbols={"notebook-pen": "<path d=\"M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4\" />\n  <path d=\"M2 6h4\" />\n  <path d=\"M2 10h4\" />\n  <path d=\"M2 14h4\" />\n  <path d=\"M2 18h4\" />\n  <path d=\"M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z\" />\n", "chart-no-axes-column-increasing": "<line x1=\"12\" x2=\"12\" y1=\"20\" y2=\"10\" />\n  <line x1=\"18\" x2=\"18\" y1=\"20\" y2=\"4\" />\n  <line x1=\"6\" x2=\"6\" y1=\"20\" y2=\"16\" />\n", "message-circle": "<path d=\"M7.9 20A9 9 0 1 0 4 16.1L2 22Z\" />\n"};
  const icon = name => `<svg class="ss-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${name==='circle-play'?'<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4V8Z"/>':symbols[name]}</svg>`;
  const date = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'long',year:'numeric'}) : '';
  function groupUrl(value) {
    try { const url=new URL(value);return url.protocol==='https:' && ['t.me','telegram.me'].includes(url.hostname) && !url.username && !url.password ? 'https://t.me'+url.pathname+url.search+url.hash : null; }
    catch { return null; }
  }
  let view=null;
  function clear() {
    if(view?.banner && view.bannerParent?.isConnected)view.bannerParent.insertBefore(view.banner,view.bannerParent.querySelector('.profile-program-access'));
    view?.node.remove();view=null;
    document.querySelector('#tab-profile .profile-program')?.classList.remove('profile-program--state');
    const banner=document.getElementById('q-banner-wrap');if(banner)banner.hidden=false;
  }
  function refreshQuestionnaire() {
    if (!view || !view.context.isCurrent()) return;
    if(!view.ended)view.node.querySelector('[data-pre-slot]').hidden=!view.banner?.querySelector('button');
    const slot=view.node.querySelector('[data-reflection-slot]');
    const status=view.context.postState();
    const show=view.ended && status?.streamId===view.context.stream.id;
    const key=show ? (status.done?'done':'pending') : 'none';
    const banner=document.getElementById('q-banner-wrap');if(banner && view.ended)banner.hidden=Boolean(show);
    if(slot.dataset.state===key)return;slot.dataset.state=key;slot.replaceChildren();
    if(!show)return;
    slot.innerHTML=`<section class="ss-reflection"><h3>${status.done?'Ваш путь за время потока':'Что вы замечаете сейчас?'}</h3><p>${status.done?'С чем вы пришли и что замечаете теперь — в ваших ответах.':'Вернитесь к своему запросу и сохраните, что изменилось за время потока.'}</p><button type="button" data-reflection>${status.done?'Посмотреть мой путь':'Подвести итоги'} ${arrow}</button></section>`;
  }
  function render(context) {
    clear();const stream=context.stream;
    if(!stream || !['current','completed'].includes(stream.phase))return null;
    const ended=stream.phase==='completed';
    const node=document.createElement('section');node.className='stream-state-panel';node.setAttribute('aria-label','Ваш поток');
    const next=(stream.meetings||[]).filter(m=>Number.isFinite(Date.parse(m.date))&&Date.parse(m.date)>=context.now()).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date))[0];
    const nextDate=next?new Date(next.date).toLocaleString('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}):'';
    const expiry=Number.isFinite(Date.parse(stream.recordingsExpiresAt))?date(new Date(Date.parse(stream.recordingsExpiresAt)-1).toISOString()):'';
    let group=groupUrl(stream.chatLink);
    const allowed=stream.canReadRecordings===true;
    if(!allowed)group=null;
    let recordingText=ended?'Можно вернуться к встречам и повторить практики в своём темпе.':'Если пропустили встречу или хотите вернуться к ней — загляните в группу.';
    if(!allowed)recordingText=stream.accessExpired?'Доступ к материалам этого потока закрыт.':'Срок хранения записей этого потока завершился.';
    const personal=(name,title,subtitle,kind)=>`<button type="button" class="ss-personal-row" data-personal="${kind}">${icon(name)}<span><strong>${title}</strong><small>${subtitle}</small></span>${arrow}</button>`;
    node.innerHTML=`<section class="ss-hero" aria-labelledby="ss-stream-title"><span class="ss-status"><svg viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="4"/></svg>${ended?'Поток завершён':'Поток идёт'}</span><h2 id="ss-stream-title">${esc(stream.name)}</h2><p class="ss-dates">${esc(date(stream.startDate))} — ${esc(date(stream.endDate))}</p>
      ${ended?'<p class="ss-hero-note">Встречи позади. Можно возвращаться к своему опыту и замечать, что меняется.</p>':next?`<div class="ss-next"><p>Ближайшая встреча · ${esc(nextDate)} МСК</p><strong>${esc(next.topic||'Встреча потока')}</strong></div>`:'<p class="ss-hero-note">Расписание встреч появится здесь.</p>'}<div class="ss-live" data-live></div></section><div class="ss-pre" data-pre-slot></div>
      <section class="ss-recordings" aria-labelledby="ss-recordings-title"><div class="ss-recordings-top">${icon('circle-play')}<div><h3 id="ss-recordings-title">Записи встреч</h3><p class="ss-location">В Telegram-группе потока</p></div></div><p>${recordingText}</p><div data-group-entry></div>
      ${allowed?`<small>Записи хранятся в группе 3 месяца после окончания потока.${expiry?`<br>До ${esc(expiry)} включительно.`:''}</small>`:''}</section>
      <div data-reflection-slot></div><h3 class="ss-section-title">Остаётся с вами</h3><p class="ss-personal-intro">Эти разделы доступны и после потока.</p>
      ${personal('notebook-pen','Дневник','Сохранять новые наблюдения','diary')}${personal('chart-no-axes-column-increasing','Мой путь','Отметки и динамика состояния','diag')}${personal('message-circle','История разговоров','Ваши сохранённые беседы с AI','history')}
      ${ended?`<section class="ss-ended"><h3>Встречи и AI</h3><p>Живые встречи этого потока завершены.</p><p>${context.aiAvailable?(context.serviceAccess?'Служебный доступ к AI сохранён.':'AI доступен по вашему действующему потоку.'):'Новые сообщения AI доступны во время потока.'}</p></section>`:''}
      ${context.aiAvailable?`<button type="button" class="ss-assistant" data-assistant>${icon('message-circle')}Обсудить наблюдения с AI ${arrow}</button>`:''}`;
    if(group){const button=document.createElement('button');button.type='button';button.className='ss-group-btn';button.dataset.tgLink=group;button.innerHTML='Перейти к записям <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13"/></svg>';node.querySelector('[data-group-entry]').append(button);}
    else if(allowed){const p=document.createElement('p');p.className='ss-missing';p.textContent='Ссылка на группу появится здесь. Если она нужна сейчас, напишите ведущей.';node.querySelector('[data-group-entry]').append(p);}
    if(!ended && stream.canAttend && stream.zoomLink)context.appendLink(node.querySelector('[data-live]'),stream.zoomLink,'Присоединиться к Zoom');
    const banner=!ended?document.getElementById('q-banner-wrap'):null;
    const current={node,context,ended,banner,bannerParent:banner?.parentElement};view=current;
    if(banner)node.querySelector('[data-pre-slot]').append(banner);
    node.addEventListener('click',event=>{
      if(view!==current || !node.isConnected || !context.isCurrent()){event.preventDefault();event.stopPropagation();return;}
      const expiry=event.target.closest('[data-tg-link]')?stream.recordingsExpiresAt:event.target.closest('.ss-live a')?stream.aiExpiresAt:null;
      if(expiry && context.now()>=Date.parse(expiry)){event.preventDefault();event.stopPropagation();context.refreshAccess();return;}
      const personal=event.target.closest('[data-personal]')?.dataset.personal;
      if(personal==='diary'||personal==='diag')context.openTab(personal);
      if(personal==='history'||event.target.closest('[data-assistant]'))context.openAi(personal==='history');
      if(event.target.closest('[data-reflection]'))context.openSummary();
    },true);
    document.querySelector('#tab-profile .profile-program')?.classList.add('profile-program--state');
    refreshQuestionnaire();return node;
  }
  return { render, clear, refreshQuestionnaire };
})();
