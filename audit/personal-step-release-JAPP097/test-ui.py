from pathlib import Path
from playwright.sync_api import sync_playwright,expect
import json,uuid,copy,sys
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent;B=sys.argv[1]if len(sys.argv)>1 else 'http://127.0.0.1:8928/';published=B.startswith('https:')
fixture=(R/'app/js/screen-review-fixture.js').read_text(encoding='utf-8');fixture='\n'.join(l for l in fixture.splitlines()if "Object.defineProperty(window,'localStorage'"not in l)
fixture="const transportFetch=window.fetch;\n"+fixture+"\nconst fixtureFetch=window.fetch;window.fetch=(url,options={})=>/\\/(after-meeting-notes|diary-history)(\\/|$)/.test(new URL(url,location.href).pathname)?transportFetch(url,options):fixtureFetch(url,options);window.ScreenReviewMode=false;"
results=[]
with sync_playwright()as p:
 for engine,width in ([('chromium',390),('webkit',390)]if published else [('chromium',390),('chromium',320),('chromium',1440),('webkit',390)]):
  browser=getattr(p,engine).launch();ctx=browser.new_context(viewport={'width':width,'height':844 if width<1000 else 1000},reduced_motion='reduce');ctx.add_init_script(fixture);rows=[];calls=[];errors=[];fault={'fail':False,'lost':False}
  def route(req):
   r=req.request;path=r.url.split('/api/',1)[-1].split('?')[0];method=r.method;calls.append((method,path));d=r.post_data_json if method in ['POST','PUT']else None
   if not path.startswith(('after-meeting-notes','diary-history')):raise AssertionError('Unexpected actual API '+path)
   if fault['fail']:req.fulfill(status=503,json={'error':'Вымышленный сбой'});return
   if path=='after-meeting-notes':
    if method=='GET':req.fulfill(json=rows);return
    row=next((x for x in rows if x['clientId']==d['clientId']),None)
    if not row:row={**d,'id':str(uuid.uuid4()),'revision':1,'createdAt':'2026-10-18T13:00:00Z','updatedAt':'2026-10-18T13:00:00Z','events':[],'stepText':d.get('stepText',''),'stepPaused':False};rows.insert(0,row)
   elif path.startswith('diary-history'):
    entries=[{'id':x['id'],'source':'meeting','kind':x['kind'],'title':'После разбора'if x['kind']=='analysis'else 'После практики','day':x['meetingDate'],'date':x['createdAt'],'important':False,'hasStep':bool(x['stepText']or x['events']),'text':'\n\n'.join([x['text'],x['stepText']]+[e['text']for e in x['events']])}for x in rows]
    if path.endswith('/search'):req.fulfill(json={'entries':entries,'total':len(entries),'offset':0,'hasMore':False});return
    row=next(x for x in entries if x['id']==path.split('/')[-1]);req.fulfill(json=row);return
   else:
    rid=path.split('/')[1];row=next(x for x in rows if x['id']==rid)
    if method=='GET':req.fulfill(json=row);return
    if path.endswith('/observations'):
     existing=next((e for e in row['events']if e.get('clientId')==d['clientId']),None)
     if existing:
      if existing['text']!=d['text'].strip():req.fulfill(status=409,json={'error':'Наблюдение уже сохранено с другим текстом'});return
     elif row['stepText']!=d['stepText']:req.fulfill(status=409,json={'code':'STEP_CHANGED','error':'Личный шаг изменился. Проверьте новую формулировку.'});return
     else:row['events'].append({'id':str(uuid.uuid4()),'clientId':d['clientId'],'type':'observation','date':'2026-10-18T14:00:00Z','stepText':row['stepText'],'text':d['text'].strip(),'from':''});row['revision']+=1
    elif path.endswith('/step'):
     if d['revision']!=row['revision']:req.fulfill(status=409,json={'error':'Запись изменилась на другом устройстве'});return
     if 'stepText'in d and d['stepText']!=row['stepText']:
      row['events'].append({'id':str(uuid.uuid4()),'clientId':None,'type':'change','date':'2026-10-18T14:05:00Z','stepText':d['stepText'],'text':d['stepText'],'from':row['stepText']});row['stepText']=d['stepText']
     if 'stepPaused'in d:row['stepPaused']=d['stepPaused']
     row['revision']+=1
    else:row.update(d);row['revision']+=1
   if fault['lost']:fault['lost']=False;req.abort('failed');return
   req.fulfill(json=row)
  ctx.route('**/api/**',route);page=ctx.new_page();page.set_default_timeout(15000);page.on('pageerror',lambda e:errors.append(str(e)))
  def home():page.wait_for_function("()=>typeof currentScreen!=='undefined'&&currentScreen==='home'");page.evaluate("()=>{closeQInvite();switchTab('diary');}")
  page.goto(B+'?fixture=JAPP097',wait_until='domcontentloaded');home();page.locator('#after-meeting-entry').click();page.get_by_text('После разбора',exact=True).click();page.locator('#am-note').fill('Вымышленная заметка после разбора');page.locator('#am-step summary').click();page.locator('#am-step-input').fill('Дать себе паузу перед ответом.');page.locator('#am-save').click();expect(page.locator('.ps-card-step')).to_contain_text('Дать себе паузу');assert len(rows)==1
  page.get_by_role('button',name='Вернуться к шагу',exact=True).click();expect(page.locator('#ps-reply-save')).to_be_disabled();page.locator('#ps-reply').fill('Вымышленный черновик наблюдения');page.locator('#ps-back').click();page.get_by_role('button',name='Вернуться к шагу',exact=True).click();expect(page.locator('#ps-reply')).to_have_value('Вымышленный черновик наблюдения')
  fault['fail']=True;page.locator('#ps-reply-save').click();expect(page.locator('#ps-message')).to_contain_text('Не удалось подтвердить');expect(page.locator('#ps-reply')).to_have_value('Вымышленный черновик наблюдения');assert not rows[0]['events']
  fault['fail']=False;fault['lost']=True;page.locator('#ps-reply-save').click();expect(page.locator('#ps-message')).to_contain_text('Не удалось подтвердить');assert len(rows[0]['events'])==1
  page.locator('#ps-reply').fill('Изменённый текст после потерянного ответа <img src=x>');page.locator('#ps-reply-save').click();expect(page.locator('#ps-message')).to_contain_text('Изменённый текст остался черновиком');expect(page.locator('#ps-reply')).to_have_value('Изменённый текст после потерянного ответа <img src=x>');assert len(rows[0]['events'])==1
  page.locator('#ps-reply-save').click();expect(page.locator('.ps-observation-text')).to_have_count(2);assert page.locator('.ps-observation-text img').count()==0
  page.get_by_role('button',name='Изменить',exact=True).click();page.locator('#ps-edit-text').fill('Сначала заметить, чего я хочу.');page.locator('#ps-edit-save').click();expect(page.locator('.ps-step-copy')).to_have_text('Сначала заметить, чего я хочу.');expect(page.locator('.ps-event-context')).to_have_count(2)
  page.get_by_role('button',name='Отложить',exact=True).click();expect(page.locator('.ps-paused')).to_be_visible();page.get_by_role('button',name='Вернуться к шагу',exact=True).click();expect(page.locator('.ps-paused')).to_have_count(0)
  page.reload(wait_until='domcontentloaded');home();page.get_by_role('button',name='Посмотреть продолжение',exact=True).click();expect(page.locator('.ps-observation-text')).to_have_count(2);expect(page.locator('.ps-step-copy')).to_have_text('Сначала заметить, чего я хочу.')
  page.locator('#ps-reply').fill('Черновик к прежнему шагу');rows[0]['stepText']='Новый шаг с другого устройства';rows[0]['revision']+=1
  page.locator('#ps-reply-save').click();expect(page.locator('#ps-message')).to_contain_text('Личный шаг изменился');page.get_by_role('button',name='Обновить запись',exact=True).click();expect(page.locator('#ps-reply')).to_have_value('Черновик к прежнему шагу');expect(page.locator('#ps-reply-save')).to_be_disabled();page.get_by_role('button',name='Писать о текущем шаге',exact=True).click();expect(page.locator('#ps-reply-save')).to_be_enabled();page.locator('#ps-reply-save').click();expect(page.locator('.ps-observation-text')).to_have_count(3)
  page.screenshot(path=str(H/f'{"published"if published else "local"}-{engine}-{width}.png'),full_page=True)
  page.locator('#ps-back').click();page.locator('#after-meeting-entry').click();page.get_by_text('После практики',exact=True).click();page.locator('#am-note').fill('Вымышленная заметка без шага');page.locator('#am-save').click();expect(page.locator('.am-record')).to_have_count(2)
  page.locator('#diary-history-btn').click();expect(page.locator('.hm-card')).to_have_count(2);page.locator('.hm-card').filter(has_text='Вымышленная заметка после разбора').get_by_role('button',name='Открыть запись').click();page.get_by_role('button',name='Открыть личный шаг',exact=True).click();expect(page.locator('#screen-after-step')).to_have_class('screen screen--active');page.locator('#ps-back').click();expect(page.locator('#screen-history-record')).to_have_class('screen screen--active')
  # In-flight writes never restore personal content after logout.
  page.get_by_role('button',name='Открыть личный шаг',exact=True).click();page.evaluate("()=>{Api.addAfterMeetingObservation=()=>new Promise(resolve=>window.heldObservation=resolve);}");page.locator('#ps-reply').fill('Вымышленный ввод перед выходом');page.locator('#ps-reply-save').click();page.wait_for_function("typeof heldObservation==='function'");page.evaluate("()=>{Api.logout();heldObservation({});}");expect(page.locator('#ps-content')).to_have_text('')
  assert not errors,errors;results.append({'engine':engine,'width':width,'noteWithAndWithoutStep':True,'serverReload':True,'resultDraft':True,'failedWriteRetainsText':True,'lostAckEditedTextRetainsDraft':True,'noDuplicateRetry':True,'stepHistoryContext':True,'pauseResume':True,'crossDeviceStepConflict':True,'safeText':True,'unifiedHistoryLink':True,'backToHistory':True,'logoutGuard':True,'errors':errors,'realPeople':0,'openai':0,'notifications':0});(H/('published-ui.json'if published else 'ui-results.json')).write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8');ctx.close();browser.close();print(engine,width,'PASS',flush=True)
