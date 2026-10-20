from pathlib import Path
import importlib.util,copy,asyncio
spec=importlib.util.spec_from_file_location('base_ui147',Path(__file__).resolve().parents[1]/'ui-consistency-JAPP147/fixture.py');base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
TEXT='Учебная заметка. После разговора я заметила напряжение и решила дать себе время. '+('Это вымышленный текст для проверки длинного фрагмента, без данных участниц. '*40)
SOURCES=[{'id':f'16100000-0000-4000-8000-{i:012d}','source':'body','title':'Наблюдение за телом '+str(i),'day':'2026-10-18','date':'2026-10-18T12:00:00Z','text':TEXT+f' Конец учебной записи {i}.','important':False}for i in range(1,14)]
async def boot(browser,origin,width=390):
 p=await base.boot(browser,origin,width);p.sources=copy.deepcopy(SOURCES);p.discuss_rows=[];p.discuss_writes=[];p.discuss_fault='ok';p.history_gate=None;p.history_done=asyncio.Event()
 async def history(route):
  from urllib.parse import urlsplit,parse_qs
  url=urlsplit(route.request.url);parts=url.path.split('/');q=parse_qs(url.query);search=route.request.post_data_json if route.request.method=='POST' else None
  if p.discuss_fault=='history-fail':return await route.fulfill(status=503,json={'error':'Учебная ошибка истории'})
  if search is None and len(parts)>3:
   row=next((r for r in p.sources if r['id']==parts[-1]),None)
   if p.history_gate:await p.history_gate.wait()
   await route.fulfill(json=row);p.history_done.set();return
  offset=int(search.get('offset',0))if search is not None else int(q.get('offset',['0'])[0]);limit=int(search.get('limit',10))if search is not None else int(q.get('limit',['10'])[0]);rows=p.sources[offset:offset+limit]
  await route.fulfill(json={'entries':rows,'total':len(p.sources),'hasMore':offset+len(rows)<len(p.sources)})
 async def discuss(route):
  request=route.request;rowid=request.url.split('/api/discussion-notes',1)[-1].split('?')[0].strip('/')
  if request.method=='GET':return await route.fulfill(json=next((r for r in p.discuss_rows if r['id']==rowid),None)if rowid else p.discuss_rows)
  data=request.post_data_json;p.discuss_writes.append(copy.deepcopy(data))
  if p.discuss_fault=='save-fail':return await route.fulfill(status=503,json={'error':'Учебная ошибка сохранения'})
  row=next((r for r in p.discuss_rows if r['id']==rowid),None)
  if row is None:
   row={'id':'16100000-0000-4000-8000-999999999999','clientId':data['clientId'],'text':'','source':None,'done':False,'revision':0,'createdAt':'2026-10-20T10:00:00Z'};p.discuss_rows.append(row)
  if 'text'in data:row['text']=data['text']
  if 'source'in data:
   source=data['source'];original=next((r for r in p.sources if source and r['id']==source['id']),None)
   row['source']={**source,'label':original['title'],'day':original['day']}if source and original else None
  if 'done'in data:row['done']=data['done']
  row['revision']+=1;await route.fulfill(json=row)
 await p.route('**/api/diary-history**',history);await p.route('**/api/discussion-notes**',discuss)
 await p.evaluate("switchTab('diary');DiscussionNotes.refresh()")
 await p.locator('#discuss-entry').click();await p.locator('#screen-discuss .dq-start-actions').wait_for();return p
