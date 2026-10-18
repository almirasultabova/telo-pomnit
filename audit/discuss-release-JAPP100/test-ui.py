from pathlib import Path
from playwright.sync_api import sync_playwright,expect
import json,uuid,copy,sys,re
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent;B=sys.argv[1]if len(sys.argv)>1 else 'http://127.0.0.1:8930/';published=B.startswith('https:')
fixture=(R/'app/js/screen-review-fixture.js').read_text(encoding='utf-8');fixture='\n'.join(l for l in fixture.splitlines()if "Object.defineProperty(window,'localStorage'"not in l)
fixture="const transportFetch=window.fetch;\n"+fixture+"\nconst fixtureFetch=window.fetch;window.fetch=(url,options={})=>/\\/(discussion-notes|diary-history)(\\/|$)/.test(new URL(url,location.href).pathname)?transportFetch(url,options):fixtureFetch(url,options);window.ScreenReviewMode=false;"
results=[];expect.set_options(timeout=12000)
with sync_playwright()as p:
 for engine,width in ([('chromium',390),('webkit',390)]if published else [('chromium',390),('chromium',320),('chromium',1440),('webkit',390)]):
  browser=getattr(p,engine).launch();ctx=browser.new_context(viewport={'width':width,'height':844 if width<1000 else 1000},reduced_motion='reduce');ctx.add_init_script(fixture);rows=[];calls=[];errors=[];unexpected=[];fault={'fail':False,'lost':False}
  sources=[{'id':str(uuid.uuid4()),'source':'meeting','kind':'analysis','title':'После разбора','day':'2026-10-15','date':'2026-10-15T15:00:00Z','important':False,'text':'Полная вымышленная заметка. Мне было трудно понять, чего я хочу. Остальное не нужно переносить.'}]
  def dto(d):
   src=next((s for s in sources if s['id']==d['source']['id']),None)if d.get('source')else None
   return {'text':d.get('text','').strip(),'source':{**d['source'],'label':src['title'],'day':src['day']}if src else None}
  def route(req):
   r=req.request;path=r.url.split('/api/',1)[-1].split('?')[0];method=r.method;calls.append((method,path));d=r.post_data_json if method in ['POST','PUT']else None
   if not path.startswith(('discussion-notes','diary-history')):unexpected.append(path);req.abort();return
   if path.startswith('diary-history'):
    if path.endswith('/search'):req.fulfill(json={'entries':sources,'offset':0,'total':len(sources),'hasMore':False});return
    req.fulfill(json=next(x for x in sources if x['id']==path.split('/')[-1]));return
   if fault['fail']:req.fulfill(status=503,json={'error':'Вымышленный сбой'});return
   if path=='discussion-notes':
    if method=='GET':req.fulfill(json=rows);return
    row=next((x for x in rows if x['clientId']==d['clientId']),None)
    if row and (row['text']!=d['text'].strip()or (row['source']or {}).get('excerpt')!=(d['source']or {}).get('excerpt')):req.fulfill(status=409,json={'code':'CLIENT_ID_CONFLICT','error':'Уже сохранено'});return
    if not row:row={**dto(d),'clientId':d['clientId'],'id':str(uuid.uuid4()),'done':False,'revision':1,'createdAt':'2026-10-18T15:00:00Z','updatedAt':'2026-10-18T15:00:00Z'};rows.insert(0,row)
   else:
    row=next(x for x in rows if x['id']==path.split('/')[-1])
    if method=='GET':req.fulfill(json=row);return
    same=(('text'not in d or row['text']==d['text'].strip()and(row['source']or {}).get('excerpt')==(d['source']or {}).get('excerpt'))and('done'not in d or row['done']==d['done']))
    if not same and row['revision']!=d['revision']:req.fulfill(status=409,json={'code':'NOTE_CHANGED','error':'Изменено на другом устройстве'});return
    if not same:
     if 'text'in d:row.update(dto(d))
     if 'done'in d:row['done']=d['done']
     row['revision']+=1
   if fault['lost']:fault['lost']=False;req.abort('failed');return
   req.fulfill(json=copy.deepcopy(row))
  ctx.route('**/api/**',route);page=ctx.new_page();page.set_default_timeout(15000);page.on('pageerror',lambda e:errors.append(str(e)))
  def home():
   expect(page.locator('#screen-home')).to_have_class(re.compile('screen--active'));page.evaluate("()=>{closeQInvite();switchTab('diary');}");expect(page.locator('#discuss-entry')).to_be_visible()
  page.goto(B+'?fixture=JAPP100',wait_until='domcontentloaded');home();page.locator('#discuss-entry').click();s=page.locator('#screen-discuss');expect(s.locator('.dq-empty')).to_be_visible()
  if width==390:
   page.screenshot(path=str(H/(('published-'if published else 'local-')+engine+'-'+str(width)+'-empty.png')),full_page=True)
   s.get_by_role('button',name='Написать',exact=True).click();expect(s.locator('#dq-save')).to_be_disabled();s.locator('#dq-text').fill('Первый вымышленный вопрос');s.locator('.dq-back').click();s.get_by_role('button',name='Написать',exact=True).click();expect(s.locator('#dq-text')).to_have_value('Первый вымышленный вопрос')
   fault['fail']=True;s.locator('#dq-save').click();expect(s.locator('#dq-status')).to_contain_text('Не удалось подтвердить');expect(s.locator('#dq-text')).to_have_value('Первый вымышленный вопрос');assert not rows
   fault['fail']=False;fault['lost']=True;s.locator('#dq-save').click();expect(s.locator('#dq-status')).to_contain_text('Не удалось подтвердить');assert len(rows)==1;s.locator('#dq-text').fill('Изменённый текст после потери ответа <img src=x>');s.locator('#dq-save').click();expect(s.locator('#dq-status')).to_contain_text('Изменённый текст остался черновиком');assert len(rows)==1;expect(s.locator('#dq-text')).to_have_value('Изменённый текст после потери ответа <img src=x>');s.locator('#dq-save').click();expect(s.locator('.dq-full-text')).to_contain_text('<img src=x>');assert s.locator('.dq-full-text img').count()==0;assert len(rows)==1
   s.get_by_role('button',name='Отметить: обсудили',exact=True).click();expect(s.locator('#dq-status')).to_contain_text('Обсудили');s.get_by_role('button',name='Вернуть к встрече',exact=True).click();expect(s.locator('#dq-status')).to_contain_text('снова');s.locator('.dq-back').click()
   s.get_by_role('button',name='Из заметки',exact=True).click();s.get_by_role('button',name='Выбрать фрагмент',exact=True).click();expect(s.locator('#dq-use-selection')).to_be_disabled();s.locator('#dq-source-text').evaluate('(e)=>{const a=e.value.indexOf("Мне было");e.setSelectionRange(a,e.value.indexOf(" Остальное"));e.dispatchEvent(new Event("select"));}');s.locator('#dq-use-selection').click();expect(s.locator('#dq-excerpt')).to_have_value('Мне было трудно понять, чего я хочу.');expect(s.locator('#dq-save')).to_be_enabled();s.locator('#dq-excerpt').fill('Я хочу дать себе время перед ответом.');page.screenshot(path=str(H/(('published-'if published else 'local-')+engine+'-'+str(width)+'-editor.png')),full_page=True);s.locator('#dq-save').click();expect(s.locator('.dq-detail-source blockquote')).to_have_text('Я хочу дать себе время перед ответом.');assert len(rows)==2;assert sources[0]['text'].startswith('Полная вымышленная');assert not rows[0]['text'];assert 'Остальное'not in rows[0]['source']['excerpt']
   page.reload(wait_until='domcontentloaded');home();page.locator('#discuss-entry').click();expect(s.locator('.dq-record')).to_have_count(2);s.locator('.dq-open').filter(has_text='Я хочу дать').click();s.get_by_role('button',name='Редактировать',exact=True).click();s.locator('#dq-text').fill('Мой локальный черновик');rows[0]['revision']+=1;rows[0]['text']='Сохранено другим устройством';s.locator('#dq-save').click();expect(s.locator('#dq-status')).to_contain_text('изменилась');expect(s.locator('#dq-text')).to_have_value('Мой локальный черновик');s.get_by_role('button',name='Обновить сохранённую версию',exact=True).click();expect(s.locator('#dq-status')).to_contain_text('сравните');s.locator('#dq-save').click();expect(s.locator('.dq-full-text')).to_have_text('Мой локальный черновик')
   page.screenshot(path=str(H/(('published-'if published else 'local-')+engine+'-'+str(width)+'-saved.png')),full_page=True);s.locator('.dq-back').click();page.screenshot(path=str(H/(('published-'if published else 'local-')+engine+'-'+str(width)+'-list.png')),full_page=True)
   # Old pending server responses cannot put private content back after logout.
   s.get_by_role('button',name='Написать',exact=True).click();s.locator('#dq-text').fill('Вымышленный ввод перед выходом');page.evaluate("()=>{Api.createDiscussionNote=()=>new Promise(resolve=>window.heldDiscussion=resolve)}");s.locator('#dq-save').click();expect(s.locator('#dq-save')).to_be_disabled();page.evaluate("()=>{Api.logout();heldDiscussion({});}");expect(s.locator('.dq-scroll')).to_have_text('')
  else:
   page.screenshot(path=str(H/'local-{}-{}-empty.png'.format(engine,width)),full_page=True)
  assert not errors,errors;assert not unexpected,unexpected;assert s.evaluate('e=>e.scrollWidth<=e.clientWidth')
  results.append({'engine':engine,'width':width,'completeFlow':width==390,'draftAndServerReload':width==390,'lostAckEditedDraftNoDuplicate':width==390,'sourceSnapshotOnly':width==390,'crossDeviceConflict':width==390,'logoutGuard':width==390,'safeText':width==390,'realPeople':0,'openai':0,'notifications':0,'errors':errors});(H/('published-ui.json'if published else 'ui-results.json')).write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8');ctx.close();browser.close();print(engine,width,'PASS',flush=True)
