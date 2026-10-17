"""Transfer approved visuals and guarded native callbacks. No fictional state is shipped."""
from pathlib import Path
import shutil
ROOT=Path(__file__).resolve().parents[2];REL=ROOT/'output/silk-launch-release'
css=(ROOT/'audit/stream-states-JAPP059/panel.css').read_text(encoding='utf-8')
css=css.replace('/* Scoped extension of the approved J-APP-057 composition; prototype only. */','/* J-APP-060: accepted native stream states. */').replace('#tab-profile .profile-program{display:none}\n','').replace('.stream-state-preview','.stream-state-panel')
css+='''\n.profile-program--state .profile-program-access{display:none}
.profile-program--state #next-meeting-card{background:transparent;padding:0}
.ss-hero h2{overflow-wrap:anywhere}.ss-next strong{overflow-wrap:anywhere}
.ss-live:empty{display:none}.ss-live .btn{margin:15px 0 0;min-height:44px;border-color:#b5c1ad;color:#fffdf8;font-size:13px;background:transparent}
.profile-program:not(.profile-program--state)>.ss-calendar>summary{display:none}
.profile-program--state .ss-calendar #schedule-section>h2{display:none}
.profile-program--state #owned-stream-select{margin:6px 0 15px}
'''
for base in (ROOT,REL):
 def edit(relative,old,new):
  f=base/relative;s=f.read_text(encoding='utf-8');assert s.count(old)==1,(relative,s.count(old));f.write_text(s.replace(old,new),encoding='utf-8')
 if base!=ROOT:shutil.copy2(ROOT/'app/js/stream-state.js',base/'app/js/stream-state.js')
 (base/'app/css/stream-state.css').write_text(css,encoding='utf-8')
 edit('app/index.html','</head>','<link rel="stylesheet" href="css/stream-state.css?v=JAPP060">\n</head>')
 edit('app/index.html','<script src="js/app.js?v=access-20260922"></script>','<script src="js/stream-state.js?v=JAPP060"></script>\n<script src="js/app.js?v=access-20260922"></script>')
 edit('app/index.html','<div id="schedule-section"></div>','<details class="ss-calendar" id="program-calendar" open><summary id="program-calendar-title">Расписание встреч</summary><div id="schedule-section"></div></details>')
 edit('backend/src/routes/me.js','const recordings = now >= bounds.start && now < bounds.end && !revokedByExpiry','const recordings = now >= bounds.start && now < bounds.recordingsEnd && !revokedByExpiry')
 edit('backend/src/routes/me.js','aiExpiresAt: new Date(bounds.end).toISOString(), recordingsExpiresAt: new Date(bounds.end).toISOString(),','aiExpiresAt: new Date(bounds.end).toISOString(), recordingsExpiresAt: new Date(bounds.recordingsEnd).toISOString(),\n      accessExpired: Boolean(revokedByExpiry),')
 edit('app/js/app.js',"  window.PathDynamics?.reset();","  window.PathDynamics?.reset();\n  window.StreamStatePanel?.clear();")
 edit('app/js/app.js',"  el.replaceChildren();\n  if(programRefreshError", "  el.replaceChildren();\n  window.StreamStatePanel?.clear();\n  if(programRefreshError")
 old="      el.append(feature);\n    }\n    if(streams.length>1)"
 new="""      const owner=Api.userId,generation=Api._authGeneration,streamId=stream.id;
      const panel=window.StreamStatePanel?.render({stream:{...stream,phase},now:programNow(),
        aiAvailable:programAccess.ai?.canWrite===true,serviceAccess:['host','admin'].includes(programAccess.ai?.reason),
        isCurrent:()=>Api.isAuthed() && !Api.clubBlocked && Api.userId===owner && Api._authGeneration===generation && currentProgram()?.id===streamId,
        openTab:switchTab,appendLink:appendAccessLink,
        postState:()=>window.QuestionnaireCycle?.getPostState(),openSummary:()=>window.QuestionnaireCycle?.openSummary(),
        openAi:history=>{document.getElementById('ai-chat-btn')?.click();if(history){const details=document.querySelector('.ai-history-disclosure');if(details)details.open=true;}}
      });
      el.append(panel||feature);
    }
    if(streams.length>1)"""
 edit('app/js/app.js',old,new)
 edit('app/js/app.js',"select.value=selectedProgramId;select.addEventListener('change',()=>selectProgram(select.value));el.append(select);", "select.value=selectedProgramId;select.addEventListener('change',()=>selectProgram(select.value));el.prepend(label,select);")
 edit('app/js/app.js',"  const stream=currentProgram();container.replaceChildren();\n  if(stream){", "  const stream=currentProgram();container.replaceChildren();\n  const calendar=document.getElementById('program-calendar');\n  if(calendar){calendar.hidden=!stream;calendar.open=!document.querySelector('.profile-program--state');document.getElementById('program-calendar-title').textContent=stream?.phase==='completed'?'Прошедшие встречи':'Расписание встреч';}\n  if(stream){")
 edit('app/js/questionnaire-cycle.js','window.QuestionnaireCycle={invalidate,setStatus,setPre,refreshEntries,leaving};',"""window.QuestionnaireCycle={invalidate,setStatus,setPre,refreshEntries,leaving,
    getPostState:()=>{const current=source();return !Api.isClubAdmin && Api.userRole!=='HOST' && current.stream?.phase==='completed' ? {streamId:current.stream.id,done:Boolean(current.post)} : null;},
    openSummary:()=>{if(source().post)showComparison();else openPost();}
  };""")
 edit('app/js/questionnaire-cycle.js',"if (!isCurrent(record) || Api.isClubAdmin || Api.userRole==='HOST' || current.stream?.phase !== 'completed') return;", "if (!isCurrent(record) || Api.isClubAdmin || Api.userRole==='HOST' || current.stream?.phase !== 'completed') {window.StreamStatePanel?.refreshQuestionnaire();return;}")
 edit('app/js/questionnaire-cycle.js',"    }\n  }\n  function decoratePreThanks() {", "    }\n    window.StreamStatePanel?.refreshQuestionnaire();\n  }\n  function decoratePreThanks() {")
print('Native states integrated; records window uses agreed three calendar months after stream end; AI/live gates unchanged')
