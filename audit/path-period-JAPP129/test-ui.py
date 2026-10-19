from pathlib import Path
import importlib.util,json,threading,hashlib,sys
from datetime import datetime,timedelta,timezone
from urllib.parse import urlsplit,parse_qs
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).parent
spec=importlib.util.spec_from_file_location('day',ROOT/'audit/diary-entry-JAPP127/test-ui.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
STREAMS=[{'id':'old','name':'Учебный старый поток','startDate':'2025-06-10T12:00:00Z','endDate':'2025-07-14T12:00:00Z','phase':'completed','canAttend':False},{'id':'current','name':'Учебный текущий поток','startDate':'2026-10-01T12:00:00Z','endDate':'2026-11-04T12:00:00Z','phase':'current','canAttend':True},{'id':'overlap','name':'Учебный пересекающийся поток','startDate':'2025-06-20T12:00:00Z','endDate':'2025-07-24T12:00:00Z','phase':'completed','canAttend':False}]
def serve(mode):
 f,server=m.serve('normal');f.periodReads=[];f.failKind='diary'if mode=='failure'else'checkins'if mode=='checkin-failure'else None;f.gate=threading.Event();f.started=threading.Event()
 old=datetime(2025,6,10,12,tzinfo=timezone.utc)
 def row(i,date,prefix):return{'id':f'{prefix}-{i}','clientId':f'{prefix}-client-{i}','createdAt':date.isoformat(),'clientUpdatedAt':date.isoformat(),'zone':'chest','sensations':['tension'],'note':f'Учебная запись {prefix} {i}','tension':i%10+1,'anxiety':3,'energy':6,'safety':7,'bodyContact':5,'dayKey':None}
 rows=[row(i,old+timedelta(days=i%35,seconds=i),'old')for i in range(205)]
 rows +=[row(i,datetime(2026,10,1,12,tzinfo=timezone.utc)+timedelta(days=i),'current')for i in range(10)]
 rows +=[row(i,datetime(2020,1,1,12,tzinfo=timezone.utc)-timedelta(days=i),'outside')for i in range(1000)]
 rows +=[{**row(i,old+timedelta(days=i),'other'),'streamId':'another-stream'}for i in range(2)]
 f.diary={'preview':{r['id']:dict(r)for r in rows}};f.checkinRows=[dict(r)for r in rows];f.allRows=rows;parent=server.RequestHandlerClass
 class Handler(parent):
  def api(self,method):
   u=urlsplit(self.path);kind=u.path.rsplit('/',1)[-1]
   if method=='GET'and u.path in ['/api/diary','/api/checkins']:
    q=parse_qs(u.query);limit=int(q.get('limit',[20])[0]);offset=int(q.get('offset',[0])[0]);start=q.get('from',[None])[0];end=q.get('to',[None])[0];f.periodReads.append({'kind':kind,'limit':limit,'offset':offset,'from':start,'to':end})
    data=sorted((list(f.diary['preview'].values())if kind=='diary'else f.checkinRows),key=lambda r:(r.get('createdAt')or r.get('date'),r['id']),reverse=True)
    if start:data=[r for r in data if datetime.fromisoformat(start.replace('Z','+00:00'))<=datetime.fromisoformat((r.get('createdAt')or r['date']).replace('Z','+00:00'))<=datetime.fromisoformat(end.replace('Z','+00:00'))]
    data=data[offset:offset+limit]
    if start and kind=='diary'and offset==0 and start.startswith('2025-06-09')and mode in ['loading','switch','save']:f.started.set();f.gate.wait(12)
    if start and kind==f.failKind and offset==(90 if kind=='diary'else 200):return self.send_json({'error':'Учебный отказ второй страницы'},503)
    return self.send_json(data)
   return super().api(method)
 server.RequestHandlerClass=Handler;return f,server
def period_reads(f):return[r for r in f.periodReads if r['from']]
def full_reads(f):return[r for r in f.periodReads if not r['from']and r['limit']in[90,200]]
def wait(page,expression):page.wait_for_function(expression,timeout=15000)
def select(page,streams=STREAMS,selected='old'):
 page.evaluate('data=>{programAccess={streams:data.streams,ai:{canWrite:false}};selectedProgramId=data.selected}',{'streams':streams,'selected':selected})
def ready(page):wait(page,'Object.values(Storage.getPathPeriodStatus(pathPeriodScope())).every(s=>s==="loaded")')
def compare(page,f,cases):
 # Compare the rendered view and all five pure chart models with the same view
 # calculated from a fully hydrated archive; this is the previous calculation.
 before=page.locator('.path-analysis').inner_text();models=page.evaluate('CHECKIN_SCALES.map(s=>PathDynamicsModel.build(selectedCheckins(),s.key,streamPeriod(),programNow(),selectedProgramId))')
 page.evaluate('rows=>{Storage._mergeDiaryHistory(rows,Storage._userId);Storage._mergeCheckinHistory(rows,Storage._userId);renderMyPathTab()}',f.allRows)
 assert page.locator('.path-analysis').inner_text()==before
 assert page.evaluate('CHECKIN_SCALES.map(s=>PathDynamicsModel.build(selectedCheckins(),s.key,streamPeriod(),programNow(),selectedProgramId))')==models
 cases.append('map/summary and all five chart models equal full-archive calculation')
def run(engine,width,mode):
 f,server=serve(mode);cases=[];errors=[]
 try:
  with sync_playwright()as p:
   browser=getattr(p,engine).launch();page=browser.new_page(viewport={'width':width,'height':844});page.add_init_script(m.CLOCK);page.route('https://**/*',lambda r:r.abort());page.on('pageerror',lambda e:errors.append(str(e)))
   page.goto(f'http://127.0.0.1:{server.server_port}/app/index.html?owner=preview');expect(page.locator('#screen-home')).to_have_class('screen screen--active');page.evaluate('LaunchSplash.cancel()');wait(page,'Storage._historyInitializing.size===0');assert len(f.periodReads)==2
   select(page,[]if mode=='none'else STREAMS,None if mode=='none'else'current'if mode=='current'else'old');page.locator('.nav-btn[data-tab=diag]').click()
   if mode=='none':
    expect(page.locator('.path-analysis')).to_contain_text('выберите доступный поток');assert len(f.periodReads)==2;cases.append('no selected stream means no archive or period reads')
   else:
    if mode in ['loading','switch','save']:
     assert f.started.wait(2);expect(page.locator('.path-analysis')).to_contain_text('Загружаем наблюдения');cases.append('incomplete period never appears as complete summary')
     if mode=='switch':
      page.locator('#path-stream-select').select_option('current');ready(page);expect(page.locator('.pd-period')).to_contain_text('Учебный текущий поток');f.gate.set();wait(page,'Storage._pathPeriodLoading.size===0');assert page.evaluate('Storage.getDiaryEntries().some(r=>r.id==="old-0")')is False;expect(page.locator('.pd-period')).to_contain_text('Учебный текущий поток');page.locator('#path-stream-select').select_option('old');ready(page);cases.append('late old-stream read ignored; revisiting loads it correctly')
     elif mode=='save':
      page.evaluate("Storage._writeDiary([...Storage.getDiaryEntries(),{id:'local-ACK',clientId:'local-ACK',zone:'chest',sensations:['tension'],note:'Учебный новый ACK',date:'2025-06-12T12:00:00Z',syncStatus:'synced'}]);");f.gate.set();ready(page);assert page.evaluate('Storage.getDiaryEntries().some(r=>r.id==="local-ACK")');cases.append('new ACK survives in-flight period read')
     else:f.gate.set();ready(page)
    elif mode in ['failure','checkin-failure']:
     wait(page,'Object.values(Storage.getPathPeriodStatus(pathPeriodScope())).includes("failed")');kind=f.failKind;other='checkins'if kind=='diary'else'diary';wait(page,f'Storage.getPathPeriodStatus(pathPeriodScope()).{other}==="loaded"');before=len([r for r in period_reads(f)if r['kind']==other]);f.failKind=None
     if kind=='diary':expect(page.locator('.path-analysis')).to_contain_text('Не удалось обновить');page.locator('#history-load-warning-path button').click()
     else:expect(page.locator('#pd-panel')).to_contain_text('Не удалось');page.locator('[data-pd-retry]').click()
     ready(page);assert len([r for r in period_reads(f)if r['kind']==other])==before;cases.append('second page error and retry read only failed resource')
    else:ready(page)
    assert not full_reads(f);cases.append('Path uses bounded period reads and zero full-archive GETs')
    assert page.evaluate('Storage.getHistoryLoadStatus().diary')=='partial';assert page.evaluate('Storage.getHistoryLoadStatus().checkins')=='partial';cases.append('period completeness leaves global archives partial')
    if mode not in ['save','switch']:compare(page,f,cases)
    if mode=='overlap':page.locator('#path-stream-select').select_option('overlap');ready(page);compare(page,f,cases);cases.append('overlapping stream uses its own period and streamId filter')
    if mode=='full':
     page.evaluate('Storage.ensureDiaryHistory();Storage.ensureCheckinHistory()');wait(page,'Storage.getHistoryLoadStatus().diary==="loaded"&&Storage.getHistoryLoadStatus().checkins==="loaded"');assert page.evaluate('Storage.getDiaryEntries().length')==1217;assert page.evaluate('Storage.getCheckins().length')==1217;cases.append('separate full history still restores all1217 own rows')
    before=len(f.periodReads);page.evaluate("switchTab('main');switchTab('diag')");assert len(f.periodReads)==before;cases.append('reopening completed selected period makes no GET')
   assert not errors,errors;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');cases.append('no page errors or horizontal overflow');page.screenshot(path=str(OUT/f'{engine}-{width}-{mode}.png'));browser.close()
 finally:f.gate.set();server.shutdown();server.server_close()
 return{'engine':engine,'width':width,'mode':mode,'passed':True,'cases':cases,'reads':f.periodReads,'realWrites':0}
if __name__=='__main__':
 out=OUT/('smoke-ui.json'if'--smoke'in sys.argv else'ui-results.json');runs=json.loads(out.read_text(encoding='utf-8'))['runs']if'--retry'in sys.argv and out.exists()else[];viewports=[('chromium',390)]if'--smoke'in sys.argv else[('chromium',320),('chromium',390),('chromium',1440),('webkit',390)]
 hashes={f:hashlib.sha256((ROOT/f).read_bytes()).hexdigest()for f in['app/js/app.js','app/js/api.js','app/js/storage.js','backend/src/routes/checkins.js']}
 if runs:assert json.loads(out.read_text(encoding='utf-8'))['sourceHashes']==hashes
 for engine,width in viewports:
  for mode in ['normal','current','none','loading','failure','checkin-failure','switch','save','overlap','full']:
   if any(r['engine']==engine and r['width']==width and r['mode']==mode for r in runs):continue
   print('Checking',engine,width,mode,flush=True);runs.append(run(engine,width,mode));out.write_text(json.dumps({'passed':len(runs)==len(viewports)*10,'runs':runs,'sourceHashes':hashes},ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps({'passed':True,'cases':sum(len(r['cases'])for r in runs)}))
