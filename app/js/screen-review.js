// Staff-only visual review. The opaque sandbox receives no token or participant data.
(() => {
  const views=[['pre','Начальная анкета'],['pre-thanks','Спасибо · начальная анкета'],['post','Итоговая анкета'],['post-thanks','Спасибо · итоговая анкета'],['compared','Мой путь · ответы до и после'],['home-pending','Главная · анкета не заполнена'],['q-invite','Приглашение к анкете'],['profile-pending','Профиль · анкета не заполнена'],['path-empty','Мой путь · без записей'],['path-example','Мой путь · пример динамики']];
  let frame=null, identity=null, loadingTimer=null;
  const allowed=()=>Api.isAuthed() && !Api.clubBlocked && (Api.isClubAdmin || ['HOST','ADMIN'].includes(Api.userRole));
  const current=()=>allowed() && identity?.owner===Api.userId && identity?.generation===Api._authGeneration;
  function invalidate() {
    window.FormViewport?.setReviewEditing(false);
    clearTimeout(loadingTimer);
    frame?.remove(); frame=null; identity=null;
    const button=document.getElementById('screen-review-entry'); if(button)button.hidden=!allowed();
  }
  function leave(screen) { if(screen==='screen-review')invalidate(); }
  function close() { invalidate(); if(!Api.clubBlocked){goTo('home');switchTab('profile');} }
  function load(view) {
    if(!current() || !views.some(([id])=>id===view))return;
    clearTimeout(loadingTimer);frame?.remove();
    window.FormViewport?.setReviewEditing(false);
    const status=document.getElementById('screen-review-status');status.hidden=false;status.textContent='Открываем экран…';
    frame=document.createElement('iframe');frame.id='screen-review-frame';frame.title=views.find(([id])=>id===view)[1];
    frame.setAttribute('sandbox','allow-scripts');frame.setAttribute('referrerpolicy','no-referrer');
    frame.src='screen-review.html?v=JAPP021&view='+encodeURIComponent(view);frame.hidden=true;
    const expected=frame;
    document.getElementById('screen-review-stage').append(frame);
    frame.addEventListener('error',()=>{if(current())status.textContent='Не удалось открыть экран. Выберите его ещё раз.';});
    loadingTimer=setTimeout(()=>{if(current() && frame===expected && frame.hidden){status.textContent='Экран не загрузился. Проверьте соединение и повторите.';document.getElementById('screen-review-retry').hidden=false;}},12000);
    document.getElementById('screen-review-retry').hidden=true;
  }
  function open() {
    if(!allowed())return;
    identity={owner:Api.userId,generation:Api._authGeneration};
    document.getElementById('screen-review-choice').value='pre';goTo('screen-review');load('pre');
  }
  function renderEntry() {
    const target=document.getElementById('profile-account-actions');if(!target)return;
    let button=document.getElementById('screen-review-entry');
    if(!button && allowed()) {
      button=document.createElement('button');button.id='screen-review-entry';button.className='profile-link-btn';button.type='button';
      button.innerHTML='<svg aria-hidden="true" class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 22h8m-4-4v4m-4-11 3 3 5-6"/></svg><span>Проверить экраны</span><svg aria-hidden="true" class="profile-link-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m9 5 7 7-7 7"/></svg>';
      button.onclick=open;target.append(button);
    }
    if(button)button.hidden=!allowed();
  }
  window.ScreenReview={renderEntry,invalidate,leave};
  function install() {
    const screen=document.createElement('div');screen.className='screen';screen.id='screen-screen-review';screen.inert=true;screen.setAttribute('aria-hidden','true');
    screen.innerHTML=`<div class="screen-review-wrap"><header class="screen-review-header"><button id="screen-review-close" class="q-close-btn" type="button" aria-label="Вернуться в Профиль"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg></button><h1>Проверить экраны</h1></header><div class="screen-review-controls"><p>Режим просмотра · учебные данные, ответы не сохраняются</p><label for="screen-review-choice">Выберите экран</label><select id="screen-review-choice">${views.map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select></div><div class="screen-review-stage" id="screen-review-stage"><p id="screen-review-status" role="status">Открываем экран…</p><button id="screen-review-retry" class="btn btn--outline" type="button" hidden>Повторить загрузку</button></div></div>`;
    document.getElementById('app').append(screen);
    document.getElementById('screen-review-close').onclick=close;
    document.getElementById('screen-review-choice').onchange=event=>load(event.target.value);
    document.getElementById('screen-review-retry').onclick=()=>load(document.getElementById('screen-review-choice').value);
    window.addEventListener('message',event=>{
      if(!current() || event.source!==frame?.contentWindow)return;
      if(event.data?.type==='telo-screen-review-editing' && typeof event.data.editing==='boolean')window.FormViewport?.setReviewEditing(event.data.editing);
      if(event.data?.type==='telo-screen-review-ready') {clearTimeout(loadingTimer);frame.hidden=false;document.getElementById('screen-review-status').hidden=true;document.getElementById('screen-review-retry').hidden=true;}
      if(event.data?.type==='telo-screen-review-exit')close();
    });
    renderEntry();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
