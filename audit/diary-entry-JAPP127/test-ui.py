from pathlib import Path
import importlib.util,json,threading,hashlib,sys
from datetime import datetime,timedelta,timezone
from urllib.parse import urlsplit,parse_qs
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).parent
spec=importlib.util.spec_from_file_location('base',ROOT/'audit/deferred-history-JAPP112/test-ui.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

def serve(mode):
 f,server=m.serve();f.diaryReads=[];f.dayReads=0;f.searches=[];f.stars=set();f.gate=threading.Event();f.started=threading.Event();f.dayFail=90 if mode=='failure' else None;f.indexFail=mode=='index'
 count=95 if mode in ['today','failure','save','rollover'] else 0
 rows=[{'id':f't-{i}','clientId':f'tc-{i}','createdAt':(datetime(2026,10,19,12,tzinfo=timezone.utc)-timedelta(seconds=i)).isoformat(),'zone':'chest','sensations':['tension'],'note':f'Сегодняшняя запись {i}'}for i in range(count)]
 rows += [{'id':f'p-{i}','clientId':f'pc-{i}','createdAt':(datetime(2026,10,18,12,tzinfo=timezone.utc)-timedelta(days=i)).isoformat(),'zone':'chest','sensations':['tension'],'note':f'Учебная запись {i}'}for i in range(1000)]
 f.diary={'preview':{r['id']:r for r in rows}};parent=server.RequestHandlerClass
 class Handler(parent):
  def do_PUT(self):self.api('PUT')
  def api(self,method):
   u=urlsplit(self.path);path=u.path
   entries=sorted(f.diary.get('preview',{}).values(),key=lambda r:r.get('createdAt')or r.get('date'),reverse=True)
   def present(r):
    date=r.get('createdAt')or r['date'];return {'id':r['id'],'source':'body','kind':'body','title':'Наблюдение за телом','text':r.get('note',''),'day':date[:10],'date':date,'important':r['id']in f.stars,'zoneLabel':'Грудная клетка','sensations':['Напряжение']}
   if method=='GET' and path=='/api/diary/days':
    f.dayReads+=1
    if f.indexFail:return self.send_json({'error':'Учебный отказ'},503)
    return self.send_json({'timeZone':'Europe/Moscow','days':sorted({(datetime.fromisoformat((r.get('createdAt')or r['date']).replace('Z','+00:00'))+timedelta(hours=3)).date().isoformat()for r in entries})})
   if method=='GET' and path=='/api/diary':
    q=parse_qs(u.query);limit=int(q.get('limit',[20])[0]);offset=int(q.get('offset',[0])[0]);start=q.get('from',[None])[0];end=q.get('to',[None])[0];f.diaryReads.append({'limit':limit,'offset':offset,'from':start,'to':end})
    if start:entries=[r for r in entries if datetime.fromisoformat(start.replace('Z','+00:00'))<=datetime.fromisoformat((r.get('createdAt')or r['date']).replace('Z','+00:00'))<=datetime.fromisoformat(end.replace('Z','+00:00'))]
    data=entries[offset:offset+limit]
    if (start and offset==0 and mode in ['today','save'])or(not start and limit==90 and offset==0 and mode=='path'):f.started.set();f.gate.wait(12)
    if start and f.dayFail==offset:return self.send_json({'error':'Учебный отказ страницы'},503)
    return self.send_json(data)
   if method=='POST' and path=='/api/diary-history/search':
    data=json.loads(self.rfile.read(int(self.headers.get('Content-Length',0)))or'{}');f.searches.append(data);items=[present(r)for r in entries if data.get('query','').lower()in r.get('note','').lower()and(not data.get('important')or r['id']in f.stars)];limit=data.get('limit',30);offset=data.get('offset',0);return self.send_json({'entries':items[offset:offset+limit],'total':len(items),'hasMore':offset+limit<len(items)})
   if method=='PUT' and path.endswith('/important'):
    data=json.loads(self.rfile.read(int(self.headers.get('Content-Length',0)))or'{}');rid=path.split('/')[-2]
    if data.get('important'):f.stars.add(rid)
    else:f.stars.discard(rid)
    return self.send_json({'source':'body','id':rid,'important':bool(data.get('important'))})
   if method=='GET' and path.startswith('/api/diary-history/body/'):
    row=f.diary['preview'].get(path.split('/')[-1]);return self.send_json(present(row))if row else self.send_json({'error':'Нет записи'},404)
   return super().api(method)
 server.RequestHandlerClass=Handler;return f,server

CLOCK="""window.__clock={time:Date.parse('2026-10-19T12:00:00Z')};const RealDate=Date;window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[window.__clock.time]))}static now(){return window.__clock.time}};const realTimeout=window.setTimeout;window.setTimeout=function(fn,ms,...args){if(typeof fn==='function'&&fn.toString().includes('scheduleDiaryDayRefresh'))window.__midnight={fn,ms};return realTimeout(fn,ms,...args)};"""
def wait(page,condition):page.wait_for_function(condition,timeout=15000)
def full_reads(f):return[r for r in f.diaryReads if r['limit']==90 and not r['from']]

def run(engine,width,mode):
 f,server=serve(mode);cases=[];errors=[]
 try:
  with sync_playwright()as p:
   browser=getattr(p,engine).launch();page=browser.new_page(viewport={'width':width,'height':844});page.add_init_script(CLOCK);page.route('https://**/*',lambda r:r.abort());page.on('pageerror',lambda e:errors.append(str(e)));page.goto(f'http://127.0.0.1:{server.server_port}/app/index.html?owner=preview');expect(page.locator('#screen-home')).to_have_class('screen screen--active');page.evaluate('LaunchSplash.cancel()');wait(page,'Storage._historyInitializing.size===0');page.locator('.nav-btn[data-tab=diary]').click()
   if mode=='index':
    wait(page,'Storage.getDiaryTodayStatus()==="failed"');expect(page.locator('#history-load-warning-diary')).to_be_visible();assert page.locator('#streak-num').text_content()=='—';f.indexFail=False;page.locator('#history-load-warning-diary button').click();wait(page,'Storage.getDiaryTodayStatus()==="loaded"');assert not full_reads(f);cases+=['index error is not empty history or false streak','retry uses recent rows/index without full archive']
   elif mode in ['today','save']:
    assert f.started.wait(2);expect(page.locator('#diary-history-loading')).to_be_visible();expect(page.locator('.today-entry-row')).to_have_count(91);cases.append('partial today has visible loading and91 cached rows')
    if mode=='save':
     page.evaluate('startDiaryEntry();document.querySelector(".body-zone-disclosure").open=true');page.locator('#body-zone-list [data-zone=chest]').click();page.locator('#zone-continue-btn').click();page.locator('#sensations-grid [data-sensation=tension]').click();page.locator('#sensations-continue-btn').click();page.locator('#note-textarea').fill('Учебная новая запись во время загрузки');page.locator('#note-save-btn').click();wait(page,'Storage.getDiaryEntries().some(r=>r.note==="Учебная новая запись во время загрузки"&&r.syncStatus==="synced")');cases.append('new note ACK remains during in-flight day read')
    f.gate.set();wait(page,'Storage.getDiaryTodayStatus()==="loaded"')
    if mode=='save':page.evaluate("goTo('home');switchTab('diary')")
    expect(page.locator('.today-entry-row')).to_have_count(96 if mode=='save' else 95);assert len([r for r in f.diaryReads if r['from']])==2;assert not full_reads(f);cases+=['all today rows loaded with only day-filtered requests','global history remains partial'];assert page.evaluate('Storage.getHistoryLoadStatus().diary')=='partial'
   elif mode=='failure':
    wait(page,'Storage.getDiaryTodayStatus()==="failed"');expect(page.locator('.today-entry-row')).to_have_count(91);expect(page.locator('#history-load-warning-diary')).to_be_visible();assert not full_reads(f);f.dayFail=None;page.locator('#history-load-warning-diary button').click();wait(page,'Storage.getDiaryTodayStatus()==="loaded"');expect(page.locator('.today-entry-row')).to_have_count(95);cases+=['day page failure retains cache and visible retry','retry restores all95 today rows without archive']
   else:
    wait(page,'Storage.getDiaryTodayStatus()==="loaded"');assert not full_reads(f);expect(page.locator('#diary-history-loading')).to_have_count(0);cases.append('Diary entry avoids full archive and has no endless partial notice')
    if mode=='rollover':
     expect(page.locator('.today-entry-row')).to_have_count(95);assert page.evaluate('window.__midnight.ms>0&&window.__midnight.ms<=86400050');page.evaluate("window.__clock.time=Date.parse('2026-10-19T21:00:01Z');window.__midnight.fn()");wait(page,'Storage.getDiaryTodayStatus()==="loaded"&&Storage.getTodayEntries().length===0');expect(page.locator('.today-entry-row')).to_have_count(0);expect(page.locator('#today-card')).to_contain_text('Выберите область');assert not full_reads(f);cases.append('scheduled Moscow midnight refreshes today without archive')
    if mode=='path':
     page.evaluate("programAccess={streams:[{id:'old',name:'Учебный завершённый поток',startDate:'2025-06-10T12:00:00Z',endDate:'2025-07-14T12:00:00Z',phase:'completed',canAttend:false}],ai:{canWrite:false}};selectedProgramId='old';");page.locator('.nav-btn[data-tab=diag]').click();assert f.started.wait(2);expect(page.locator('.path-analysis')).to_contain_text('Загружаем наблюдения');f.gate.set();wait(page,'Storage.getHistoryLoadStatus().diary==="loaded"');assert page.evaluate('Storage.getDiaryEntries().length')==1000;expect(page.locator('.path-analysis .stream-summary')).to_contain_text('35');cases.append('My Path still loads full archive and all35 old-stream rows')
    if mode=='search':
     page.locator('#diary-history-btn').click();expect(page.locator('.hm-card').first).to_be_visible();page.locator('#hm-search').fill('Учебная запись 900');expect(page.locator('.hm-card')).to_have_count(1);expect(page.locator('.hm-card-text')).to_have_text('Учебная запись 900');assert page.evaluate('Storage.getDiaryEntries().length')==91;page.locator('.hm-star').click();expect(page.locator('.hm-star')).to_have_attribute('aria-pressed','true');page.locator('#hm-important').click();expect(page.locator('.hm-card')).to_have_count(1);page.locator('.hm-open').click();expect(page.locator('#screen-history-record')).to_have_class('screen screen--active');expect(page.locator('#screen-history-record')).to_contain_text('Учебная запись 900');assert not full_reads(f);cases+=['server search finds record900 outside91 cached rows','Important toggle and record detail work without full archive']
   if mode!='search':
    before=len(f.diaryReads);page.evaluate("goTo('home');switchTab('main');switchTab('diary')");assert len(f.diaryReads)==before;cases.append('reopening verified Diary does not refetch')
   assert not errors,errors;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');cases.append('no page errors or horizontal overflow');page.screenshot(path=str(OUT/f'{engine}-{width}-{mode}.png'));browser.close()
 finally:f.gate.set();server.shutdown();server.server_close()
 return{'engine':engine,'width':width,'mode':mode,'passed':True,'cases':cases,'diaryReads':f.diaryReads,'realWrites':0}

if __name__=='__main__':
 runs=[];viewports=[('chromium',390)]if'--smoke'in sys.argv else[('chromium',320),('chromium',390),('chromium',1440),('webkit',390)]
 for engine,width in viewports:
  for mode in ['normal','today','failure','index','save','rollover','path','search']:print('Checking',engine,width,mode,flush=True);runs.append(run(engine,width,mode))
 (OUT/('smoke-ui.json'if'--smoke'in sys.argv else'ui-results.json')).write_text(json.dumps({'passed':True,'runs':runs,'sourceHashes':{f:hashlib.sha256((ROOT/f).read_bytes()).hexdigest()for f in['app/js/app.js','app/js/api.js','app/js/storage.js']}},ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'passed':True,'cases':sum(len(r['cases'])for r in runs)}))
