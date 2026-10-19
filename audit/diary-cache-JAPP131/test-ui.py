from pathlib import Path
import importlib.util,json,threading,hashlib,sys,urllib.request,urllib.error,urllib.parse
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright,expect
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent
spec=importlib.util.spec_from_file_location('day',R/'audit/diary-entry-JAPP127/test-ui.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
DIARY='tp_user:preview:diary_v2';DRAFT='tp_user:preview:form_draft_v1:body-observation-v1';FILLER='japp131-quota-fixture'
def serve(mode):
 f,server=m.serve('normal');f.offline=False;f.failPosts=True;f.holdPost=False;f.postStarted=threading.Event();f.postGate=threading.Event();f.postIDs=[];f.postFailures=0;parent=server.RequestHandlerClass
 for row in f.diary['preview'].values():row['note']='Учебная длинная заметка. '+('я'*5975)
 class Handler(parent):
  def api(self,method):
   path=urlsplit(self.path).path
   if method=='POST'and path=='/api/diary':
    if f.failPosts:
     data=json.loads(self.rfile.read(int(self.headers.get('Content-Length',0)))or'{}');f.postIDs.append(data['clientId']);f.postFailures+=1;return self.send_json({'error':'Учебный offline'},503)
    if f.holdPost:f.postStarted.set();f.postGate.wait(12)
   if f.offline and ((method=='GET'and path in ['/api/diary','/api/diary/days'])or(method=='POST'and path=='/api/diary-history/search')):
    if method=='POST':self.rfile.read(int(self.headers.get('Content-Length',0)))
    return self.send_json({'error':'Учебный offline'},503)
   return super().api(method)
 server.RequestHandlerClass=Handler;return f,server
def wait(page,condition):page.wait_for_function(condition,timeout=20000)
def raw(page,key):return page.evaluate('key=>localStorage.getItem(key)',key)
def boot(page,url):
 if page.url.split('#')[0]==url.split('#')[0]:page.reload(wait_until='domcontentloaded')
 else:page.goto(url,wait_until='domcontentloaded')
 expect(page.locator('#screen-home')).to_have_class('screen screen--active');page.evaluate('LaunchSplash.cancel()');wait(page,'Storage._historyInitializing.size===0')
def begin(page,text=None):
 page.evaluate('startDiaryEntry();document.querySelector(".body-zone-disclosure").open=true');page.locator('#body-zone-list [data-zone=chest]').click();page.locator('#zone-continue-btn').click();page.locator('#sensations-grid [data-sensation=tension]').click();page.locator('#sensations-continue-btn').click()
 if text is not None:page.locator('#note-textarea').fill(text)
def resume(page,text):
 page.evaluate('startDiaryEntry()');assert page.evaluate('draft.zone')=='chest';page.locator('#zone-continue-btn').click();expect(page.locator('#sensations-grid [data-sensation=tension]')).to_have_attribute('aria-pressed','true');page.locator('#sensations-continue-btn').click();expect(page.locator('#note-textarea')).to_have_value(text)
FILL="""key=>{let text='',step=262144,last='';while(step){try{const next=text+'q'.repeat(step);localStorage.setItem(key,next);text=next;}catch(e){last=e.name;step=Math.floor(step/2)}}return{filledCodeUnits:text.length,lastError:last,utf16Bytes:Object.keys(localStorage).reduce((n,k)=>n+2*(k.length+localStorage.getItem(k).length),0)}}"""
def run(engine,width,mode,base=None):
 f,server=serve(mode);cases=[];errors=[];metrics={}
 try:
  with sync_playwright()as p:
   browser=getattr(p,engine).launch(args=['--disable-http2']if base=='https://app.telo-pomnit.ru/'else[]);page=browser.new_page(viewport={'width':width,'height':844});page.add_init_script(m.CLOCK+('window.TelegramWebviewProxy={postEvent:()=>{}};'if base else''));page.on('pageerror',lambda e:errors.append(str(e)))
   if base:
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
   else:page.route('https://**/*',lambda r:r.abort())
   if mode=='blocked':page.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new DOMException('fixture','SecurityError')}})")
   url=base+'index.html?verify=JAPP132#tgWebAppData=synthetic&tgWebAppPlatform=ios&tgWebAppVersion=8.0'if base else f'http://127.0.0.1:{server.server_port}/app/index.html?owner=preview';boot(page,url)
   DIARY=page.evaluate("Storage.key('diary_v2')");DRAFT=page.evaluate("Storage.key('form_draft_v1:body-observation-v1')")
   if mode=='bounded':
    page.evaluate('Storage.ensureDiaryHistory()');wait(page,'Storage.getHistoryLoadStatus().diary==="loaded"');assert page.evaluate('Storage.getDiaryEntries().length')==1000;stored=json.loads(raw(page,DIARY));assert 0<len(stored)<=90;assert len(raw(page,DIARY))*2<=512*1024;metrics['retainedConfirmed']=len(stored);cases+=['full1000 rows remain in memory while durable confirmed cache is bounded','valid server receipts survive JSON roundtrip']
    f.offline=True;boot(page,url);assert page.evaluate('Storage.getDiaryEntries().length')==len(stored);assert page.evaluate('Storage.getHistoryLoadStatus().diary')=='failed';page.locator('.nav-btn[data-tab=diary]').click();page.locator('#diary-history-btn').click();expect(page.get_by_role('button',name='Открыть записи на устройстве')).to_be_visible();page.get_by_role('button',name='Открыть записи на устройстве').click();expect(page.locator('.hm-local-caption')).to_contain_text('может быть неполной');expect(page.locator('#history-list .entry-card')).to_have_count(len(stored));cases+=['offline reads restored bounded cache without claiming complete history','local history caption explains full history needs connection']
   elif mode=='quota':
    begin(page,'Черновик до заполнения памяти');draft=raw(page,DRAFT);page.evaluate("goTo('home',true)");page.evaluate("localStorage.setItem('tp_user:other:diary_v2','ownerB');localStorage.setItem('tp_diary_entries','unowned legacy')");metrics['quota']=page.evaluate(FILL,FILLER);assert metrics['quota']['lastError']=='QuotaExceededError';before=len(json.loads(raw(page,DIARY)));page.evaluate("Storage.saveDiaryEntry({zone:'chest',sensations:['tension'],note:'Новая запись'.repeat(1500)})");wait(page,'Storage.getDiaryEntries().some(r=>r.note.startsWith("Новая запись")&&r.syncError)');stored=json.loads(raw(page,DIARY));assert any(r['note'].startswith('Новая запись')for r in stored);assert len([r for r in stored if r.get('_tpDiaryCacheAck')])<before;assert raw(page,DRAFT)==draft;assert raw(page,'tp_user:other:diary_v2')=='ownerB';assert raw(page,'tp_diary_entries')=='unowned legacy';cases+=['actual browser QuotaExceeded triggers confirmed-only shrink','pending row and body draft remain durable; other owner/legacy untouched']
    f.offline=True;page.evaluate(FILL,FILLER);boot(page,url);assert page.evaluate('Storage.getDiaryEntries().some(r=>r.note.startsWith("Новая запись"))');resume(page,'Черновик до заполнения памяти');cases+=['full-store startup still reads old pending row and restores draft','reload and server-history outage do not turn partial cache into full history']
   elif mode in['recovery','late-ack']:
    # Strip proofs from current durable copies to model protected legacy data.
    page.evaluate("Storage._writeDiary(JSON.parse(localStorage.getItem(Storage.key('diary_v2'))).map(r=>{delete r._tpDiaryCacheAck;return r}))")
    text='Учебный сохранённый черновик до отказа';begin(page,text);draft=raw(page,DRAFT);metrics['quota']=page.evaluate(FILL,FILLER);page.locator('#note-save-btn').click();wait(page,'Storage.getDiaryEntries().some(r=>r.note==="Учебный сохранённый черновик до отказа"&&r.syncStatus==="memory-only")');expect(page.locator('#saved-title')).to_have_text('Запись ещё не сохранена');assert raw(page,DRAFT)==draft;cid=page.evaluate('savedDiaryClientId');cases+=['unwritable protected queue keeps existing durable body draft','memory-only save is visibly not a durable success']
    page.evaluate("goTo('home',true)");resume(page,text);page.locator('#note-save-btn').click();assert page.evaluate('savedDiaryClientId')==cid;assert page.evaluate('Storage.getDiaryEntries().filter(r=>r.clientId===savedDiaryClientId).length')==1;cases.append('resubmitting same retained draft reuses in-memory clientId')
    page.evaluate('localStorage.removeItem("'+FILLER+'")');f.failPosts=False
    if mode=='late-ack':
     f.holdPost=True;page.locator('#saved-retry-btn').click();assert f.postStarted.wait(2);page.evaluate("goTo('home',true)");resume(page,text);page.locator('#note-textarea').fill('Новый черновик пока старый ответ идёт');newDraft=raw(page,DRAFT);f.postGate.set();wait(page,'Storage.getDiaryEntries().some(r=>r.clientId==="'+cid+'"&&r.syncStatus==="synced")');assert raw(page,DRAFT)==newDraft;cases.append('old ACK cannot clear a newer draft')
    else:
     page.locator('#saved-retry-btn').click();wait(page,'Storage.getDiaryEntries().some(r=>r.clientId==="'+cid+'"&&r.syncStatus==="synced")');assert raw(page,DRAFT)is None;cases.append('confirmed ACK clears only the matching recovery draft')
    assert set(f.postIDs)=={cid};cases.append('offline attempts preserve one clientId and payload')
   elif mode=='blocked':
    begin(page,'Текст без доступа к хранилищу');page.locator('#note-save-btn').click();wait(page,'Storage.getDiaryEntries().some(r=>r.note==="Текст без доступа к хранилищу"&&r.syncStatus==="memory-only")');expect(page.locator('#saved-title')).to_have_text('Запись ещё не сохранена');f.failPosts=False;page.locator('#saved-retry-btn').click();wait(page,'Storage.getDiaryEntries().some(r=>r.note==="Текст без доступа к хранилищу"&&r.syncStatus==="synced")');expect(page.locator('#saved-title')).to_have_text('Запись сохранена на сервере');cases+=['blocked localStorage does not crash startup','memory-only warning and eventual server ACK remain correct']
   assert not errors,errors;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');cases.append('no page errors or horizontal overflow');page.screenshot(path=str(H/f'{engine}-{width}-{mode}.png'));browser.close()
 finally:f.postGate.set();f.gate.set();server.shutdown();server.server_close()
 return{'engine':engine,'width':width,'mode':mode,'base':base,'passed':True,'cases':cases,'metrics':metrics,'realWrites':0}
if __name__=='__main__':
 out=H/('smoke-ui.json'if'--smoke'in sys.argv else'ui-results.json');modes=['bounded','quota','recovery','late-ack','blocked'];viewports=[('chromium',390)]if'--smoke'in sys.argv else[('chromium',320),('chromium',390),('chromium',1440),('webkit',390)];hashes={f:hashlib.sha256((R/f).read_bytes()).hexdigest()for f in['app/js/storage.js','app/js/boot.js','app/js/diary-history.js','app/js/observation-drafts.js']};runs=json.loads(out.read_text(encoding='utf-8'))['runs']if'--retry'in sys.argv and out.exists()else[]
 if runs:assert json.loads(out.read_text(encoding='utf-8'))['sourceHashes']==hashes
 for engine,width in viewports:
  for mode in modes:
   if any(r['engine']==engine and r['width']==width and r['mode']==mode for r in runs):continue
   print('Checking',engine,width,mode,flush=True);runs.append(run(engine,width,mode));out.write_text(json.dumps({'passed':len(runs)==len(modes)*len(viewports),'runs':runs,'sourceHashes':hashes},ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps({'passed':True,'cases':sum(len(r['cases'])for r in runs)}))
