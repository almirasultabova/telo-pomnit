from pathlib import Path
import importlib.util,json,urllib.request,urllib.parse
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).parent
spec=importlib.util.spec_from_file_location('recent',ROOT/'audit/recent-checkins-JAPP117/test-ui.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
results=[]
with sync_playwright() as p:
 for engine,width,base in [('chromium',390,'https://tg-app-telo-pomnit.vercel.app/'),('chromium',1440,'https://tg-app-telo-pomnit.vercel.app/'),('webkit',390,'https://tg-app-telo-pomnit.vercel.app/'),('chromium',390,'https://app.telo-pomnit.ru/')]:
  f,server=m.serve('published');browser=getattr(p,engine).launch();page=browser.new_page(viewport={'width':width,'height':844});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.add_init_script('window.TelegramWebviewProxy={postEvent:()=>{}}')
  def route(r):
   u=urllib.parse.urlsplit(r.request.url)
   if u.path.startswith('/api/'):
    req=urllib.request.Request(f'http://127.0.0.1:{server.server_port}'+u.path+('?' +u.query if u.query else ''),data=(r.request.post_data or '').encode() if r.request.method=='POST' else None,headers={k:v for k,v in r.request.headers.items() if k.lower() in ['authorization','content-type']},method=r.request.method)
    try:response=urllib.request.urlopen(req,timeout=10)
    except urllib.error.HTTPError as e:response=e
    with response:r.fulfill(status=response.status,content_type='application/json',body=response.read())
   elif u.hostname==urllib.parse.urlsplit(base).hostname:r.continue_()
   else:r.abort()
  page.route('**/*',route)
  try:
   page.goto(base+'index.html#tgWebAppData=synthetic&tgWebAppPlatform=ios&tgWebAppVersion=8.0');expect(page.locator('#screen-home')).to_have_class('screen screen--active');page.evaluate('LaunchSplash.cancel()');page.wait_for_function('Storage.getHistoryLoadStatus().checkins==="partial"&&Storage._historyInitializing.size===0');assert f.checkinCalls==[(201,0)];assert page.evaluate('Storage.getCheckins().length')==201
   page.locator('#main-state-btn').click();assert len(f.checkinCalls)==1;page.locator('#checkin-history-btn').click();page.wait_for_function('Storage.getHistoryLoadStatus().checkins==="loaded"');expect(page.locator('.checkin-card')).to_have_count(503);expect(page.locator('#checkin-history-list .section-label')).to_have_text('Все личные наблюдения');assert len(f.checkinCalls)==4
   page.locator('#new-checkin-btn').click();page.locator('#checkin-history-btn').click();assert len(f.checkinCalls)==4;assert not errors,errors;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');results.append({'engine':engine,'width':width,'base':base,'passed':True,'initialRequests':1,'initialRows':201,'fullRows':503,'reopenRequests':0,'pageErrors':errors,'realWrites':0});print('PASS published',engine,width,base,flush=True)
  finally:browser.close();server.shutdown();server.server_close()
(OUT/'published-ui.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
