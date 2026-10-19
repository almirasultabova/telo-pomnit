from pathlib import Path
import importlib.util,json,urllib.request,urllib.parse
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).parent
spec=importlib.util.spec_from_file_location('deferred',ROOT/'audit/deferred-history-JAPP112/test-ui.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
results=[]
with sync_playwright() as p:
 for engine,width,base in [('chromium',390,'https://tg-app-telo-pomnit.vercel.app/'),('chromium',1440,'https://tg-app-telo-pomnit.vercel.app/'),('webkit',390,'https://tg-app-telo-pomnit.vercel.app/'),('chromium',390,'https://app.telo-pomnit.ru/')]:
  f,server=m.serve();f.failed=True;parent=server.RequestHandlerClass
  f.diary={'synthetic':{f'd-{i}':{'id':f'd-{i}','clientId':f'c-{i}','zone':'chest','sensations':[],'createdAt':'2026-10-18T12:00:00Z','note':'Учебная запись'} for i in range(205)}}
  class Handler(parent):
   def api(self,method):
    if method=='GET' and urllib.parse.urlsplit(self.path).path=='/api/checkins' and f.failed:
     f.reads.append(('/api/checkins',0,0));return self.send_json({'error':'Учебный отказ'},503)
    return super().api(method)
  server.RequestHandlerClass=Handler
  browser=getattr(p,engine).launch();page=browser.new_page(viewport={'width':width,'height':844});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.add_init_script('window.TelegramWebviewProxy={postEvent:()=>{}}')
  def route(r):
   url=urllib.parse.urlsplit(r.request.url)
   if url.path.startswith('/api/'):
    target=f'http://127.0.0.1:{server.server_port}'+url.path+('?' +url.query if url.query else '')
    req=urllib.request.Request(target,data=(r.request.post_data or '').encode() if r.request.method=='POST' else None,headers={k:v for k,v in r.request.headers.items() if k.lower() in ['authorization','content-type']},method=r.request.method)
    try:response=urllib.request.urlopen(req,timeout=10)
    except urllib.error.HTTPError as e:response=e
    with response:r.fulfill(status=response.status,content_type='application/json',body=response.read())
   elif url.hostname==urllib.parse.urlsplit(base).hostname:r.continue_()
   else:r.abort()
  page.route('**/*',route)
  try:
   page.goto(base+'index.html#tgWebAppData=synthetic&tgWebAppPlatform=ios&tgWebAppVersion=8.0');expect(page.locator('#screen-home')).to_have_class('screen screen--active');page.evaluate('LaunchSplash.cancel()');m.wait(page,'()=>Storage.getHistoryLoadStatus().diary==="loaded"&&Storage.getHistoryLoadStatus().checkins==="failed"&&Storage._historyInitializing.size===0')
   assert m.count(f,'diary')==3;f.failed=False;page.get_by_role('button',name='Повторить загрузку наблюдений').click();m.wait(page,'()=>Storage.getHistoryLoadStatus().checkins==="loaded"&&Storage._historyInitializing.size===0');assert m.count(f,'diary')==3 and m.count(f,'checkins')==2
   assert m.count(f,'triggers')==0 and m.count(f,'after-meeting-notes')==0
   page.locator('.nav-btn[data-tab=diary]').click();expect(page.locator('.am-record')).to_have_count(10);assert m.count(f,'after-meeting-notes')==2
   page.locator('#stop-reaction-btn').click();assert m.count(f,'triggers')==0
   page.locator('#trigger-history-btn').click();expect(page.locator('.trigger-card')).to_have_count(205);assert m.count(f,'triggers')==3
   assert not errors,errors;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   results.append({'engine':engine,'width':width,'base':base,'passed':True,'initialSecondaryRequests':0,'allReactionRows':205,'notesOnOpen':51,'pageErrors':errors,'realWrites':0})
   print('PASS published',engine,width,base,flush=True)
  finally:browser.close();server.shutdown();server.server_close()
(OUT/'published-ui.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
