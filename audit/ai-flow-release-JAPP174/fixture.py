from pathlib import Path
import importlib.util,copy,asyncio,json
R=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('base147',R/'audit/ui-consistency-JAPP147/fixture.py');base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
spec=importlib.util.spec_from_file_location('picker159',R/'audit/ai-picker-JAPP159/fixture.py');picker=importlib.util.module_from_spec(spec);spec.loader.exec_module(picker)
SESSIONS=[{'sessionId':'history-a','title':'Учебный разговор о паузе','createdAt':'2026-10-19T10:00:00Z'},{'sessionId':'history-b','title':'Учебный разговор после встречи','createdAt':'2026-10-20T11:00:00Z'}]
def detail(id):return {**next((x for x in SESSIONS if x['sessionId']==id),{'sessionId':id,'title':'Учебный новый разговор'}),'contextMode':'none','messages':[{'role':'user','content':'Учебное сообщение '+id},{'role':'assistant','content':'Учебный ответ '+id+'. '+('Текст для проверки чтения. '*45)}]}
async def boot(browser,origin,width=390):
 p=await base.boot(browser,origin,width);p.sends=[];p.preview_reads=[];p.send_gate=None;p.send_started=asyncio.Event();p.send_result='completed';p.access=True;p.sessions=copy.deepcopy(SESSIONS);p.details={x['sessionId']:detail(x['sessionId'])for x in SESSIONS};p.last_op=None;p.history_error=False;p.context_error=False;p.read_gate=None
 async def access(route):
  data=copy.deepcopy(base.ACCESS);data['ai']={'canWrite':p.access,'reason':'program'if p.access else 'expired','message':'Учебный просмотр. Доступ к AI открыт.'};return await route.fulfill(json=data)
 async def diary(route):await route.fulfill(json=picker.ENTRIES)
 async def ai(route):
  path=route.request.url.split('/api/ai/',1)[1].split('?')[0]
  if path=='sessions':
   if p.history_error:return await route.fulfill(status=503,json={'error':'Учебная ошибка истории'})
   return await route.fulfill(json=p.sessions)
  if path.startswith('sessions/'):
   if p.read_gate:await p.read_gate.wait()
   return await route.fulfill(json=p.details[path.split('/')[-1]])
  if path=='context-preview':
   body=route.request.post_data_json;p.preview_reads.append(body)
   if p.context_error:return await route.fulfill(status=409,json={'error':'Учебная ошибка просмотра','code':'CONTEXT_CHANGED'})
   return await route.fulfill(json={**picker.preview(body.get('diaryEntryIds',[])),'contextText':json.dumps(picker.preview(body.get('diaryEntryIds',[]))['contextSnapshot'],ensure_ascii=False,separators=(',',':')),'contextHash':'synthetic-preview-hash'})
  if path.startswith('operations/'):
   if p.send_result=='not-found':return await route.fulfill(status=404,json={'code':'AI_OPERATION_NOT_FOUND','error':'Учебная отправка не найдена'})
   return await route.fulfill(json={'state':p.send_result,'sessionId':p.last_op['sessionId']or 'synthetic-new'})
  if path=='chat':
   body=route.request.post_data_json;p.sends.append(body);p.last_op=body;p.send_started.set()
   if p.send_gate:await p.send_gate.wait()
   if p.send_result=='error':return await route.fulfill(status=503,json={'error':'Учебный обрыв связи'})
   id=body.get('sessionId')or 'synthetic-new';data=p.details.setdefault(id,{'sessionId':id,'title':'Учебный новый разговор','createdAt':'2026-10-20T12:00:00Z','contextMode':body.get('contextMode','none'),'contextSnapshot':picker.preview(body.get('diaryEntryIds',[]))['contextSnapshot'],'contextText':json.dumps(picker.preview(body.get('diaryEntryIds',[]))['contextSnapshot'],ensure_ascii=False,separators=(',',':')),'messages':[]})
   if not any(x.get('content')==body['message']for x in data['messages']):data['messages'] += [{'role':'user','content':body['message']},{'role':'assistant','content':'Учебный ответ без обращения к настоящему AI.'}]
   return await route.fulfill(json={'state':p.send_result,'sessionId':id})
  raise AssertionError('Unmodelled synthetic API '+path)
 await p.route('**/api/me/enrollment/access',access);await p.route('**/api/diary',diary);await p.route('**/api/diary?**',diary);await p.route('**/api/ai/**',ai)
 await p.evaluate("goTo('ai-chat');refreshAiScreen()");await p.wait_for_function("!aiHistoryLoading&&aiAccessGranted===true")
 return p
