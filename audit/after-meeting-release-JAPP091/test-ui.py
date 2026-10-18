from pathlib import Path
from playwright.sync_api import sync_playwright,expect
import json,uuid,sys,os
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent
base=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8924/'
published=base.startswith('https:')
fixture=(R/'app/js/screen-review-fixture.js').read_text(encoding='utf-8')
fixture='\n'.join(line for line in fixture.splitlines()if "Object.defineProperty(window,'localStorage'" not in line)
# Keep the incumbent auth/read fixtures; only this feature uses the intercepted HTTP transport.
fixture="const transportFetch=window.fetch;\n"+fixture+"\nconst fixtureFetch=window.fetch;window.fetch=(url,options={})=>new URL(url,location.href).pathname.includes('/after-meeting-notes')?transportFetch(url,options):fixtureFetch(url,options);window.ScreenReviewMode=false;"
results=[]
with sync_playwright()as p:
 for engine,width in [('chromium',390),('chromium',320),('chromium',1440),('webkit',390)]:
  if os.getenv('UI_ENGINE') and engine!=os.getenv('UI_ENGINE'):continue
  browser=getattr(p,engine).launch();context=browser.new_context(viewport={'width':width,'height':844 if width<1000 else 1000},reduced_motion='reduce');context.add_init_script(fixture)
  rows=[];calls=[];errors=[];state={'fail':False,'lost':False,'lostPut':False}
  def route(req):
   request=req.request;url=request.url;method=request.method;calls.append((method,url));path=url.split('/api/',1)[-1].split('?')[0]
   if not path.startswith('after-meeting-notes'):raise AssertionError('Unexpected real API request: '+url)
   if state['fail']:req.fulfill(status=503,json={'error':'Синтетический сбой'});return
   if method=='GET':req.fulfill(json=rows);return
   data=request.post_data_json
   if method=='POST':
    row=next((r for r in rows if r['clientId']==data['clientId']),None)
    if not row:
     row={**data,'id':str(uuid.uuid4()),'revision':1,'createdAt':'2026-10-18T12:00:00.000Z','updatedAt':'2026-10-18T12:00:00.000Z'};rows.append(row)
   else:
    row=next(r for r in rows if r['id']==path.split('/')[-1]);row.update(data);row['revision']+=1
   if state['lost']:state['lost']=False;req.abort('failed');return
   if method=='PUT' and state['lostPut']:state['lostPut']=False;req.abort('failed');return
   req.fulfill(json=row)
  context.route('**/api/**',route)
  page=context.new_page();page.set_default_timeout(17000);page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto(base+'?fixture=JAPP091',wait_until='domcontentloaded');page.wait_for_function("()=>typeof currentScreen!=='undefined' && currentScreen==='home'")
  page.evaluate("closeQInvite();switchTab('diary')")
  page.locator('#after-meeting-entry').click();expect(page.locator('#am-save')).to_be_disabled()
  page.get_by_text('После практики',exact=True).click();page.locator('#am-date').fill('2026-10-17');page.locator('#am-note').fill('Вымышленная заметка после практики')
  page.locator('#am-back').click();page.locator('#after-meeting-entry').click();expect(page.locator('#am-note')).to_have_value('Вымышленная заметка после практики')
  page.reload(wait_until='domcontentloaded');page.wait_for_function("()=>typeof currentScreen!=='undefined' && currentScreen==='home'");page.evaluate("closeQInvite();switchTab('diary')");page.locator('#after-meeting-entry').click();expect(page.locator('#am-note')).to_have_value('Вымышленная заметка после практики')
  # Failed writes do not look saved and preserve the text. Repeated create after lost ACK is one note.
  state['fail']=True;page.locator('#am-save').click();expect(page.locator('#am-error')).to_be_visible();expect(page.locator('#am-error')).to_contain_text('Не удалось подтвердить');expect(page.locator('#am-save')).to_be_enabled();assert not rows
  state['fail']=False;state['lost']=True;page.locator('#am-save').click();expect(page.locator('#am-error')).to_be_visible();expect(page.locator('#am-error')).to_contain_text('Не удалось подтвердить');expect(page.locator('#am-save')).to_be_enabled();assert len(rows)==1
  state['lostPut']=True
  page.locator('#am-note').fill('Обновлённая вымышленная заметка <img src=x onerror=alert(1)>')
  page.locator('#am-save').click()
  expect(page.locator('#am-error')).to_be_visible();expect(page.locator('#am-save')).to_be_enabled()
  page.locator('#am-save').click();expect(page.locator('.am-record')).to_have_count(1)
  expect(page.locator('.am-record-text')).to_contain_text('<img src=x');assert len(rows)==1;assert page.locator('.am-record img').count()==0
  page.reload(wait_until='domcontentloaded');page.wait_for_function("()=>typeof currentScreen!=='undefined' && currentScreen==='home'");page.evaluate("closeQInvite();switchTab('diary')")
  expect(page.locator('.am-record')).to_have_count(1)
  page.get_by_role('button',name='Открыть заметку',exact=True).click();expect(page.locator('#am-note')).to_have_value('Обновлённая вымышленная заметка <img src=x onerror=alert(1)>')
  page.get_by_text('После разбора',exact=True).click();page.locator('#am-note').fill('После разбора заметила, что мне важно дать себе время.')
  page.get_by_text('Если не знаете, с чего начать',exact=True).click();expect(page.get_by_text('Что стало понятнее?',exact=True)).to_be_visible()
  expect(page.locator('.screen--enter,.screen--exit,.screen--enter-back,.screen--exit-back')).to_have_count(0)
  assert page.locator('#screen-after-meeting').evaluate('e=>e.scrollWidth<=e.clientWidth')
  page.screenshot(path=str(H/f'{"published" if published else "local"}-{engine}-{width}.png'),full_page=True)
  page.locator('#am-save').click();expect(page.locator('.am-record-text')).to_have_text('После разбора заметила, что мне важно дать себе время.');assert len(rows)==1
  page.locator('#after-meeting-entry').click();expect(page.locator('#am-note')).to_have_value('')
  # Switching verified accounts clears visible personal state and does not restore another user's draft.
  page.locator('#am-note').fill('Черновик первого учебного аккаунта')
  page.evaluate("Api.logout();Storage.bindUser('second-fictional-owner');Api.userId='second-fictional-owner';Api._token='synthetic';Api.clubBlocked=false;goTo('home');switchTab('diary')")
  page.locator('#after-meeting-entry').click();expect(page.locator('#am-note')).to_have_value('')
  assert not errors,errors
  results.append({'engine':engine,'width':width,'returnDraft':True,'reloadDraft':True,'ackOnly':True,'failurePreservesText':True,'lostAckNoDuplicate':True,'reloadServerHistory':True,'edit':True,'safeText':True,'accountDraftIsolation':True,'pageErrors':errors,'realApi':0,'notifications':0})
  (H/('published-ui.json' if published else 'ui-results.json')).write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
  context.close();browser.close();print(engine,width,'PASS',flush=True)
(H/('published-ui.json' if published else 'ui-results.json')).write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
