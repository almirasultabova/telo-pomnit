from pathlib import Path
import importlib.util,json,threading,hashlib
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).parent
spec=importlib.util.spec_from_file_location('deferred',ROOT/'audit/deferred-history-JAPP112/test-ui.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def run(engine,width,mode):
 f,server=m.serve();f.failed=True;f.gate=threading.Event();f.started=threading.Event();parent=server.RequestHandlerClass
 f.diary={'preview':{f'd-{i}':{'id':f'd-{i}','clientId':f'dc-{i}','createdAt':'2026-10-18T12:00:00Z','zone':'chest','sensations':['tension'],'note':f'Учебная запись {i}'} for i in range(205)}}
 class Handler(parent):
  def api(self,method):
   path=urlsplit(self.path).path
   if method=='GET' and ((path=='/api/checkins' and mode=='checkins') or (path=='/api/diary' and mode=='diary')) and f.failed:
    f.reads.append((path,0,0));return self.send_json({'error':'Учебный отказ выбранной истории'},503)
   if method=='GET' and path=='/api/checkins' and mode=='diary':f.started.set();f.gate.wait(12)
   return super().api(method)
 server.RequestHandlerClass=Handler;cases=[];errors=[]
 try:
  with sync_playwright() as p:
   browser=getattr(p,engine).launch();page=browser.new_page(viewport={'width':width,'height':844});page.route('https://**/*',lambda r:r.abort());page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{server.server_port}/app/index.html?owner=preview');expect(page.locator('#screen-home')).to_have_class('screen screen--active');page.evaluate('LaunchSplash.cancel()')
   if mode=='checkins':
    m.wait(page,'()=>Storage.getHistoryLoadStatus().diary==="loaded"&&Storage.getHistoryLoadStatus().checkins==="failed"&&Storage._historyInitializing.size===0')
    assert m.count(f,'diary')==3;before=list(f.reads);f.failed=False
    page.get_by_role('button',name='Повторить загрузку наблюдений').click()
    m.wait(page,'()=>Storage.getHistoryLoadStatus().checkins==="loaded"&&Storage._historyInitializing.size===0')
    assert m.count(f,'diary')==3;assert m.count(f,'checkins')==2;assert len([r for r in f.reads if r[0] in ['/api/diagnostic/result','/api/habitual/result']])==2
    assert page.evaluate('Storage.getDiaryEntries().length')==205;cases.append('Home retries only failed checkins;205 ready diary rows and three GETs remain intact')
    assert not page.get_by_role('button',name='Повторить загрузку наблюдений').count();cases.append('successful empty checkin history becomes loaded without stale failure')
    before=list(f.reads);page.evaluate('refreshPathDynamics(null,false)');m.wait(page,'()=>Storage._historyInitializing.size===0');assert m.count(f,'checkins')==3;assert m.count(f,'diary')==3;cases.append('chart refresh requests checkins alone')
   else:
    m.wait(page,'()=>Storage.getHistoryLoadStatus().diary==="failed"&&Storage.getHistoryLoadStatus().checkins==="loading"');assert f.started.wait(2)
    page.locator('.nav-btn[data-tab=diary]').click();expect(page.locator('#history-load-warning-diary button')).to_be_visible();f.failed=False
    page.locator('#history-load-warning-diary button').click();m.wait(page,'()=>Storage.getHistoryLoadStatus().diary==="loaded"')
    assert not f.gate.is_set();assert page.evaluate('Storage.getHistoryLoadStatus().checkins')=='loading';assert m.count(f,'diary')==4 and m.count(f,'checkins')==0;cases.append('Diary retry finishes all205 rows while unrelated initial checkins is still held')
    expect(page.locator('#history-load-warning-diary')).to_have_count(0);assert page.evaluate('Storage.getDiaryEntries().length')==205;cases.append('retry clears only diary failure and preserves its complete result')
    f.gate.set();m.wait(page,'()=>Storage._historyInitializing.size===0&&Storage._historyRestoring.size===0');assert m.count(f,'checkins')==1;cases.append('one original checkin request completes without a duplicate')
   assert m.count(f,'triggers')==0;assert not errors,errors;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');cases.append('reaction history stays deferred; no page errors or overflow')
   page.screenshot(path=str(OUT/f'{engine}-{width}-{mode}.png'));browser.close()
 finally:f.gate.set();server.shutdown();server.server_close()
 return {'engine':engine,'width':width,'mode':mode,'passed':True,'cases':cases,'realWrites':0}
if __name__=='__main__':
 runs=[]
 for engine,width in [('chromium',320),('chromium',390),('chromium',1440),('webkit',390)]:
  for mode in ['checkins','diary']:
   print('Checking',engine,width,mode,flush=True);runs.append(run(engine,width,mode))
 result={'passed':True,'runs':runs,'sourceHashes':{f:hashlib.sha256((ROOT/f).read_bytes()).hexdigest() for f in ['app/js/app.js','app/js/storage.js']}}
 (OUT/'ui-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'passed':True,'groups':sum(len(r['cases']) for r in runs)}))
