from pathlib import Path
from datetime import datetime,timedelta,timezone
import importlib.util,json,threading,hashlib,sys,urllib.request,urllib.error,urllib.parse
from urllib.parse import urlsplit,parse_qs
from playwright.sync_api import sync_playwright,expect
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent
spec=importlib.util.spec_from_file_location('cache',R/'audit/diary-cache-JAPP131/test-ui.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
wait=m.wait;raw=m.raw;boot=m.boot;FILL=m.FILL

def serve():
 f,server=m.serve('normal');f.offlineCheckins=False;f.failCheckins=True;f.holdCheckin=False;f.checkinStarted=threading.Event();f.checkinGate=threading.Event();f.posts=[];parent=server.RequestHandlerClass
 f.checkinRows=[]
 for i in range(1000):
  date=(datetime(2026,10,19,12,tzinfo=timezone.utc)-timedelta(days=i)).isoformat()
  f.checkinRows.append({'id':f'check-{i}','createdAt':date,'clientUpdatedAt':date,'dayKey':date[:10],'tension':2,'anxiety':3,'energy':6,'safety':7,'bodyContact':5,'bodyScore':5,'mood':None,'tensionZone':None,'note':f'Учебная отметка {i}. '+'я'*6000})
 class Handler(parent):
  def api(self,method):
   u=urlsplit(self.path);q=parse_qs(u.query)
   if method=='GET'and u.path in ['/api/checkins','/api/checkins/today']:
    if f.offlineCheckins:return self.send_json({'error':'Учебная история недоступна'},503)
    if u.path.endswith('/today'):return self.send_json(f.checkinRows[0])
    start=q.get('from',[None])[0];end=q.get('to',[None])[0];rows=f.checkinRows
    if start:rows=[r for r in rows if start<=r['createdAt']<=end]
    offset=int(q.get('offset',[0])[0]);limit=int(q.get('limit',[30])[0]);return self.send_json(rows[offset:offset+limit])
   if method=='POST'and u.path=='/api/checkins':
    data=json.loads(self.rfile.read(int(self.headers.get('Content-Length',0)))or'{}');f.posts.append(data)
    if f.failCheckins:return self.send_json({'error':'Учебная отправка недоступна'},503)
    if f.holdCheckin:f.checkinStarted.set();f.checkinGate.wait(15)
    day=data['createdAt'][:10];row={**data,'id':'saved-'+day,'dayKey':day,'bodyScore':5};f.checkinRows=[row]+[r for r in f.checkinRows if r['dayKey']!=day];return self.send_json(row)
   return super().api(method)
 server.RequestHandlerClass=Handler;return f,server

def form(page,text):
 page.evaluate('renderCheckinScales();renderCheckinSyncStatus();goTo("checkin")');expect(page.locator('#screen-checkin')).to_have_class('screen screen--active');page.locator('#checkin-note').fill(text);page.locator('#slider-tension').fill('9');page.locator('#slider-tension').dispatch_event('input')

def run(engine,width,mode,base=None):
 f,server=serve();cases=[];errors=[];metrics={}
 try:
  with sync_playwright()as p:
   browser=getattr(p,engine).launch(args=['--disable-http2']if base=='https://app.telo-pomnit.ru/'else[]);page=browser.new_page(viewport={'width':width,'height':844});page.add_init_script(m.m.CLOCK+('window.TelegramWebviewProxy={postEvent:()=>{}};'if base else''));page.on('pageerror',lambda e:errors.append(str(e)))
   if base:
    def route(r):
     u=urlsplit(r.request.url)
     if u.path.startswith('/api/'):
      req=urllib.request.Request(f'http://127.0.0.1:{server.server_port}'+u.path+('?'+u.query if u.query else ''),data=(r.request.post_data or '').encode()if r.request.method in['POST','PUT']else None,headers={k:v for k,v in r.request.headers.items()if k.lower()in['authorization','content-type']},method=r.request.method)
      try:response=urllib.request.urlopen(req,timeout=20)
      except urllib.error.HTTPError as e:response=e
      with response:r.fulfill(status=response.status,content_type='application/json',body=response.read())
     elif u.hostname==urlsplit(base).hostname:r.continue_()
     else:r.abort()
    page.route('**/*',route)
   else:page.route('https://**/*',lambda r:r.abort())
   if mode=='blocked':page.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new DOMException('fixture','SecurityError')}})")
   url=base+'index.html?verify=JAPP134#tgWebAppData=synthetic&tgWebAppPlatform=ios&tgWebAppVersion=8.0'if base else f'http://127.0.0.1:{server.server_port}/app/index.html?owner=preview';boot(page,url)
   KEY=page.evaluate("Storage.key('checkins_v2')");DRAFT=page.evaluate("Storage.key('form_draft_v1:checkin')");today='2026-10-19';text='Новая отметка сегодня'
   if mode=='blocked':
    form(page,text);page.locator('#checkin-save-btn').click();wait(page,'Storage.getCheckins().some(r=>r.note==="'+text+'"&&r.syncStatus==="memory-only")');expect(page.locator('#checkin-sync-status')).to_contain_text('только в открытом приложении');f.failCheckins=False;page.locator('#checkin-sync-retry').click();wait(page,'Storage.getCheckins().some(r=>r.note==="'+text+'"&&r.syncStatus==="synced")');expect(page.locator('#checkin-sync-status')).to_contain_text('Все пять оценок сохранены на сервере');cases+=['blocked store still opens form with explicit memory-only warning','server ACK preserves all five answers without local durability claim']
   else:
    page.evaluate('Storage.ensureCheckinHistory()');wait(page,'Storage.getHistoryLoadStatus().checkins==="loaded"');assert page.evaluate('Storage.getCheckins().length')==1000;stored=json.loads(raw(page,KEY));assert len(stored)>1;history=[r for r in stored if r['dayKey']!=today];assert len(history)<=201;assert len(json.dumps(history,ensure_ascii=False,separators=(',',':')))*2<=512*1024;assert all(r.get('_tpCheckinCacheAck',{}).get('v')==1 for r in stored);metrics['retainedHistorical']=len(history);cases+=['full1000 rows retained in memory while confirmed disk history is bounded','today remains outside history budget with five original scale values']
    if mode=='bounded':
     f.offlineCheckins=True;boot(page,url);assert page.evaluate('Storage.getCheckins().length')==len(stored);assert page.evaluate('Storage.getCheckins().find(r=>r.dayKey==="2026-10-19").energy')==6;page.locator('#main-state-btn').click();expect(page.locator('#slider-tension')).to_have_value('2');page.locator('#checkin-history-btn').click();wait(page,'Storage.getHistoryLoadStatus().checkins==="failed"');expect(page.locator('#checkin-history-list')).to_contain_text('может быть неполной');assert page.locator('.checkin-comparison').count()==0;expect(page.locator('.checkin-card')).to_have_count(len(stored));cases+=['real document reload and unavailable history restore today and bounded copies','partial local history is labelled and cannot produce a full comparison']
    else:
     if mode in['recovery','late-ack']:page.evaluate('Storage._writeCheckins(Storage.getCheckins().map(({_tpCheckinCacheAck,...r})=>r))')
     text='Сохранённый длинный черновик. '+'н'*16000 if mode in['recovery','late-ack']else text
     form(page,text);draftBefore=raw(page,DRAFT);assert json.loads(draftBefore)['tension']==9
     protected={'tp_user:other:checkins_v2':'[{"note":"Другой владелец"}]','tp_checkins':'[{"bodyScore":4,"note":"Старый оригинал"}]',page.evaluate("Storage.key('form_draft_v1:body-observation-v1')"):'{"note":"Телесный черновик"}',page.evaluate("Storage.key('ai_drafts_v1')"):'{"text":"AI черновик"}'}
     for k,v in protected.items():page.evaluate('([k,v])=>localStorage.setItem(k,v)',[k,v])
     metrics['quota']=page.evaluate(FILL,'japp133-fill');before=raw(page,KEY);page.locator('#checkin-save-btn').click();wait(page,'!document.getElementById("checkin-save-btn").disabled')
     if mode=='quota':
      wait(page,'Storage.getCheckins().some(r=>r.note==="'+text+'"&&r.syncStatus==="pending")');assert json.loads(raw(page,KEY))[0]['tension']==9;assert len(raw(page,KEY))<len(before);cases.append('actual QuotaExceeded evicts only confirmed older copies to preserve today edit')
      form(page,'Другой черновик после сохранения');assert raw(page,DRAFT);f.offlineCheckins=True;page.evaluate(FILL,'japp133-fill-2');boot(page,url);assert page.evaluate('Storage.getCheckins().find(r=>r.dayKey==="2026-10-19").note')=='Новая отметка сегодня';page.locator('#main-state-btn').click();expect(page.locator('#checkin-note')).to_have_value('Другой черновик после сохранения');expect(page.locator('#slider-tension')).to_have_value('9');cases+=['full-store reload reads pending latest today and separate unsent form draft','write-probe failure cannot hide previously saved marks or drafts']
     else:
      wait(page,'Storage.getCheckins().some(r=>r.syncStatus==="memory-only")');assert raw(page,KEY)==before;assert raw(page,DRAFT)==draftBefore;expect(page.locator('#checkin-sync-status')).to_contain_text('только в открытом приложении');cases+=['unwritable protected history preserves prior durable snapshot and existing draft','memory-only save never displays a durable success']
      form(page,text);f.failCheckins=False;f.holdCheckin=mode=='late-ack';page.locator('#checkin-save-btn').click()
      if mode=='late-ack':
       assert f.checkinStarted.wait(3);form(page,'Более новый черновик');newDraft=raw(page,DRAFT);f.checkinGate.set();wait(page,'!document.getElementById("checkin-save-btn").disabled');assert raw(page,DRAFT)==newDraft;expect(page.locator('#checkin-note')).to_have_value('Более новый черновик');cases.append('late previous ACK cannot clear a newer checkin draft')
      else:
       wait(page,'!document.getElementById("checkin-save-btn").disabled');assert json.loads(raw(page,DRAFT))is None;expect(page.locator('#checkin-sync-status')).to_contain_text('Все пять оценок сохранены на сервере');cases.append('matching confirmed ACK clears only its submitted recovery draft')
     for k,v in protected.items():assert raw(page,k)==v
     cases.append('other owner, legacy original, body draft and AI draft remain byte-identical')
   page.evaluate('Promise.all(document.getAnimations().filter(a=>a.playState==="running"&&Number.isFinite(a.effect.getComputedTiming().endTime)).map(a=>a.finished.catch(()=>{})))')
   assert not errors,errors;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');cases.append('no page errors or horizontal overflow');page.screenshot(path=str(H/f'{engine}-{width}-{mode}.png'));browser.close()
 finally:f.checkinGate.set();f.postGate.set();f.gate.set();server.shutdown();server.server_close()
 return{'engine':engine,'width':width,'mode':mode,'base':base,'passed':True,'cases':cases,'metrics':metrics,'realWrites':0}

if __name__=='__main__':
 out=H/('smoke-ui.json'if'--smoke'in sys.argv else'ui-results.json');modes=['bounded','quota','recovery','late-ack','blocked'];viewports=[('chromium',390)]if'--smoke'in sys.argv else[('chromium',320),('chromium',390),('chromium',1440),('webkit',390)];hashes={f:hashlib.sha256((R/f).read_bytes()).hexdigest()for f in['app/js/storage.js','app/js/app.js']};runs=json.loads(out.read_text(encoding='utf-8'))['runs']if'--retry'in sys.argv and out.exists()else[]
 if runs:assert json.loads(out.read_text(encoding='utf-8'))['sourceHashes']==hashes
 for engine,width in viewports:
  for mode in modes:
   if any(r['engine']==engine and r['width']==width and r['mode']==mode for r in runs):continue
   print('Checking',engine,width,mode,flush=True);runs.append(run(engine,width,mode));out.write_text(json.dumps({'passed':len(runs)==len(modes)*len(viewports),'runs':runs,'sourceHashes':hashes},ensure_ascii=False,indent=2),encoding='utf-8')
 print('PASS',len(runs),'runs',sum(len(r['cases'])for r in runs),'checks')
