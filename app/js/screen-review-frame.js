// Route the fictional document to the selected real widget. No parent credentials are read.
(() => {
  const view=new URLSearchParams(location.search).get('view') || 'pre';
  let started=false;
  const exit=()=>window.parent.postMessage({type:'telo-screen-review-exit'},'*');
  function open() {
    if(started || !document.getElementById('screen-home')?.classList.contains('screen--active'))return;
    if(!qStatusVerified)return;
    started=true;
    if(view==='q-invite') {showQInvite();}
    else if(view==='home-pending') {closeQInvite();}
    else if(['profile-pending','stream-current','stream-completed'].includes(view)) {switchTab('profile');closeQInvite();}
    else if(view==='path-empty' || view==='path-example') {switchTab('diag');closeQInvite();}
    else if(view==='pre')openQuestionnaire();
    else if(view==='pre-thanks') {
      document.getElementById('questionnaire-body').innerHTML='<div class="q-done-title">Спасибо</div>';
      const footer=document.querySelector('#screen-questionnaire .questionnaire-footer');
      footer.innerHTML='<button class="btn btn--accent btn--full" type="button">Вернуться в приложение</button>';footer.querySelector('button').onclick=exit;
      goTo('questionnaire');
    } else {
      document.querySelector('#home-q-banner-wrap [data-post-entry]')?.click();
      if(view==='post-thanks') {
        document.querySelector('#post-body [data-scale="bodyContactScale"][data-value="6"]')?.click();
        for(let i=0;i<8;i++)document.getElementById('post-next')?.click();
      }
    }
    closeQuestionnaire=exit;
    for(const id of ['post-close','thanks-home','comparison-close','comparison-home']) {
      const button=document.getElementById(id);if(button)button.onclick=exit;
    }
    document.querySelector('#screen-questionnaire .q-close-btn')?.addEventListener('click',exit);
    queueMicrotask(()=>window.parent.postMessage({type:'telo-screen-review-ready'},'*'));
  }
  function install() {
    const editing=()=>window.parent.postMessage({type:'telo-screen-review-editing',editing:document.activeElement?.matches('textarea,input:not([type=checkbox]):not([type=radio]):not([type=range])')===true},'*');
    document.addEventListener('focusin',editing);
    document.addEventListener('focusout',()=>queueMicrotask(editing));
    new MutationObserver(open).observe(document.getElementById('app'),{attributes:true,attributeFilter:['class'],childList:true,subtree:true});open();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
