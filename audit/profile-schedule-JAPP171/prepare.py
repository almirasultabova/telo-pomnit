from pathlib import Path
import subprocess,shutil,json
R=Path(__file__).resolve().parents[2];C=R/'output/silk-launch-release';H=Path(__file__).parent;S=R/'output/profile-schedule-JAPP171/source'
assert not S.exists()
files=subprocess.check_output(['git','-C',str(C),'ls-files','-z']).decode().split('\0')
for f in files:
 if f and f.startswith(('app/','backend/','scripts/','site/','media/'))and(C/f).is_file():
  target=S/f;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(C/f,target)
p=S/'app/js/app.js';s=p.read_text(encoding='utf-8')
def rep(a,b):
 global s
 assert s.count(a)==1,(a,s.count(a));s=s.replace(a,b)
rep('let programRefreshError = false;', '''let programRefreshError = false;
let profileScheduleRequest = null, profileScheduleMessage = null;
function profileScheduleOwned(state) {
  return state && Api.isAuthed() && !Api.clubBlocked && state.owner === Api.userId && state.generation === Api._authGeneration;
}
function syncProfileScheduleFeedback() {
  const button=document.getElementById('profile-schedule-refresh'),status=document.getElementById('profile-schedule-status');
  if(!button||!status)return;
  const loading=!!profileScheduleOwned(profileScheduleRequest),message=profileScheduleOwned(profileScheduleMessage)?profileScheduleMessage:null;
  button.disabled=loading;button.textContent=loading?'Обновляем…':programRefreshError?'Попробовать ещё раз':'Обновить расписание';button.setAttribute('aria-busy',String(loading));
  status.textContent=loading?'':programRefreshError?(programAccess?'Не удалось обновить расписание. Показаны последние загруженные данные.':'Не удалось загрузить расписание. Попробуйте ещё раз.'):message?.state==='success'?'Расписание обновлено.':'';
  status.hidden=!status.textContent;status.classList.toggle('program-refresh-feedback--error',programRefreshError);
  if(status.hidden)button.removeAttribute('aria-describedby');else button.setAttribute('aria-describedby',status.id);
}
async function refreshProfileSchedule() {
  if(profileScheduleOwned(profileScheduleRequest)||!Api.isAuthed()||Api.clubBlocked)return;
  const request={owner:Api.userId,generation:Api._authGeneration};profileScheduleRequest=request;profileScheduleMessage=null;syncProfileScheduleFeedback();
  try {await refreshProgramAccess();}
  finally {
    if(profileScheduleRequest!==request)return;
    profileScheduleRequest=null;
    if(!profileScheduleOwned(request))return;
    profileScheduleMessage={...request,state:programRefreshError?'error':'success'};
    if(currentScreen==='home'&&activeTab==='profile') {
      const active=document.activeElement,focusId=active?.id;
      const restore=active===document.body||active===document.getElementById('screen-home')||active===document.getElementById('tab-profile')||active?.classList.contains('program-refresh');
      renderProfileTab();
      const previous=focusId&&document.getElementById(focusId);
      if(previous?.isConnected&&previous.matches('button,select,input,textarea,a[href]'))previous.focus({preventScroll:true});else if(restore)document.getElementById('profile-schedule-refresh')?.focus({preventScroll:true});
    }
  }
}''')
rep("  if(programRefreshError && programAccess){const notice=document.createElement('p');notice.className='program-status';notice.setAttribute('role','status');notice.textContent='Не удалось обновить расписание. Показаны последние загруженные данные.';el.append(notice);}\n",'')
rep("select.value=selectedProgramId;select.addEventListener('change',()=>selectProgram(select.value));el.prepend(label,select);","select.value=selectedProgramId;select.addEventListener('change',()=>{\n        const owner=Api.userId,generation=Api._authGeneration;selectProgram(select.value);const chosen=selectedProgramId;\n        requestAnimationFrame(()=>{\n          if(currentScreen!=='home'||activeTab!=='profile'||owner!==Api.userId||generation!==Api._authGeneration||chosen!==selectedProgramId||Api.clubBlocked)return;\n          const next=document.getElementById('owned-stream-select'),active=document.activeElement;\n          if(active?.matches('button,a[href],input,textarea,select')&&active!==select&&active!==next)return;\n          next?.focus({preventScroll:true});\n        });\n      });el.prepend(label,select);")
rep("const refresh=document.createElement('button');refresh.className='btn btn--ghost btn--sm program-refresh';refresh.textContent='Обновить расписание';\n  refresh.addEventListener('click',async()=>{refresh.disabled=true;await refreshProgramAccess();renderProfileTab();});el.append(refresh);","const refresh=document.createElement('button');refresh.id='profile-schedule-refresh';refresh.type='button';refresh.className='btn btn--ghost btn--sm program-refresh';\n  refresh.addEventListener('click',refreshProfileSchedule);\n  const feedback=document.createElement('p');feedback.id='profile-schedule-status';feedback.className='program-refresh-feedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');feedback.setAttribute('aria-atomic','true');\n  el.append(refresh,feedback);syncProfileScheduleFeedback();")
rep('function clearPrivateConversationState() {','function clearPrivateConversationState() {\n  profileScheduleRequest=null;profileScheduleMessage=null;')
p.write_text(s,encoding='utf-8')
p=S/'app/css/ux-personal.css';p.write_text(p.read_text(encoding='utf-8')+'''\n/* JAPP171: schedule feedback beside its refresh action. */
#tab-profile .program-refresh-feedback{margin:10px 0 0;padding:12px 14px;border-radius:12px;background:#e7ebdf;color:#2a4a38;font:400 13px/1.6 var(--font-body);overflow-wrap:anywhere}
#tab-profile .program-refresh-feedback--error{background:#f2e8e2;color:#783c30}
#tab-profile .program-refresh[aria-busy=true]{cursor:progress}
''',encoding='utf-8')
subprocess.run(['node','scripts/build-static.mjs'],cwd=S,check=True)
(H/'source-baseline.json').write_text(json.dumps({'baseCommit':subprocess.check_output(['git','-C',str(C),'rev-parse','HEAD'],text=True).strip(),'sourceChanges':['app/js/app.js','app/css/ux-personal.css'],'backendChanged':False,'apiChanged':False,'published':False},indent=2),encoding='utf-8')
print('PASS local two-source candidate, no backend/API changes')
