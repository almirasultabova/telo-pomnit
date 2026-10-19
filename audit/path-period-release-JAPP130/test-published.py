from pathlib import Path
import importlib.util,json,urllib.request,urllib.error,urllib.parse,sys
from playwright.sync_api import sync_playwright,expect
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent
spec=importlib.util.spec_from_file_location('period',R/'audit/path-period-JAPP129/test-ui.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
results=json.loads((H/'published-ui.json').read_text(encoding='utf-8'))if'--retry'in sys.argv else[]
targets=[('chromium',390,'https://tg-app-telo-pomnit.vercel.app/'),('chromium',1440,'https://tg-app-telo-pomnit.vercel.app/'),('webkit',390,'https://tg-app-telo-pomnit.vercel.app/'),('chromium',390,'https://app.telo-pomnit.ru/')]
with sync_playwright()as p:
 for engine,width,base in targets:
  for mode in ['normal','current','none','checkin-failure']:
   if any(r['engine']==engine and r['width']==width and r['base']==base and r['mode']==mode for r in results):continue
   f,server=m.serve(mode);http1=base=='https://app.telo-pomnit.ru/';browser=getattr(p,engine).launch(args=['--disable-http2']if http1 else[]);page=browser.new_page(viewport={'width':width,'height':844});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.add_init_script(m.m.CLOCK+'window.TelegramWebviewProxy={postEvent:()=>{}};')
   def route(r):
    u=urllib.parse.urlsplit(r.request.url)
    if u.path.startswith('/api/'):
     req=urllib.request.Request(f'http://127.0.0.1:{server.server_port}'+u.path+('?' +u.query if u.query else ''),data=(r.request.post_data or '').encode()if r.request.method in['POST','PUT']else None,headers={k:v for k,v in r.request.headers.items()if k.lower()in['authorization','content-type']},method=r.request.method)
     try:response=urllib.request.urlopen(req,timeout=15)
     except urllib.error.HTTPError as e:response=e
     with response:r.fulfill(status=response.status,content_type='application/json',body=response.read())
    elif u.hostname==urllib.parse.urlsplit(base).hostname:r.continue_()
    else:r.abort()
   page.route('**/*',route)
   try:
    page.goto(base+'index.html?verify=JAPP130#tgWebAppData=synthetic&tgWebAppPlatform=ios&tgWebAppVersion=8.0',wait_until='domcontentloaded');expect(page.locator('#screen-home')).to_have_class('screen screen--active');page.evaluate('LaunchSplash.cancel()');m.wait(page,'Storage._historyInitializing.size===0');assert len(f.periodReads)==2
    m.select(page,[]if mode=='none'else m.STREAMS,None if mode=='none'else'current'if mode=='current'else'old');page.locator('.nav-btn[data-tab=diag]').click();cases=[]
    if mode=='none':expect(page.locator('.path-analysis')).to_contain_text('выберите доступный поток');assert len(f.periodReads)==2
    else:
     if mode=='checkin-failure':
      m.wait(page,'Storage.getPathPeriodStatus(pathPeriodScope()).checkins==="failed"&&Storage.getPathPeriodStatus(pathPeriodScope()).diary==="loaded"');expect(page.locator('#pd-panel')).to_contain_text('Не удалось');before=len([r for r in m.period_reads(f)if r['kind']=='diary']);f.failKind=None;page.locator('[data-pd-retry]').click();m.ready(page);assert len([r for r in m.period_reads(f)if r['kind']=='diary'])==before
     else:m.ready(page)
     assert not m.full_reads(f);assert page.evaluate('Storage.getHistoryLoadStatus().diary')=='partial';assert page.evaluate('Storage.getHistoryLoadStatus().checkins')=='partial';m.compare(page,f,cases);before=len(f.periodReads);page.evaluate("switchTab('main');switchTab('diag')");assert len(f.periodReads)==before
    assert not errors,errors;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');results.append({'engine':engine,'width':width,'base':base,'mode':mode,'passed':True,'http2Disabled':http1,'periodAndFullModelsEqual':mode!='none','reads':f.periodReads,'realWrites':0});(H/'published-ui.json').write_text(json.dumps(results,indent=2),encoding='utf-8');print('PASS published',engine,width,mode,base,flush=True)
   finally:f.gate.set();browser.close();server.shutdown();server.server_close()
assert len(results)==16
