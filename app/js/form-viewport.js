// Fit editable screens to the visible viewport without changing browser zoom.
(() => {
  let reviewEditing=false, lastScreen=null, queued=false;
  const editable=element=>element?.matches('textarea,input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit])');
  function sync() {
    queued=false;
    const screen=document.querySelector('.screen--active');
    if(lastScreen && lastScreen!==screen) {
      lastScreen.classList.remove('form-viewport','form-editing');
      lastScreen.style.removeProperty('--form-visible-height');
      lastScreen.style.removeProperty('--form-visible-top');
    }
    lastScreen=screen;
    if(!screen || screen.id==='screen-ai-chat')return;
    const field=document.activeElement;
    const editing=(editable(field) && screen.contains(field)) || (screen.id==='screen-screen-review' && reviewEditing);
    const form=screen.matches('#screen-questionnaire,#screen-post-questionnaire,#screen-screen-review') || editing;
    screen.classList.toggle('form-viewport',Boolean(form));
    screen.classList.toggle('form-editing',Boolean(editing));
    if(!form)return;
    const app=document.getElementById('app');
    if(app.scrollTop)app.scrollTop=0;
    if(app.scrollLeft)app.scrollLeft=0;
    const viewport=window.visualViewport;
    const height=Math.min(window.innerHeight,viewport?.height || window.innerHeight);
    const top=Math.max(0,Math.min(viewport?.offsetTop || 0,window.innerHeight-height));
    screen.style.setProperty('--form-visible-height',height+'px');
    screen.style.setProperty('--form-visible-top',top+'px');
    if(!editing || !editable(field))return;
    const scroll=field.closest('.questionnaire-body,.screen-scroll');
    if(!scroll)return;
    const bounds=scroll.getBoundingClientRect(), input=field.getBoundingClientRect();
    if(input.top<bounds.top+10)scroll.scrollTop+=input.top-bounds.top-10;
    else if(input.bottom>bounds.bottom-12)scroll.scrollTop+=Math.min(input.top-bounds.top-10,input.bottom-bounds.bottom+12);
  }
  function schedule() {if(!queued){queued=true;requestAnimationFrame(sync);}}
  window.FormViewport={setReviewEditing(value){reviewEditing=value===true;schedule();}};
  function install() {
    document.addEventListener('focusin',schedule);
    document.addEventListener('focusout',schedule);
    document.getElementById('app').addEventListener('scroll',schedule);
    window.addEventListener('resize',schedule);
    window.visualViewport?.addEventListener('resize',schedule);
    window.visualViewport?.addEventListener('scroll',schedule);
    window.Telegram?.WebApp?.onEvent?.('viewportChanged',schedule);
    new MutationObserver(()=>{if(document.querySelector('.screen--active')!==lastScreen)schedule();})
      .observe(document.getElementById('app'),{subtree:true,attributes:true,attributeFilter:['class']});
    schedule();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
