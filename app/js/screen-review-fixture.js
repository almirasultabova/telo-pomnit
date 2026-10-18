// Review document only. All answers are fictional and live only in this page's memory.
(() => {
  Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Просмотр без памяти устройства','SecurityError');},configurable:false});
  const noop=()=>{};
  window.Telegram={WebApp:{initData:'',ready:noop,expand:noop,onEvent:noop,offEvent:noop,openLink:noop,openTelegramLink:noop,
    BackButton:{show:noop,hide:noop,onClick:noop,offClick:noop},HapticFeedback:{impactOccurred:noop,notificationOccurred:noop}}};
  window.ScreenReviewMode=true;
  let reviewCheckins=[];
  const view=new URLSearchParams(location.search).get('view') || 'pre';
  const streamView=['stream-current','stream-completed'].includes(view),ended=view==='stream-completed';
  const before={currentSituation:'После сложных разговоров я ещё долго чувствую напряжение в теле.',successMeans:'Замечать напряжение раньше и находить способ поддержать себя.',bodyContactScale:3,anxietyScale:8};
  const after={currentSituation:'Напряжение ещё бывает. Я чаще замечаю его во время разговора и могу сделать паузу.',bodyContactScale:6,anxietyScale:5,situationChange:'Стало немного легче',criterionMatch:'Частично соответствует',lifeExample:'Во время разговора я заметила, что сжала челюсть. Сделала паузу и вернулась к разговору спокойнее.'};
  let pre=['pre','home-pending','q-invite','profile-pending'].includes(view) ? null : {id:'fictional-pre',type:'pre',streamId:'fictional-stream',formVersion:1,submittedAt:'2026-09-01T10:00:00Z',answers:before};
  let post=view==='compared' ? {id:'fictional-post',type:'post',streamId:'fictional-stream',formVersion:2,submittedAt:'2026-10-02T10:00:00Z',answers:after} : null;
  const stream=streamView?{id:'fictional-stream',name:'Осенний поток',phase:ended?'completed':'current',startDate:'2026-10-01',endDate:'2026-11-05',status:ended?'completed':'active',meetings:[{id:'example-meeting-1',number:1,date:'2026-10-18T08:00:00Z',topic:'Телесная практика',description:'Учебная встреча'},{id:'example-meeting-2',number:2,date:'2026-10-22T15:00:00Z',topic:'Психосоматические разборы',description:'Учебная встреча'}],canUseAi:!ended,canAttend:!ended,canReadRecordings:true,accessExpired:false,aiExpiresAt:'2026-11-05T21:00:00Z',recordingsExpiresAt:'2027-02-05T21:00:00Z',zoomLink:ended?null:'https://example.invalid/zoom',chatLink:'https://t.me/fictional_review_group'}:{id:'fictional-stream',name:'Пример потока',phase:['pre','pre-thanks','home-pending','q-invite','profile-pending','path-empty','path-example'].includes(view)?'current':'completed',startDate:'2026-09-01',endDate:'2026-09-30',meetings:[{id:'example-meeting-1',number:1,date:'2026-09-03T16:00:00Z',topic:'Встреча · учебный пример',description:'Вымышленное расписание для проверки оформления'}],canUseAi:false,canAttend:false,canReadRecordings:false};
  const meetingNotes=[];
  window.fetch=async (url,options={})=>{
    const parsed=new URL(typeof url==='string'?url:url.url,location.href);
    if(parsed.origin!==new URL(location.href).origin)return new Response(JSON.stringify({error:'Внешние запросы отключены'}),{status:403});
    const pathname=parsed.pathname,method=options.method || 'GET';
    const data=options.body?JSON.parse(options.body):{};
    let body,status=200;
    if(pathname==='/api/auth/telegram' && method==='POST')body={token:'fictional-review-only',user:{id:'fictional-review-user',name:'Участница · пример',role:'PARTICIPANT',consentGivenAt:'2026-09-01'}};
    else if(pathname==='/api/me/visit' && method==='POST')body={ok:true};
    else if(pathname==='/api/me/profile-stats' && method==='GET')body={visitStreak:1,savedObservations:0};
    else if(pathname==='/api/me' && method==='GET')body={user:{id:'fictional-review-user',name:'Участница · пример',consentGivenAt:'2026-09-01'}};
    else if(pathname==='/api/me/enrollment/access' && method==='GET')body=streamView?{serverTime:ended?'2026-11-06T10:00:00Z':'2026-10-17T10:00:00Z',streams:[stream],diary:true,checkins:true,reactions:true,aiHistory:true,ai:{canWrite:!ended,reason:ended?'ended':'active',message:ended?'Новые сообщения AI доступны во время потока. История разговоров сохраняется.':'AI доступен во время потока.'}}:{serverTime: ['home-pending','q-invite','profile-pending','path-empty','path-example'].includes(view) ? '2026-09-24T10:00:00Z' : '2026-10-02T10:00:00Z',streams:[stream],diary:true,checkins:true,reactions:true,aiHistory:true,ai:{canWrite:false,reason:'ended',message:'Режим просмотра'}};
    else if(pathname==='/api/questionnaires/pre' && options.method==='POST'){pre={id:'fictional-pre',type:'pre',streamId:stream.id,formVersion:1,submittedAt:'2026-09-01T10:00:00Z',answers:structuredClone(data.answers)};body=pre;}
    else if(pathname==='/api/questionnaires/post' && options.method==='POST'){post={id:'fictional-post',type:'post',streamId:stream.id,formVersion:2,submittedAt:'2026-10-02T10:00:00Z',answers:structuredClone(data.answers)};body=post;}
    else if(pathname.startsWith('/api/questionnaires/') && (!options.method || options.method==='GET'))body={pre,post};
    else if(pathname==='/api/checkins' && method==='POST') {
      const keys=['tension','anxiety','energy','safety','bodyContact'];
      if(!keys.every(key=>Number.isInteger(data[key])&&data[key]>=1&&data[key]<=10)||!Number.isFinite(Date.parse(data.createdAt))||!Number.isFinite(Date.parse(data.clientUpdatedAt))){status=400;body={error:'Проверьте учебные оценки'};}
      else {const dayKey=new Date(Date.parse(data.createdAt)+10800000).toISOString().slice(0,10);body={...data,id:'fictional-checkin-'+dayKey,dayKey};reviewCheckins=reviewCheckins.filter(row=>row.dayKey!==dayKey).concat(body);}
    }
    else if(pathname==='/api/checkins' && method==='GET' && reviewCheckins.length)body=reviewCheckins;
    else if(pathname==='/api/checkins' && method==='GET' && view==='path-example') body=[
      {id:'example-state-1',date:'2026-09-02T10:00:00Z',tension:7,anxiety:8,energy:3,safety:4,bodyContact:3},
      {id:'example-state-2',date:'2026-09-10T10:00:00Z',tension:6,anxiety:7,energy:5,safety:4,bodyContact:4},
      {id:'example-state-3',date:'2026-09-17T10:00:00Z',tension:7,anxiety:5,energy:4,safety:6,bodyContact:5},
      {id:'example-state-4',date:'2026-09-23T10:00:00Z',tension:4,anxiety:6,energy:6,safety:6,bodyContact:7}
    ];
    else if(pathname==='/api/after-meeting-notes' && (!options.method || options.method==='GET'))body=meetingNotes.slice(Number(parsed.searchParams.get('offset')||0),Number(parsed.searchParams.get('offset')||0)+Number(parsed.searchParams.get('limit')||50));
    else if(pathname==='/api/after-meeting-notes' && options.method==='POST'){const data=JSON.parse(options.body);body=meetingNotes.find(x=>x.clientId===data.clientId);if(!body){body={...data,id:crypto.randomUUID(),revision:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};meetingNotes.push(body);}}
    else if(pathname.startsWith('/api/after-meeting-notes/') && options.method==='PUT'){const i=meetingNotes.findIndex(x=>x.id===pathname.split('/').pop());if(i<0){status=404;body={error:'Заметка не найдена'};}else{body={...meetingNotes[i],...JSON.parse(options.body),revision:meetingNotes[i].revision+1};meetingNotes[i]=body;}}
    else if(['/api/diary','/api/triggers','/api/checkins','/api/ai/sessions'].includes(pathname) && (!options.method || options.method==='GET'))body=[];
    else if(['/api/habitual/result','/api/diagnostic/result'].includes(pathname) && (!options.method || options.method==='GET'))body=null;
    else {status=403;body={error:'В режиме просмотра это действие недоступно'};}
    return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
  };
})();
