from pathlib import Path
import argparse,importlib.util,json,threading,time,hashlib
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).parent
s=importlib.util.spec_from_file_location('fixture',ROOT/'scripts/test-observation-drafts.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
def serve(delayed=True):
 f=m.Fixture();f.gate=threading.Event();f.fail_checkins=False;f.role='HOST'
 if not delayed:f.gate.set()
 f.diary['preview']={'body':{'id':'body','zone':'chest','createdAt':'2026-10-18T12:00:00Z','sensations':['tension'],'note':'Учебное наблюдение без ожидания реакций'}}
 server=m.serve(f);base=server.RequestHandlerClass
 class Handler(base):
  def api(self,method):
   path=urlsplit(self.path).path
   if path=='/api/auth/telegram':
    body=json.loads(self.rfile.read(int(self.headers.get('Content-Length',0))));owner=body.get('initData') or 'preview'
    return self.send_json({'token':owner,'user':{'id':owner,'name':'Учебная ведущая' if f.role=='HOST' else 'Учебная участница','role':f.role,'isClubAdmin':False,'consentGivenAt':'2026-10-01'}})
   if path=='/api/me/enrollment/access':return self.send_json({'streams':[{'id':'synthetic-stream','name':'Учебный поток','phase':'current','startDate':'2026-10-01','endDate':'2026-11-05','canAttend':True,'meetings':[]}],'ai':{'canWrite':False,'message':'Учебный режим без AI'}})
   if path=='/api/questionnaires/synthetic-stream':return self.send_json({'pre':None,'post':None})
   if path=='/api/triggers':f.gate.wait(7)
   if path=='/api/checkins':
    if f.fail_checkins:return self.send_json({'error':'Учебный отказ'},503)
    return self.send_json([{'id':'state','dayKey':'2026-10-18','createdAt':'2026-10-18T11:00:00Z','tension':3,'anxiety':4,'energy':6,'safety':7,'bodyContact':5,'note':'Учебная отметка состояния'}])
   return super().api(method)
 server.RequestHandlerClass=Handler
 return f,server
def wait(page,condition):
 until=time.monotonic()+6
 while time.monotonic()<until:
  if hasattr(page,"_flush_mock"):page._flush_mock()
  if page.evaluate(condition):return
  page.wait_for_timeout(40)
 raise AssertionError('State timeout: '+condition)
def run(engine,width):
 f,server=serve();cases=[]
 try:
  with sync_playwright() as p:
   browser=getattr(p,engine).launch();page=browser.new_page(viewport={'width':width,'height':844});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   held=[]
   def mock_api(route):
    path=route.request.url.split('/api/',1)[1]
    if path.startswith('triggers?') and not f.gate.is_set():held.append(route);return
    route.fulfill(response=route.fetch(url=f'http://127.0.0.1:{server.server_port}/api/'+path))
   def release_routes():
    if f.gate.is_set():
     for route in held[:]:route.fulfill(json=[]);held.remove(route)
   page._flush_mock=release_routes
   page.route('**/api/**',mock_api)
   url='https://tg-app-telo-pomnit.vercel.app/?verify=JAPP111#tgWebAppData=preview&tgWebAppVersion=8.0&tgWebAppPlatform=ios'
   page.goto(url);expect(page.locator('#screen-home')).to_have_class('screen screen--active');page.evaluate('LaunchSplash.cancel()')
   wait(page,'()=>Storage.getHistoryLoadStatus().diary==="loaded"&&Storage.getHistoryLoadStatus().checkins==="loaded"')
   assert page.evaluate('()=>Storage.getHistoryLoadStatus().triggers')=='loading'
   expect(page.locator('#tab-main').get_by_text('Учебное наблюдение без ожидания реакций',exact=True)).to_be_visible()
   expect(page.locator('#tab-main').get_by_text('Учебная отметка состояния',exact=True)).to_be_visible()
   cases.append('diary/checkins visible on Main before reaction history completes')
   assert page.evaluate('()=>Api.userRole')=='HOST';assert page.evaluate('()=>Api.isClubAdmin') is False
   page.locator('.nav-btn[data-tab=diag]').click();expect(page.locator('#path-program-btn small')).to_have_text('Расписание · в Профиле →')
   cases.append('server HOST role reaches existing schedule UI without admin grant')
   page.evaluate('document.fonts.ready');page.screenshot(path=str(OUT/f'{engine}-{width}-path.png'))
   f.gate.set();wait(page,'()=>Storage.getHistoryLoadStatus().triggers==="loaded"')
   page.locator('.nav-btn[data-tab=main]').click();f.fail_checkins=True;f.gate.clear();page.reload();expect(page.locator('#screen-home')).to_have_class('screen screen--active');page.evaluate('LaunchSplash.cancel()')
   wait(page,'()=>Storage.getHistoryLoadStatus().diary==="loaded"&&Storage.getHistoryLoadStatus().checkins==="failed"')
   assert page.evaluate('()=>Storage.getHistoryLoadStatus().triggers')=='loading'
   expect(page.locator('#tab-main .home-error')).to_contain_text('историю состояния')
   expect(page.locator('#tab-main').get_by_text('Учебное наблюдение без ожидания реакций',exact=True)).to_be_visible()
   cases.append('failed checkins reported while diary is ready and reactions still loading')
   f.gate.set();wait(page,'()=>Storage.getHistoryLoadStatus().triggers==="loaded"');f.fail_checkins=False
   button=page.locator('#tab-main .home-link').filter(has_text='Повторить загрузку наблюдений')
   button.click();wait(page,'()=>Storage.getHistoryLoadStatus().checkins==="loaded"');expect(page.locator('#tab-main .home-error')).to_have_count(0)
   cases.append('explicit retry restores failed history without losing ready data')
   f.role='PARTICIPANT';page.reload();expect(page.locator('#screen-home')).to_have_class('screen screen--active');page.evaluate('LaunchSplash.cancel();closeQInvite();switchTab("diag")')
   expect(page.locator('#path-program-btn small')).to_have_text('Анкета и расписание · в Профиле →');assert page.evaluate('()=>Api.isClubAdmin') is False
   cases.append('participant retains own questionnaire UI and is not admin')
   assert not errors,errors;assert page.evaluate('()=>document.documentElement.scrollWidth<=innerWidth');browser.close()
 finally:f.gate.set();server.shutdown();server.server_close()
 return {'passed':True,'engine':engine,'width':width,'cases':cases,'pageErrors':errors}
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--preview',action='store_true');args=parser.parse_args()
 if args.preview:
  f,server=serve(False);print(f'LOCAL_FICTIONAL_HISTORY_PREVIEW http://127.0.0.1:{server.server_port}/app/index.html?owner=preview',flush=True);threading.Event().wait()
 else:
  runs=[run(*a) for a in [('chromium',390),('webkit',390)]]
  result={'passed':True,'runs':runs,'sourceHashes':{f:hashlib.sha256((ROOT/f).read_bytes()).hexdigest() for f in ['app/js/storage.js','backend/src/routes/auth.js']}}
  (OUT/'ui-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'passed':True,'groups':sum(len(r['cases']) for r in runs)}))
