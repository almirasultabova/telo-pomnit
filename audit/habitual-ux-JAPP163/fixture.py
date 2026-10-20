from pathlib import Path
import importlib.util,copy
spec=importlib.util.spec_from_file_location('base_ui147',Path(__file__).resolve().parents[1]/'ui-consistency-JAPP147/fixture.py');base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
async def boot(browser,origin,width=390):
 p=await base.boot(browser,origin,width);p.habitual_result=None;p.habitual_posts=[];p.habitual_fault='ok'
 async def habitual(route):
  request=route.request
  if request.method=='POST':
   data=request.post_data_json;p.habitual_posts.append(copy.deepcopy(data))
   if p.habitual_fault=='fail':return await route.fulfill(status=503,json={'error':'Учебная ошибка сохранения'})
   p.habitual_result={**data,'date':'2026-10-20T12:00:00Z'}
  await route.fulfill(json=p.habitual_result)
 await p.route('**/api/habitual/result',habitual)
 await p.evaluate("switchTab('diag');Storage.ensurePathPeriod(pathPeriodScope())")
 await p.evaluate("renderMyPathTab()");return p
