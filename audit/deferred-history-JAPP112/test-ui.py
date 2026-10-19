from pathlib import Path
import argparse,importlib.util,json,threading,time,hashlib
from urllib.parse import urlsplit,parse_qs
from datetime import datetime,timedelta,timezone
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).parent
s=importlib.util.spec_from_file_location('fixture',ROOT/'scripts/test-observation-drafts.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
def serve(before=False):
 f=m.Fixture();f.reads=[];f.fail_offset=None;f.before=before;f.hold=None;f.started=threading.Event()
 f.reactions=[{'id':f't-{i}','createdAt':(datetime(2026,10,18,12,tzinfo=timezone.utc)-timedelta(minutes=i)).isoformat(),'situation':f'Учебная реакция {i}','reactionType':'freeze','intensity':5,'sensations':[],'note':''}for i in range(205)]
 f.notes=[{'id':f'n-{i}','kind':'analysis','meetingDate':'2026-10-17','text':f'Учебная заметка после встречи {i}','revision':1,'stepText':'','stepPaused':False,'events':[]}for i in range(51)]
 server=m.serve(f);base=server.RequestHandlerClass
 class Handler(base):
  def do_GET(self):
   path=urlsplit(self.path).path
   if f.before and path in ['/app/js/app.js','/app/js/storage.js']:
    data=(OUT/'before'/path.lstrip('/')).read_bytes();self.send_response(200);self.send_header('Content-Type','text/javascript');self.end_headers();self.wfile.write(data);return
   super().do_GET()
  def api(self,method):
   u=urlsplit(self.path);q=parse_qs(u.query);offset=int(q.get('offset',[0])[0]);limit=int(q.get('limit',[90])[0])
   if method=='GET':f.reads.append((u.path,offset,limit))
   if u.path=='/api/triggers' and method=='GET':
    if f.hold:gate=f.hold;f.hold=None;f.started.set();gate.wait(7)
    if f.fail_offset==offset:return self.send_json({'error':'Учебный отказ страницы'},503)
    return self.send_json(f.reactions[offset:offset+limit])
   if u.path=='/api/after-meeting-notes' and method=='GET':return self.send_json(f.notes[offset:offset+limit])
   return super().api(method)
 server.RequestHandlerClass=Handler
 return f,server
def wait(page,condition):
 until=time.monotonic()+8
 while time.monotonic()<until:
  if page.evaluate(condition):return
  page.wait_for_timeout(40)
 raise AssertionError('State timeout: '+condition)
def start(page,url):
 page.goto(url);expect(page.locator('#screen-home')).to_have_class('screen screen--active');page.evaluate('LaunchSplash.cancel()');wait(page,'()=>Storage.getHistoryLoadStatus().diary==="loaded"&&Storage.getHistoryLoadStatus().checkins==="loaded"&&Storage._historyInitializing.size===0')
def count(f,path):return len([r for r in f.reads if r[0]=='/api/'+path])
def baseline():
 f,server=serve(True)
 try:
  with sync_playwright()as p:
   browser=p.chromium.launch();page=browser.new_page(viewport={'width':390,'height':844});page.route('https://**/*',lambda r:r.abort());start(page,f'http://127.0.0.1:{server.server_port}/app/index.html?owner=preview');wait(page,'()=>document.querySelectorAll(".am-record").length===10&&Storage.getTriggerEntries().length===205');result={'triggerRequests':count(f,'triggers'),'noteRequests':count(f,'after-meeting-notes'),'triggerRows':205,'noteRows':51};assert result['triggerRequests']==3 and result['noteRequests']==2;browser.close();return result
 finally:server.shutdown();server.server_close()
def run(engine,width):
 f,server=serve();cases=[]
 try:
  with sync_playwright()as p:
   browser=getattr(p,engine).launch();page=browser.new_page(viewport={'width':width,'height':844});page.route('https://**/*',lambda r:r.abort());errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   start(page,f'http://127.0.0.1:{server.server_port}/app/index.html?owner=preview')
   assert count(f,'triggers')==0 and count(f,'after-meeting-notes')==0;assert page.evaluate('()=>Storage.getHistoryLoadStatus().triggers')=='idle';cases.append('Main starts without reaction or post-meeting history GETs')
   page.locator('.nav-btn[data-tab=profile]').click();page.locator('.nav-btn[data-tab=main]').click();assert count(f,'triggers')==0 and count(f,'after-meeting-notes')==0;cases.append('Main/Profile navigation does not load secondary histories')
   page.locator('.nav-btn[data-tab=diary]').click();expect(page.locator('.am-record')).to_have_count(10);assert count(f,'after-meeting-notes')==2 and count(f,'triggers')==0
   more=page.locator('#am-journal').get_by_role('button',name='Показать ещё',exact=True)
   while more.count():more.click()
   expect(page.locator('.am-record')).to_have_count(51);cases.append('Diary loads all51 notes in two pages; disclosure and notes remain available')
   page.locator('#stop-reaction-btn').click();assert count(f,'triggers')==0;cases.append('Reaction form opens without downloading its history')
   f.fail_offset=90;page.locator('#trigger-history-btn').click();expect(page.locator('#trigger-history-list')).to_contain_text('Историю реакций загрузить не удалось');expect(page.locator('.trigger-card')).to_have_count(0);assert count(f,'triggers')==2;cases.append('later-page failure is explicit and never presents partial history as complete')
   f.fail_offset=None;page.locator('#trigger-history-retry').press('Enter');expect(page.locator('.trigger-card')).to_have_count(205);assert count(f,'triggers')==5;assert sum(int(v)for v in page.locator('.trigger-stat-count').all_text_contents())==205;cases.append('keyboard retry loads all205 reactions and complete distribution')
   page.evaluate('goBack()');page.locator('#trigger-history-btn').click();expect(page.locator('.trigger-card')).to_have_count(205);assert count(f,'triggers')==5;cases.append('reopening a loaded history uses confirmed cache without duplicate scans')
   f.fail_offset=90;page.evaluate('void Storage.loadTriggerHistory().catch(()=>{})');wait(page,'()=>Storage.getHistoryLoadStatus().triggers==="failed"');expect(page.locator('.trigger-card')).to_have_count(205);expect(page.locator('#trigger-history-list')).to_contain_text('Показаны записи с этого устройства');cases.append('failed refresh preserves cached records and signals incomplete refresh')
   f.fail_offset=None;f.started.clear();f.hold=threading.Event();gate=f.hold;page.locator('#trigger-history-retry').click();assert f.started.wait(4)
   page.evaluate('Api.logout()');gate.set();wait(page,'()=>Storage._triggerHistoryLoading.size===0');assert page.evaluate('()=>Storage._userId')is None;assert page.locator('.trigger-card').count()==0;cases.append('logout during delayed history discards late private response')
   assert not errors,errors;assert page.evaluate('()=>document.documentElement.scrollWidth<=innerWidth');browser.close()
 finally:
  if f.hold:f.hold.set()
  server.shutdown();server.server_close()
 return {'passed':True,'engine':engine,'width':width,'cases':cases,'pageErrors':errors,'startupTriggerRequests':0,'startupNoteRequests':0}
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--preview',action='store_true');args=parser.parse_args()
 if args.preview:
  f,server=serve();print(f'LOCAL_FICTIONAL_DEFERRED_PREVIEW http://127.0.0.1:{server.server_port}/app/index.html?owner=preview',flush=True);threading.Event().wait()
 else:
  before=baseline();print('Baseline:',before,flush=True);runs=[]
  for engine,width in [('chromium',320),('chromium',390),('chromium',1440),('webkit',390)]:print('Checking',engine,width,flush=True);runs.append(run(engine,width))
  result={'passed':True,'baseline':before,'runs':runs,'sourceHashes':{f:hashlib.sha256((ROOT/f).read_bytes()).hexdigest()for f in ['app/js/app.js','app/js/storage.js','app/js/observation-drafts.js']}}
  (OUT/'ui-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'passed':True,'groups':sum(len(r['cases'])for r in runs)}))
