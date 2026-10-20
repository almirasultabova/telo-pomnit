from pathlib import Path
import importlib.util,copy,asyncio
spec=importlib.util.spec_from_file_location('profile_base147',Path(__file__).resolve().parents[1]/'ui-consistency-JAPP147/fixture.py');base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
ACCESS=copy.deepcopy(base.ACCESS)
ACCESS['ai']={'canWrite':False,'reason':'purchase_required','message':'Учебный просмотр профиля.'}
ACCESS['streams']=[{**ACCESS['streams'][0],'name':'Октябрьский учебный поток','meetings':[{'id':'profile-meeting-1','number':1,'date':'2026-10-21T15:00:00Z','topic':'Психосоматический разбор','description':'Учебное описание встречи.','prepare':'Приготовьте удобное место.'}]},{**ACCESS['streams'][0],'id':'17100000-0000-4000-8000-000000000002','name':'Завершённый учебный поток','phase':'completed','status':'completed','canAttend':False,'canReadRecordings':False,'startDate':'2026-08-01T12:00:00Z','endDate':'2026-09-01T12:00:00Z','meetings':[]}]
async def boot(browser,origin,width=390):
 p=await base.boot(browser,origin,width);p.profile_access=copy.deepcopy(ACCESS);p.profile_fault=False;p.profile_gate=None;p.profile_reads=0
 async def access(route):
  p.profile_reads+=1
  if p.profile_gate:await p.profile_gate.wait()
  if p.profile_fault:return await route.fulfill(status=503,json={'error':'Synthetic schedule error'})
  return await route.fulfill(json=p.profile_access)
 await p.route('**/api/me/enrollment/access',access)
 await p.route('**/api/questionnaires/**',lambda route:route.fulfill(json={'pre':None,'post':None}))
 await p.evaluate('access=>{applyProgramAccess(access);switchTab("profile")}',p.profile_access);return p
