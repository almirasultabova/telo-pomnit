// Route the fictional document to the selected real widget. No parent credentials are read.
(() => {
  const view=new URLSearchParams(location.search).get('view') || 'pre';
  let started=false;
  const exit=()=>window.parent.postMessage({type:'telo-screen-review-exit'},'*');
  function open() {
    if(started || !document.getElementById('screen-home')?.classList.contains('screen--active'))return;
    if(!qStatusVerified)return;
    started=true;
    if(view==='pre')openQuestionnaire();
    else if(view==='pre-thanks') {
      document.getElementById('questionnaire-body').innerHTML='<div class="q-done-title">Спасибо</div>';
      const footer=document.querySelector('#screen-questionnaire .questionnaire-footer');
      footer.innerHTML='<button class="btn btn--accent btn--full" type="button">Вернуться в приложение</button>';footer.querySelector('button').onclick=exit;
      goTo('questionnaire');
    } else {
      document.querySelector('#home-q-banner-wrap [data-post-entry]')?.click();
      if(view==='post-thanks')for(let i=0;i<8;i++)document.getElementById('post-next')?.click();
    }
    closeQuestionnaire=exit;
    for(const id of ['post-close','thanks-home','comparison-close','comparison-home']) {
      const button=document.getElementById(id);if(button)button.onclick=exit;
    }
    document.querySelector('#screen-questionnaire .q-close-btn')?.addEventListener('click',exit);
    queueMicrotask(()=>window.parent.postMessage({type:'telo-screen-review-ready'},'*'));
  }
  function install() {
    new MutationObserver(open).observe(document.getElementById('app'),{attributes:true,attributeFilter:['class'],childList:true,subtree:true});open();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
