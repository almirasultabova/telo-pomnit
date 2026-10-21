from pathlib import Path
import copy,json,asyncio,os
ORIGIN=os.environ.get("J178_ORIGIN","http://127.0.0.1:15777").rstrip("/")
H=Path(__file__).parent;DATA=json.loads((H/'data.json').read_text(encoding='utf-8'))
async def boot(browser,width=390,side='after',owner=False):
 p=await browser.new_page(viewport={'width':width,'height':844});p.errors=[];p.calls=[];p.mode='fail';p.gate=None;p.started=asyncio.Event();p.denied=False;p.payloads=copy.deepcopy(DATA);p.history_error=False;p.get_gate=None
 if owner:
  for d in p.payloads.values():
   d['rights']['triage']=True;d['data']['legacy']=[{'id':'legacy-demo','revision':1,'text':'Учебное прежнее сообщение'}]
 async def boundary(route):
  if route.request.method not in ['GET','HEAD']:
   p.errors.append('unexpected real mutation');return await route.abort()
  return await route.continue_()
 await p.route('**/*',boundary)
 async def harness(route):
  html='<html><script>window.getStreamOverviewToken=()=>"synthetic-memory-token"</script><style>body{margin:0}iframe{border:0;width:100%;height:100vh}</style><iframe src="/stream-overview.html"></iframe></html>'
  await route.fulfill(content_type='text/html',body=html)
 await p.route('**/__j178-harness*',harness)
 p.on('pageerror',lambda e:p.errors.append(str(e)))
 async def api(route):
  r=route.request;path=r.url.split('/api/stream-overview/',1)[1].split('?')[0]
  if p.denied:return await route.fulfill(status=403,json={'error':'Учебный доступ отозван.'})
  if r.method=='POST':
   body=r.post_data_json;p.calls.append(body);p.started.set()
   if p.gate:await p.gate.wait()
   if p.mode=='conflict':return await route.fulfill(status=409,json={'error':'Учебная карточка изменилась.'})
   if p.mode=='ok':
    id=path.rsplit('/',1)[-1]
    for d in p.payloads.values():
     if body['action']=='classify':d['data']['legacy']=[r for r in d['data']['legacy']if r['id']!=id]
     for row in d['data']['requests']:
      if row['id']==id:
       row['revision']+=1
       if body['action']=='take':row.update(status='in-progress',assignee='host-demo',assigneeName='Учебная ведущая',takenAt='2026-10-15T10:00:00Z')
       else:row.update(status='answered',answeredAt='2026-10-15T11:00:00Z',answeredBy='Учебная ведущая')
    return await route.fulfill(json={'ok':True})
   return await route.fulfill(status=503,json={'error':'Учебная ошибка соединения.'})
  if path=='session':return await route.fulfill(json={'id':'host-demo','name':'Учебная ведущая','triage':owner,'streams':[{'id':d['data']['id'],'name':d['data']['name']}for d in p.payloads.values()]})
  if p.get_gate:await p.get_gate.wait()
  data=next((d for d in p.payloads.values()if d['data']['id']==path),None)
  if p.history_error:return await route.fulfill(status=503,json={'error':'Учебная ошибка загрузки.'})
  return await route.fulfill(json=data or{})
 await p.route('**/api/stream-overview/**',api)
 await p.goto(ORIGIN+'/__j178-harness',wait_until='domcontentloaded');f=p.frame_locator('iframe');await f.locator('#loaded-content').wait_for();assert await f.locator('body').evaluate('()=>!document.querySelector(".review-marks,[data-review-case]")');return p,f
