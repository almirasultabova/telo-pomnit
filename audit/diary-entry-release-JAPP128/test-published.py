from pathlib import Path
import importlib.util,json,urllib.request,urllib.error,urllib.parse,threading,sys
from playwright.sync_api import sync_playwright,expect
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent
spec=importlib.util.spec_from_file_location('candidate',R/'audit/diary-entry-JAPP127/test-ui.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
results=json.loads((H/'published-ui.json').read_text(encoding='utf-8'))if'--retry-reserve'in sys.argv else[]
targets=[('chromium',390,'https://app.telo-pomnit.ru/')]if'--retry-reserve'in sys.argv else[('chromium',390,'https://tg-app-telo-pomnit.vercel.app/'),('chromium',1440,'https://tg-app-telo-pomnit.vercel.app/'),('webkit',390,'https://tg-app-telo-pomnit.vercel.app/'),('chromium',390,'https://app.telo-pomnit.ru/')]
with sync_playwright() as p:
 for engine,width,base in targets:
  for mode in ['normal','today','search','path']:
   if any(r['base']==base and r['width']==width and r['engine']==engine and r['mode']==mode for r in results):continue
   f,server=m.serve(mode);http1=base=='https://app.telo-pomnit.ru/';browser=getattr(p,engine).launch(args=['--disable-http2']if http1 else[]);page=browser.new_page(viewport={'width':width,'height':844});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.add_init_script(m.CLOCK+'window.TelegramWebviewProxy={postEvent:()=>{}};')
   def route(r):
    u=urllib.parse.urlsplit(r.request.url)
    if u.path.startswith('/api/'):
     req=urllib.request.Request(f'http://127.0.0.1:{server.server_port}'+u.path+('?' +u.query if u.query else ''),data=(r.request.post_data or '').encode() if r.request.method in ['POST','PUT'] else None,headers={k:v for k,v in r.request.headers.items() if k.lower() in ['authorization','content-type']},method=r.request.method)
     try:response=urllib.request.urlopen(req,timeout=15)
     except urllib.error.HTTPError as e:response=e
     with response:r.fulfill(status=response.status,content_type='application/json',body=response.read())
    elif u.hostname==urllib.parse.urlsplit(base).hostname:r.continue_()
    else:r.abort()
   page.route('**/*',route)
   try:
    page.goto(base+'index.html?verify=JAPP128#tgWebAppData=synthetic&tgWebAppPlatform=ios&tgWebAppVersion=8.0',wait_until='domcontentloaded');expect(page.locator('#screen-home')).to_have_class('screen screen--active');page.evaluate('LaunchSplash.cancel()');m.wait(page,'Storage._historyInitializing.size===0')
    # The Python route proxy waits synchronously for its HTTP fixture. Release on
    # another thread; held-response loading/ACK are covered by the local suite.
    if mode=='today':threading.Timer(0.5,f.gate.set).start()
    page.locator('.nav-btn[data-tab=diary]').click()
    if mode=='today':
     assert f.started.wait(2)
    m.wait(page,'Storage.getDiaryTodayStatus()==="loaded"');assert not m.full_reads(f)
    if mode=='today':expect(page.locator('.today-entry-row')).to_have_count(95);assert len([r for r in f.diaryReads if r['from']])==2
    if mode=='search':
     page.locator('#diary-history-btn').click();expect(page.locator('.hm-card').first).to_be_visible();page.locator('#hm-search').fill('Учебная запись 900');expect(page.locator('.hm-card')).to_have_count(1);page.locator('.hm-star').click();expect(page.locator('.hm-star')).to_have_attribute('aria-pressed','true');page.locator('#hm-important').click();expect(page.locator('.hm-card')).to_have_count(1);page.locator('.hm-open').click();expect(page.locator('#screen-history-record')).to_contain_text('Учебная запись 900');assert page.evaluate('Storage.getDiaryEntries().length')==91
    if mode=='path':
     page.evaluate("programAccess={streams:[{id:'old',name:'Учебный завершённый поток',startDate:'2025-06-10T12:00:00Z',endDate:'2025-07-14T12:00:00Z',phase:'completed',canAttend:false}],ai:{canWrite:false}};selectedProgramId='old';");threading.Timer(0.5,f.gate.set).start();page.locator('.nav-btn[data-tab=diag]').click();assert f.started.wait(2);m.wait(page,'Storage.getHistoryLoadStatus().diary==="loaded"');assert page.evaluate('Storage.getDiaryEntries().length')==1000;expect(page.locator('.path-analysis .stream-summary')).to_contain_text('35')
    assert not errors,errors;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');results.append({'engine':engine,'width':width,'base':base,'mode':mode,'passed':True,'http2Disabled':http1,'dayReads':f.diaryReads,'realWrites':0});(H/'published-ui.json').write_text(json.dumps(results,indent=2),encoding='utf-8');print('PASS published',engine,width,mode,base,flush=True)
   finally:f.gate.set();browser.close();server.shutdown();server.server_close()
(H/'published-ui.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
