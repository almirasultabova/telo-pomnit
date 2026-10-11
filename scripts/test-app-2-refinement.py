"""J277: actual local UI, synthetic API, no production writes."""
import ast,json,threading,copy
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output/app-2-refinement';(OUT/'screens').mkdir(parents=True,exist_ok=True)
tree=ast.parse((ROOT/'scripts/test-app-2-stream.py').read_text(encoding='utf-8'));defs=[]
for item in tree.body:
 if isinstance(item,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='server' for t in item.targets):break
 defs.append(item)
ns={'__file__':str(ROOT/'scripts/test-app-2-stream.py')};exec(compile(ast.Module(body=defs,type_ignores=[]),'fixture','exec'),ns);Fixture,base=ns['Fixture'],ns['base']
server=ThreadingHTTPServer(('127.0.0.1',0),partial(base.Quiet,directory=str(ROOT/'output/app')));threading.Thread(target=server.serve_forever,daemon=True).start();results=[]
def back(page):page.evaluate("Telegram.WebView.receiveEvent('back_button_pressed')");base.settled(page)
def capture(page,engine,width,name):
 base.settled(page);assert page.locator('.screen--active').evaluate('e=>e.scrollWidth<=e.clientWidth+1');page.screenshot(path=str(OUT/'screens'/f'{engine}-{width}-{name}.png'))
def overlaps(a,b):return a['x']<b['x']+b['width'] and a['x']+a['width']>b['x'] and a['y']<b['y']+b['height'] and a['y']+a['height']>b['y']
try:
 with sync_playwright() as pw:
  for engine in [pw.chromium,pw.webkit]:
   browser=engine.launch()
   for width in [320,390,430]:
    ctx=browser.new_context(viewport={'width':width,'height':844},reduced_motion='reduce');page=ctx.new_page();fixture=Fixture('active');fixture.diary=[{'id':f'n{i}','zone':'chest','sensations':['tension'],'createdAt':'2026-10-09T12:00:00Z','note':'Личное наблюдение '+str(i)} for i in range(20)];errors=[];calls=[]
    page.on('pageerror',lambda e:errors.append(str(e)));page.add_init_script('window.TelegramWebviewProxy={postEvent:()=>{}}')
    def route(r):
     if '/api/' in r.request.url:
      path=r.request.url.split('/api',1)[1];calls.append([r.request.method,path])
      if path=='/me/enrollment/access':
       stream={'id':'own-stream','name':'Осенний поток','startDate':'2026-10-01','endDate':'2026-10-31','phase':'current','canAttend':True,'canReadRecordings':True,'recordingsExpiresAt':'2026-12-01T00:00:00Z','zoomLink':'https://zoom.us/j/123','meetings':[{'id':'real-meeting','date':'2026-10-15T16:00:00Z','topic':'Тело и доверие','description':'Содержание встречи из API.','prepare':'Подготовка из API.','zoomLink':'https://zoom.us/j/123'}]}
       archive={**stream,'id':'own-old','name':'Мой прошлый поток','phase':'completed','canAttend':False,'canReadRecordings':False,'zoomLink':None,'meetings':[]}
       r.fulfill(status=200,content_type='application/json',body=json.dumps({'serverTime':'2026-10-11T08:00:00Z','streams':[stream,archive],'ai':{'canWrite':True,'message':'AI доступен'}}))
      elif path=='/auth/data-rights':r.fulfill(status=200,content_type='application/json',body=json.dumps({'token':'rights-fixture','user':{'id':fixture.owner},'expiresIn':600}))
      elif path.startswith('/gdpr/export'):r.fulfill(status=200,content_type='application/json',body=json.dumps({'userId':fixture.owner,'entries':fixture.diary}))
      else:fixture.route(r)
     elif r.request.url.startswith('http://127.0.0.1:'):r.continue_()
     else:r.abort()
    page.route('**/*',route);page.goto(f'http://127.0.0.1:{server.server_port}/#tgWebAppPlatform=ios&tgWebAppVersion=8.0');expect(page.locator('#screen-home')).to_have_class('screen screen--active',timeout=15000);capture(page,engine.name,width,'home')
    page.locator('.nav-btn[data-tab="diary"]').click();expect(page.locator('.recent-disclosure')).not_to_have_attribute('open','');assert page.locator('#recent-entries .entry-card').count()==3;capture(page,engine.name,width,'diary')
    page.locator('#diary-history-btn').click();capture(page,engine.name,width,'history');assert not overlaps(page.locator('#screen-history .screen-title').bounding_box(),page.locator('#export-pdf-btn').bounding_box());back(page)
    page.locator('#ai-chat-btn').click();expect(page.locator('#ai-context-mode')).to_have_value('none');capture(page,engine.name,width,'ai')
    page.locator('#ai-input').fill('Длинное сообщение\n'+('Наблюдение за состоянием.\n'*5));page.set_viewport_size({'width':width,'height':420});capture(page,engine.name,width,'ai-keyboard');button=page.locator('#ai-send-btn').bounding_box();assert button['y']+button['height']<=420;assert not overlaps(button,page.locator('#ai-input').bounding_box());page.set_viewport_size({'width':width,'height':844});back(page)
    page.locator('#stop-reaction-btn').click();capture(page,engine.name,width,'reaction');back(page);page.locator('#checkin-btn').click();assert page.locator('#checkin-scales input[type=range]').count()==5;capture(page,engine.name,width,'checkin');back(page)
    page.locator('.nav-btn[data-tab="diag"]').click();assert page.locator('#path-stream-select option').count()==2;page.locator('#path-stream-select').select_option('own-old');assert page.evaluate('selectedProgramId')=='own-old';page.locator('#path-stream-select').select_option('own-stream');capture(page,engine.name,width,'path')
    page.locator('.nav-btn[data-tab="profile"]').click();assert page.locator('.host-tg-link').count()==2;assert page.locator('.host-tg-link[href="https://t.me/akhoroshavtseva"]').count()==1
    page.locator('.access-meeting summary').click();expect(page.locator('.access-meeting')).to_contain_text('Подготовка из API.');page.locator('.meeting-attendance').click();expect(page.locator('.meeting-attendance')).to_have_attribute('aria-pressed','true');capture(page,engine.name,width,'meeting');page.locator('#owned-stream-select').select_option('own-old');assert page.locator('#zoom-btn-wrap a[href*="zoom"]').count()==0;page.locator('#owned-stream-select').select_option('own-stream');capture(page,engine.name,width,'profile')
    page.locator('#data-rights-btn').click();expect(page.locator('#data-export-pdf')).to_be_visible();expect(page.locator('#data-rights-retry')).to_be_hidden();assert not overlaps(page.locator('#screen-data-rights .screen-title').bounding_box(),page.locator('#data-rights-close').bounding_box());capture(page,engine.name,width,'privacy')
    page.locator('.data-additional summary').click();page.locator('#data-export-json').click();expect(page.locator('#screen-data-export-preview')).to_have_class('screen screen--active');capture(page,engine.name,width,'json');expect(page.locator('#private-preview-close')).to_be_visible();page.locator('#private-preview-close').click();base.settled(page);expect(page.locator('#screen-data-rights')).to_have_class('screen screen--active');assert page.locator('#screen-data-export-preview').count()==0;page.locator('#data-export-json').click();expect(page.locator('#screen-data-export-preview')).to_have_class('screen screen--active');back(page);expect(page.locator('#screen-data-rights')).to_have_class('screen screen--active');back(page);assert page.evaluate('activeTab')=='profile'
    assert not errors,errors;assert all(method=='GET' or path.startswith('/auth/') for method,path in calls),calls;results.append({'engine':engine.name,'width':width,'passed':True,'errors':errors});ctx.close()
   browser.close()
finally:server.shutdown()
(OUT/'results.json').write_text(json.dumps(results,indent=2),encoding='utf-8');print('Refinement passed:',len(results),'cases; 20 entries, 2 own streams, AI viewport, rights/JSON back, schedule and contacts')
