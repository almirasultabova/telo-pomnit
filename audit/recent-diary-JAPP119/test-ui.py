from pathlib import Path
import importlib.util,json,threading,hashlib
from datetime import datetime,timedelta,timezone
from urllib.parse import urlsplit,parse_qs
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).parent
spec=importlib.util.spec_from_file_location('deferred',ROOT/'audit/deferred-history-JAPP112/test-ui.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def serve(mode):
 f,server=m.serve();f.diaryCalls=[];f.dayCalls=0;f.fail=mode=='failure';f.indexFail=mode=='index';f.gate=threading.Event();f.started=threading.Event();parent=server.RequestHandlerClass
 f.rows=[]
 for i in range(503):
  if mode=='today':date=datetime(2026,10,19,12,tzinfo=timezone.utc)-timedelta(minutes=i) if i<95 else datetime(2026,10,18,12,tzinfo=timezone.utc)-timedelta(days=i-95)
  else:date=datetime(2026,10,18,12,tzinfo=timezone.utc)-timedelta(days=i)
  f.rows.append({'id':f'd-{i}','clientId':f'dc-{i}','createdAt':date.isoformat(),'zone':'chest','sensations':['tension'],'note':f'Учебная запись {i}'})
 f.diary={'preview':{row['id']:row for row in f.rows}}
 class Handler(parent):
  def api(self,method):
   u=urlsplit(self.path)
   if method=='GET' and u.path=='/api/diary/days':
    f.dayCalls+=1
    if f.indexFail:return self.send_json({'error':'Учебный отказ списка дат'},503)
    return self.send_json({'timeZone':'Europe/Moscow','days':sorted({row['createdAt'][:10] for row in f.rows})})
   if method=='GET' and u.path=='/api/diary':
    q=parse_qs(u.query);limit=int(q.get('limit',[20])[0]);offset=int(q.get('offset',[0])[0]);f.diaryCalls.append((limit,offset))
    if limit==90 and offset==0 and mode in ['diary','path']:f.started.set();f.gate.wait(10)
    if f.fail and offset==90:return self.send_json({'error':'Учебный отказ второй страницы'},503)
    return self.send_json(f.rows[offset:offset+limit])
   return super().api(method)
 server.RequestHandlerClass=Handler;return f,server
def wait(page,condition):page.wait_for_function(condition,timeout=15000)
def run(engine,width,mode):
 f,server=serve(mode);cases=[];errors=[]
 try:
  with sync_playwright() as p:
   browser=getattr(p,engine).launch();page=browser.new_page(viewport={'width':width,'height':844});page.route('https://**/*',lambda r:r.abort());page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{server.server_port}/app/index.html?owner=preview');expect(page.locator('#screen-home')).to_have_class('screen screen--active');page.evaluate('LaunchSplash.cancel()')
   if mode=='index':
    wait(page,'Storage.getHistoryLoadStatus().diary==="failed"&&Storage._historyInitializing.size===0');assert not page.evaluate('Storage.diaryStreakReady()');assert page.locator('#streak-num').text_content()=='—';cases.append('failed calendar index does not show a fabricated short streak');f.indexFail=False;page.get_by_role('button',name='Повторить загрузку наблюдений').click();wait(page,'Storage.getHistoryLoadStatus().diary==="loaded"');assert page.evaluate('Storage.getDiaryEntries().length')==503;assert page.evaluate('Storage.getStreak()')==503;cases.append('explicit retry restores all503 rows and exact503-day streak')
   else:
    wait(page,'Storage.getHistoryLoadStatus().diary==="partial"&&Storage._historyInitializing.size===0');assert f.diaryCalls==[(91,0)] and f.dayCalls==1;assert page.evaluate('Storage.getDiaryEntries().length')==91;expected=409 if mode=='today' else 503;assert page.evaluate('Storage.getStreak()')==expected;expect(page.locator('#home-observations')).to_contain_text('Учебная запись 0');cases.append('Main reads91 full rows plus compact dates and keeps exact long streak')
    page.locator('.nav-btn[data-tab=profile]').click();page.locator('.nav-btn[data-tab=main]').click();assert f.diaryCalls==[(91,0)];cases.append('Main/Profile do not trigger a full diary scan')
    if mode=='path':
     page.evaluate("programAccess={streams:[{id:'old',name:'Учебный завершённый поток',startDate:'2025-06-10T12:00:00Z',endDate:'2025-07-14T12:00:00Z',phase:'completed',canAttend:false}],ai:{canWrite:false}};selectedProgramId='old';")
     page.locator('.nav-btn[data-tab=diag]').click();assert f.started.wait(2);expect(page.locator('.path-analysis')).to_contain_text('Загружаем наблюдения');assert page.locator('.path-analysis .stream-summary').count()==0;cases.append('map and summary wait instead of using truncated old-stream data');f.gate.set();wait(page,'Storage.getHistoryLoadStatus().diary==="loaded"');assert page.evaluate('Storage.getDiaryEntries().filter(row=>inStreamPeriod(row)).length')==35;expect(page.locator('.path-analysis .stream-summary')).to_contain_text('35');cases.append('old-stream map and summary receive all35 matching observations')
    else:
     page.locator('.nav-btn[data-tab=diary]').click()
     if mode=='diary':assert f.started.wait(2);expect(page.locator('#diary-history-loading')).to_be_visible();assert page.locator('#streak-num').text_content()=='503';f.gate.set();cases.append('diary keeps exact streak while full texts are still loading')
     if mode=='failure':
      wait(page,'Storage.getHistoryLoadStatus().diary==="failed"');assert page.evaluate('Storage.getDiaryEntries().length')==91;assert page.evaluate('Storage.getStreak()')==503;expect(page.locator('#history-load-warning-diary')).to_be_visible();cases.append('page error preserves91 cached notes and independently correct streak');f.fail=False;page.locator('#history-load-warning-diary button').click()
     wait(page,'Storage.getHistoryLoadStatus().diary==="loaded"');assert page.evaluate('Storage.getDiaryEntries().length')==503;expect(page.locator('#diary-history-loading')).to_have_count(0);cases.append('full503-note diary restores without deleting cache or pending data')
     if mode=='today':expect(page.locator('.today-entry-row')).to_have_count(95);cases.append('more than91 notes on the same day are all restored on Diary entry')
    before=len(f.diaryCalls);page.locator('.nav-btn[data-tab=main]').click();page.locator('.nav-btn[data-tab=diary]').click();assert len(f.diaryCalls)==before;cases.append('reopening a verified diary does not rescan')
   assert not errors,errors;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');cases.append('no page errors or horizontal overflow');page.screenshot(path=str(OUT/f'{engine}-{width}-{mode}.png'));browser.close()
 finally:f.gate.set();server.shutdown();server.server_close()
 return {'engine':engine,'width':width,'mode':mode,'passed':True,'cases':cases,'dayRequests':f.dayCalls,'diaryRequests':f.diaryCalls,'realWrites':0}
if __name__=='__main__':
 runs=[]
 for engine,width in [('chromium',320),('chromium',390),('chromium',1440),('webkit',390)]:
  for mode in ['diary','path','failure','index','today']:print('Checking',engine,width,mode,flush=True);runs.append(run(engine,width,mode))
 result={'passed':True,'runs':runs,'sourceHashes':{f:hashlib.sha256((ROOT/f).read_bytes()).hexdigest() for f in ['app/js/app.js','app/js/storage.js','app/js/api.js']}}
 (OUT/'ui-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'passed':True,'groups':sum(len(r['cases'])for r in runs)}))
