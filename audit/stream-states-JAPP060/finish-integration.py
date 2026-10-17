from pathlib import Path
import shutil
ROOT=Path(__file__).resolve().parents[2];REL=ROOT/'output/silk-launch-release'
for base in (ROOT,REL):
 def edit(relative,old,new):
  f=base/relative;s=f.read_text(encoding='utf-8')
  if old not in s and new and new in s:return
  assert s.count(old)==1,(relative,s.count(old));f.write_text(s.replace(old,new),encoding='utf-8')
 edit('app/js/app.js',"{stream:{...stream,phase},now:programNow(),","{stream:{...stream,phase},now:programNow,refreshAccess:()=>refreshProgramAccess().then(renderProfileTab),")
 edit('app/js/app.js',"  if(calendar){calendar.hidden=!stream;calendar.open=!document.querySelector('.profile-program--state');document.getElementById('program-calendar-title').textContent=stream?.phase==='completed'?'Прошедшие встречи':'Расписание встреч';}","""  if(calendar){
    const scope=[Api.userId,Api._authGeneration,stream?.id].join(':');
    calendar.hidden=!stream;
    if(calendar.dataset.scope!==scope){calendar.open=!document.querySelector('.profile-program--state');calendar.dataset.scope=scope;}
    document.getElementById('program-calendar-title').textContent=stream?.phase==='completed'?'Прошедшие встречи':'Расписание встреч';
  }""")
 edit('app/css/stream-state.css','\n.ss-calendar #schedule-section>h2{display:none}\n','\n')
 f=base/'app/css/stream-state.css'
 if '.ss-pre #q-banner-wrap:empty' not in f.read_text(encoding='utf-8'):f.write_text(f.read_text(encoding='utf-8')+'\n.ss-pre #q-banner-wrap:empty{display:none}\n.ss-reflection:empty{display:none}\n',encoding='utf-8')
 if base!=ROOT:shutil.copy2(ROOT/'app/js/stream-state.js',base/'app/js/stream-state.js')
print('Preserved first-week banner, persistent schedule disclosure, and expiry checks on group/Zoom actions')
