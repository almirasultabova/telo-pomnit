from pathlib import Path
import importlib.util,copy,asyncio
spec=importlib.util.spec_from_file_location('history_base147',Path(__file__).resolve().parents[1]/'ui-consistency-JAPP147/fixture.py');base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
SESSIONS=[{'sessionId':'history-a','title':'Учебный разговор о паузе','createdAt':'2026-10-19T10:00:00Z'},{'sessionId':'history-b','title':'Учебный разговор о наблюдении после встречи','createdAt':'2026-10-20T11:00:00Z'}]
def detail(id):return {**next(x for x in SESSIONS if x['sessionId']==id),'contextMode':'none','messages':[{'role':'user','content':'Учебное сообщение '+id},{'role':'assistant','content':'Учебный ответ '+id+'. <Это обычный текст> '+('Длинный текст для проверки чтения. '*30)}]}
async def boot(browser,origin,width=390,pending=False):
 p=await base.boot(browser,origin,width);p.history_fault=None;p.history_gate=None;p.history_reads=[];p.history_sends=[];p.history_sessions=copy.deepcopy(SESSIONS);p.history_access=True
 async def access(route):
  data=copy.deepcopy(base.ACCESS);data['ai']={'canWrite':p.history_access,'reason':'program','message':'Учебный просмотр истории AI.'};await route.fulfill(json=data)
 async def ai(route):
  path=route.request.url.split('/api/ai/',1)[1].split('?')[0]
  if route.request.method!='GET':p.history_sends.append(path);return await route.fulfill(status=503,json={'error':'Отправка отключена в учебной проверке'})
  p.history_reads.append(path)
  if p.history_gate:await p.history_gate.wait()
  if p.history_fault==('list'if path=='sessions'else'detail'):return await route.fulfill(status=503,json={'error':'Учебная ошибка истории'})
  await route.fulfill(json=copy.deepcopy(p.history_sessions)if path=='sessions'else detail(path.split('/')[-1]))
 await p.route('**/api/me/enrollment/access',access);await p.route('**/api/ai/**',ai)
 if pending:await p.evaluate("Storage.saveFormDraft('ai_delivery_v1',{operationId:'67000000-0000-4000-8000-000000000001',owner:Storage._userId,rawText:'Учебная неподтверждённая отправка',message:'Учебная неподтверждённая отправка',sessionId:null,context:{contextMode:'none',diaryEntryIds:[]},state:'uncertain'})")
 await p.evaluate("goTo('ai-chat');refreshAiScreen()");await p.wait_for_function("document.querySelector('#ai-history-select').options.length===3")
 await p.locator('.ai-history-disclosure summary').click();return p
