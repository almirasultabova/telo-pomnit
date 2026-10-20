from pathlib import Path
import importlib.util,copy,asyncio
spec=importlib.util.spec_from_file_location('source_picker161',Path(__file__).resolve().parents[1]/'discuss-ux-JAPP161/fixture.py');picker=importlib.util.module_from_spec(spec);spec.loader.exec_module(picker)
base=picker.base;SOURCES=picker.SOURCES
ROWS=[{'id':f'16900000-0000-4000-8000-{i:012d}','clientId':f'16910000-0000-4000-8000-{i:012d}','text':f'Учебная запись {i}. '+('Текст для проверки чтения. '*80 if i==13 else 'То, к чему хочется вернуться на встрече.'),'source':None,'done':i>20,'revision':1,'createdAt':'2026-10-20T10:00:00Z'}for i in range(1,25)]
async def boot(browser,origin,width=390):
 p=await picker.boot(browser,origin,width);p.discuss_rows=copy.deepcopy(ROWS);p.discuss_gate=None;p.discuss_reads=[];p.discuss_attempts=[];p.list_fault=False;p.save_code=200
 async def discuss(route):
  req=route.request;id=req.url.split('/api/discussion-notes',1)[-1].split('?')[0].strip('/')
  if req.method=='GET':
   p.discuss_reads.append(id)
   if p.discuss_gate:await p.discuss_gate.wait()
   if p.list_fault:return await route.fulfill(status=503,json={'error':'Synthetic list failure'})
   return await route.fulfill(json=next((r for r in p.discuss_rows if r['id']==id),None)if id else p.discuss_rows)
  data=req.post_data_json;p.discuss_attempts.append(copy.deepcopy(data))
  if p.discuss_gate:await p.discuss_gate.wait()
  if p.save_code!=200:return await route.fulfill(status=p.save_code,json={'error':'Synthetic save failure'})
  row=next((r for r in p.discuss_rows if r['id']==id),None)
  if not row:row={'id':'16900000-0000-4000-8000-999999999999','clientId':data['clientId'],'text':'','source':None,'done':False,'revision':0,'createdAt':'2026-10-20T10:00:00Z'};p.discuss_rows.insert(0,row)
  for k in ['text','done','source']:
   if k in data:row[k]=data[k]
  row['revision']+=1;await route.fulfill(json=row)
 await p.route('**/api/discussion-notes**',discuss)
 await p.locator('.dq-back').click();await p.locator('#discuss-entry').click();await p.locator('.dq-record').first.wait_for();return p
