from pathlib import Path
import importlib.util,json,urllib.request,urllib.parse,urllib.error
from playwright.sync_api import sync_playwright,expect
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent
spec=importlib.util.spec_from_file_location('recent',R/'audit/recent-diary-JAPP119/test-ui.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
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
   page.goto(base+'index.html#tgWebAppData=synthetic&tgWebAppPlatform=ios&tgWebAppVersion=8.0');expect(page.locator('#screen-home')).to_have_class('screen screen--active');page.evaluate('LaunchSplash.cancel()');page.wait_for_function('Storage.getHistoryLoadStatus().diary==="partial"&&Storage._historyInitializing.size===0');assert f.diaryCalls==[(91,0)];assert page.evaluate('Storage.getDiaryEntries().length')==91;assert page.evaluate('Storage.getStreak()')==503
   page.locator('.nav-btn[data-tab=diary]').click();page.wait_for_function('Storage.getHistoryLoadStatus().diary==="loaded"');assert page.evaluate('Storage.getDiaryEntries().length')==503;expect(page.locator('#streak-num')).to_have_text('503');assert len(f.diaryCalls)==7;before=len(f.diaryCalls)
   page.locator('.nav-btn[data-tab=main]').click();page.locator('.nav-btn[data-tab=diary]').click();assert len(f.diaryCalls)==before;assert not errors,errors;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');results.append({'engine':engine,'width':width,'base':base,'passed':True,'initialFullRows':91,'compactDays':503,'streak':503,'fullRowsOnDiary':503,'reopenRequests':0,'pageErrors':errors,'realWrites':0});print('PASS published',engine,width,base,flush=True)
  finally:browser.close();server.shutdown();server.server_close()
(H/'published-ui.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
