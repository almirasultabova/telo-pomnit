from pathlib import Path
import re,json,shutil
ROOT=Path(__file__).resolve().parents[2];REL=ROOT/'output/silk-launch-release'
symbols=dict(re.findall(r'<symbol\b[^>]*id="([^"]+)"[^>]*>(.*?)</symbol>',(ROOT/'media/app/icons/lucide.svg').read_text(encoding='utf-8'),re.S))
module=ROOT/'app/js/stream-state.js';s=module.read_text(encoding='utf-8')
s=s.replace('  const icon = name =>', '  const symbols='+json.dumps({name:symbols[name] for name in ['notebook-pen','chart-no-axes-column-increasing','message-circle']})+';\n  const icon = name =>')
s=s.replace(':`<use href="/media/app/icons/lucide.svg#${name}"/>`',':symbols[name]')
module.write_text(s,encoding='utf-8');shutil.copy2(module,REL/'app/js/stream-state.js')
for base in (ROOT,REL):
 def edit(relative,old,new):
  f=base/relative;s=f.read_text(encoding='utf-8');assert s.count(old)==1,(relative,s.count(old));f.write_text(s.replace(old,new),encoding='utf-8')
 edit('app/js/screen-review.js',"['path-example','Мой путь · пример динамики']", "['path-example','Мой путь · пример динамики'],['stream-current','Поток идёт'],['stream-completed','Поток завершён']")
 edit('app/js/screen-review.js',"screen-review.html?v=JAPP021&view=","screen-review.html?v=JAPP060&view=")
 edit('app/js/screen-review-frame.js',"else if(view==='profile-pending') {switchTab('profile');closeQInvite();}","else if(['profile-pending','stream-current','stream-completed'].includes(view)) {switchTab('profile');closeQInvite();}")
 f=base/'app/js/screen-review-fixture.js';s=f.read_text(encoding='utf-8')
 s=s.replace("  const before=", "  const streamView=['stream-current','stream-completed'].includes(view),ended=view==='stream-completed';\n  const before=")
 start=s.index('  const stream=');end=s.index('  window.fetch=',start)
 old=s[start:end].strip().removeprefix('const stream=').removesuffix(';')
 new="""{id:'fictional-stream',name:'Осенний поток',phase:ended?'completed':'current',startDate:'2026-10-01',endDate:'2026-11-05',status:ended?'completed':'active',meetings:[{id:'example-meeting-1',number:1,date:'2026-10-18T08:00:00Z',topic:'Телесная практика',description:'Учебная встреча'},{id:'example-meeting-2',number:2,date:'2026-10-22T15:00:00Z',topic:'Психосоматические разборы',description:'Учебная встреча'}],canUseAi:!ended,canAttend:!ended,canReadRecordings:true,accessExpired:false,aiExpiresAt:'2026-11-05T21:00:00Z',recordingsExpiresAt:'2027-02-05T21:00:00Z',zoomLink:ended?null:'https://example.invalid/zoom',chatLink:'https://t.me/fictional_review_group'}"""
 s=s[:start]+'  const stream=streamView?'+new+':'+old+';\n'+s[end:]
 needle="else if(pathname==='/api/me/enrollment/access' && method==='GET')body=";a=s.index(needle)+len(needle)
 s=s[:a]+"streamView?{serverTime:ended?'2026-11-06T10:00:00Z':'2026-10-17T10:00:00Z',streams:[stream],diary:true,checkins:true,reactions:true,aiHistory:true,ai:{canWrite:!ended,reason:ended?'ended':'active',message:ended?'Новые сообщения AI доступны во время потока. История разговоров сохраняется.':'AI доступен во время потока.'}}:"+s[a:]
 f.write_text(s,encoding='utf-8')
print('Real components use the accepted icon paths; two staff-only review cases added without credentials or real links')
