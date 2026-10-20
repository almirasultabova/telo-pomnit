from pathlib import Path
import importlib.util,copy,asyncio
spec=importlib.util.spec_from_file_location('ui_fixture147',Path(__file__).resolve().parents[1]/'ui-consistency-JAPP147/fixture.py');base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
ENTRIES=[{'id':f'15900000-0000-4000-8000-{i:012d}','date':'2026-10-20T10:00:00Z','createdAt':'2026-10-20T10:00:00Z','zone':'chest','zoneLabel':'Грудь','sensations':['Напряжение'],'note':text}for i,text in enumerate(['Учебная запись: после разговора заметила напряжение в плечах.','Учебная запись: дала себе время перед ответом.','Учебная запись: прислушалась к дыханию.','Учебная запись: сделала паузу между делами.','Учебная запись: заметила спокойствие после прогулки.','Учебная запись: записала наблюдение вечером.']+[f'Учебная запись {n}: '+('Длинный текст без изменения оригинала. '*10)for n in range(7,14)],1)]
def preview(ids):
 rows=[copy.deepcopy(row)for row in ENTRIES if row['id']in ids]
 return {'contextSnapshot':rows,'contextText':'\n\n'.join(row['note']for row in rows)}
async def boot(browser,origin,width=390):
 p=await base.boot(browser,origin,width);p.picker_entries=copy.deepcopy(ENTRIES);p.previews=[];p.ai_sends=[];p.picker_fault='ok';p.preview_gate=None;p.preview_done=asyncio.Event()
 async def diary(route):
  if p.picker_fault=='fail':return await route.fulfill(status=503,json={'error':'Учебная ошибка загрузки'})
  await route.fulfill(json=p.picker_entries)
 async def ai(route):
  path=route.request.url.split('/api/ai/',1)[-1].split('?')[0]
  if path=='context-preview':
   body=route.request.post_data_json;p.previews.append(body)
   if p.preview_gate:await p.preview_gate.wait()
   if p.picker_fault=='preview-fail':return await route.fulfill(status=503,json={'error':'Учебная ошибка просмотра'})
   await route.fulfill(json=preview(body.get('diaryEntryIds',body.get('ids',[]))));p.preview_done.set();return
  if route.request.method=='POST':p.ai_sends.append(route.request.post_data_json);return await route.fulfill(status=503,json={'error':'Отправка AI выключена в учебном просмотре'})
  await route.fulfill(json=[])
 await p.route('**/api/diary?**',diary);await p.route('**/api/diary',diary);await p.route('**/api/ai/**',ai)
 await p.evaluate("aiAccessGranted=true;programAccess.ai={canWrite:true,reason:'program'};goTo('ai-chat');renderAiChat()")
 await p.locator('#ai-context-mode').select_option('selected');await p.locator('#ai-context-choices input').first.wait_for()
 return p
