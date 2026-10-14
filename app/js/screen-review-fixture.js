// Review document only. All answers are fictional and live only in this page's memory.
(() => {
  Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Просмотр без памяти устройства','SecurityError');},configurable:false});
  const noop=()=>{};
  window.Telegram={WebApp:{initData:'',ready:noop,expand:noop,onEvent:noop,offEvent:noop,openLink:noop,openTelegramLink:noop,
    BackButton:{show:noop,hide:noop,onClick:noop,offClick:noop},HapticFeedback:{impactOccurred:noop,notificationOccurred:noop}}};
  const view=new URLSearchParams(location.search).get('view') || 'pre';
  const before={currentSituation:'После сложных разговоров я ещё долго чувствую напряжение в теле.',successMeans:'Замечать напряжение раньше и находить способ поддержать себя.',bodyContactScale:3,anxietyScale:8};
  const after={currentSituation:'Напряжение ещё бывает. Я чаще замечаю его во время разговора и могу сделать паузу.',bodyContactScale:6,anxietyScale:5,situationChange:'Стало немного легче',criterionMatch:'Частично соответствует',lifeExample:'Во время разговора я заметила, что сжала челюсть. Сделала паузу и вернулась к разговору спокойнее.'};
  let pre=['pre','home-pending','q-invite','profile-pending'].includes(view) ? null : {id:'fictional-pre',type:'pre',streamId:'fictional-stream',formVersion:1,submittedAt:'2026-09-01T10:00:00Z',answers:before};
  let post=view==='compared' ? {id:'fictional-post',type:'post',streamId:'fictional-stream',formVersion:2,submittedAt:'2026-10-02T10:00:00Z',answers:after} : null;
  const stream={id:'fictional-stream',name:'Пример потока',phase:['pre','pre-thanks','home-pending','q-invite','profile-pending','path-empty','path-example'].includes(view)?'current':'completed',startDate:'2026-09-01',endDate:'2026-09-30',meetings:[{id:'example-meeting-1',number:1,date:'2026-09-03T16:00:00Z',topic:'Встреча · учебный пример',description:'Вымышленное расписание для проверки оформления'}],canUseAi:false,canAttend:false,canReadRecordings:false};
  window.fetch=async (url,options={})=>{
    const parsed=new URL(typeof url==='string'?url:url.url,location.href);
    if(parsed.origin!==new URL(location.href).origin)return new Response(JSON.stringify({error:'Внешние запросы отключены'}),{status:403});
    const pathname=parsed.pathname,method=options.method || 'GET';
    const data=options.body?JSON.parse(options.body):{};
    let body,status=200;
    if(pathname==='/api/auth/telegram' && method==='POST')body={token:'fictional-review-only',user:{id:'fictional-review-user',name:'Участница · пример',role:'PARTICIPANT',consentGivenAt:'2026-09-01'}};
    else if(pathname==='/api/me' && method==='GET')body={user:{id:'fictional-review-user',name:'Участница · пример',consentGivenAt:'2026-09-01'}};
    else if(pathname==='/api/me/enrollment/access' && method==='GET')body={serverTime: ['home-pending','q-invite','profile-pending','path-empty','path-example'].includes(view) ? '2026-09-24T10:00:00Z' : '2026-10-02T10:00:00Z',streams:[stream],diary:true,checkins:true,reactions:true,aiHistory:true,ai:{canWrite:false,reason:'ended',message:'Режим просмотра'}};
    else if(pathname==='/api/questionnaires/pre' && options.method==='POST'){pre={id:'fictional-pre',type:'pre',streamId:stream.id,formVersion:1,submittedAt:'2026-09-01T10:00:00Z',answers:structuredClone(data.answers)};body=pre;}
    else if(pathname==='/api/questionnaires/post' && options.method==='POST'){post={id:'fictional-post',type:'post',streamId:stream.id,formVersion:2,submittedAt:'2026-10-02T10:00:00Z',answers:structuredClone(data.answers)};body=post;}
    else if(pathname.startsWith('/api/questionnaires/') && (!options.method || options.method==='GET'))body={pre,post};
    else if(pathname==='/api/checkins' && method==='GET' && view==='path-example') body=[
      {id:'example-state-1',date:'2026-09-02T10:00:00Z',tension:7,anxiety:8,energy:3,safety:4,bodyContact:3},
      {id:'example-state-2',date:'2026-09-10T10:00:00Z',tension:6,anxiety:7,energy:5,safety:4,bodyContact:4},
      {id:'example-state-3',date:'2026-09-17T10:00:00Z',tension:7,anxiety:5,energy:4,safety:6,bodyContact:5},
      {id:'example-state-4',date:'2026-09-23T10:00:00Z',tension:4,anxiety:6,energy:6,safety:6,bodyContact:7}
    ];
    else if(['/api/diary','/api/triggers','/api/checkins','/api/ai/sessions'].includes(pathname) && (!options.method || options.method==='GET'))body=[];
    else if(['/api/habitual/result','/api/diagnostic/result'].includes(pathname) && (!options.method || options.method==='GET'))body=null;
    else {status=403;body={error:'В режиме просмотра это действие недоступно'};}
    return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
  };
})();
