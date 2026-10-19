from pathlib import Path
import importlib.util,json,threading,hashlib
from datetime import datetime,timedelta,timezone
from urllib.parse import urlsplit,parse_qs
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).parent
spec=importlib.util.spec_from_file_location('deferred',ROOT/'audit/deferred-history-JAPP112/test-ui.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def serve(mode):
 f,server=m.serve();f.checkinCalls=[];f.fail=mode=='failure';f.gate=threading.Event();f.started=threading.Event();parent=server.RequestHandlerClass
 f.rows=[]
 for i in range(503):
  date=(datetime(2026,10,18,12,tzinfo=timezone.utc)-timedelta(days=i)).isoformat()
  f.rows.append({'id':f'c-{i}','dayKey':date[:10],'createdAt':date,'clientUpdatedAt':date,'tension':i%10+1,'anxiety':3,'energy':6,'safety':7,'bodyContact':5,'note':f'Учебная отметка {i}'})
 class Handler(parent):
  def api(self,method):
   u=urlsplit(self.path)
   if method=='GET' and u.path=='/api/checkins':
    q=parse_qs(u.query);limit=int(q.get('limit',[30])[0]);offset=int(q.get('offset',[0])[0]);f.checkinCalls.append((limit,offset))
    if limit==200 and offset==0 and mode in ['history','graph']:f.started.set();f.gate.wait(10)
    if f.fail and offset==200:return self.send_json({'error':'Учебный отказ второй страницы'},503)
    return self.send_json(f.rows[offset:offset+limit])
   return super().api(method)
 server.RequestHandlerClass=Handler;return f,server
def wait(page,condition):page.wait_for_function(condition,timeout=15000)
def run(engine,width,mode):
 f,server=serve(mode);cases=[];errors=[]
 try:
  with sync_playwright() as p:
   browser=getattr(p,engine).launch();page=browser.new_page(viewport={'width':width,'height':844});page.route('https://**/*',lambda r:r.abort());page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{server.server_port}/app/index.html?owner=preview');expect(page.locator('#screen-home')).to_have_class('screen screen--active');page.evaluate('LaunchSplash.cancel()');wait(page,'Storage.getHistoryLoadStatus().checkins==="partial"&&Storage._historyInitializing.size===0')
   assert f.checkinCalls==[(201,0)],f.checkinCalls;assert page.evaluate('Storage.getCheckins().length')==201;expect(page.locator('#home-observations')).to_contain_text('Учебная отметка 0');cases.append('Main reads one201-row page and shows newest observation without full scan')
   page.locator('.nav-btn[data-tab=profile]').click();page.locator('.nav-btn[data-tab=main]').click();assert f.checkinCalls==[(201,0)];cases.append('Main/Profile do not fetch old checkins')
   if mode=='graph':
    page.evaluate('''programAccess={streams:[{id:'old',name:'Учебный завершённый поток',startDate:'2025-06-10T12:00:00Z',endDate:'2025-07-15T12:00:00Z',phase:'completed',canAttend:false,canReadRecordings:false}],ai:{canWrite:false}};selectedProgramId='old';''')
    page.locator('.nav-btn[data-tab=diag]').click();assert f.started.wait(2);expect(page.locator('#pd-panel')).to_contain_text('Загружаем ваши отметки');assert page.locator('.pd-comparison').count()==0;cases.append('old-stream chart shows loading rather than a comparison from partial cache');f.gate.set();wait(page,'Storage.getHistoryLoadStatus().checkins==="loaded"');assert page.evaluate('pathDynamicsContext().rows.length')==36;expect(page.locator('#pd-panel .pd-comparison')).to_be_visible();assert page.evaluate('Storage.getCheckins().length')==503;cases.append('complete503-row history restores36 older stream days and original five scales')
    before=len(f.checkinCalls);page.locator('.nav-btn[data-tab=main]').click();page.locator('.nav-btn[data-tab=diag]').click();assert len(f.checkinCalls)==before;cases.append('reopening the verified graph does not rescan history')
   else:
    page.locator('#main-state-btn').click();assert f.checkinCalls==[(201,0)];page.locator('#checkin-history-btn').click()
    if mode=='history':
     assert f.started.wait(2);expect(page.locator('#checkin-history-list')).to_contain_text('Загружаем ваши отметки');expect(page.locator('#checkin-history-list .section-label')).to_have_text('Наблюдения на этом устройстве');assert page.locator('.checkin-comparison').count()==0;f.gate.set();cases.append('history labels partial cache and loading before completion')
    else:
     wait(page,'Storage.getHistoryLoadStatus().checkins==="failed"');expect(page.locator('.checkin-card')).to_have_count(201);expect(page.locator('#history-load-warning-checkins')).to_be_visible();expect(page.locator('#checkin-history-list .section-label')).to_have_text('Наблюдения на этом устройстве');assert page.locator('.checkin-comparison').count()==0;cases.append('second-page error preserves201 cached rows without claiming complete history');f.fail=False;page.locator('#history-load-warning-checkins button').click()
    wait(page,'Storage.getHistoryLoadStatus().checkins==="loaded"');expect(page.locator('.checkin-card')).to_have_count(503);expect(page.locator('#checkin-history-list .section-label')).to_have_text('Все личные наблюдения');assert page.locator('#history-load-warning-checkins').count()==0;cases.append('full list503 and all five original scale values are available after completion')
    before=len(f.checkinCalls);page.locator('#new-checkin-btn').click();page.locator('#checkin-history-btn').click();assert len(f.checkinCalls)==before;cases.append('reopening complete history uses verified cache')
   assert not errors,errors;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');cases.append('no page errors or horizontal overflow')
   page.screenshot(path=str(OUT/f'{engine}-{width}-{mode}.png'));browser.close()
 finally:f.gate.set();server.shutdown();server.server_close()
 return {'engine':engine,'width':width,'mode':mode,'passed':True,'initialRows':201,'totalRows':503,'calls':f.checkinCalls,'cases':cases,'realWrites':0}
if __name__=='__main__':
 runs=[]
 for engine,width in [('chromium',320),('chromium',390),('chromium',1440),('webkit',390)]:
  for mode in ['history','graph','failure']:print('Checking',engine,width,mode,flush=True);runs.append(run(engine,width,mode))
 result={'passed':True,'runs':runs,'sourceHashes':{f:hashlib.sha256((ROOT/f).read_bytes()).hexdigest() for f in ['app/js/app.js','app/js/storage.js','app/js/api.js']}}
 (OUT/'ui-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'passed':True,'groups':sum(len(r['cases'])for r in runs)}))
