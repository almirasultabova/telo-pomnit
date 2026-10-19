from pathlib import Path
import importlib.util,json,threading,hashlib,sys,urllib.request,urllib.error
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright,expect
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent
spec=importlib.util.spec_from_file_location('cache',R/'audit/checkin-cache-JAPP133/test-ui.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
wait=m.wait;boot=m.boot;raw=m.raw
CLIPBOARD="""window.__copied=[];window.__copyMode='ok';Object.defineProperty(navigator,'clipboard',{value:{writeText:text=>{if(window.__copyMode==='fail')return Promise.reject(Error('fixture denied'));if(window.__copyMode==='hold')return new Promise(resolve=>window.__releaseCopy=()=>{window.__copied.push(text);resolve()});window.__copied.push(text);return Promise.resolve()}}});"""
SEED="""options=>{const d={id:'pending-old',clientId:'pending-client',date:'2022-01-01T12:00:00Z',zone:'chest',sensations:['tension'],note:'Давняя неотправленная запись <img src=x onerror=window.__unsafe=1>',syncStatus:'pending',...(options.blocked?{retryBlocked:true,rejectedStatus:400,syncError:'HTTP_400'}:{})};const c={id:'pending-state',date:'2026-10-19T12:00:00Z',dayKey:'2026-10-19',clientUpdatedAt:'2026-10-19T12:00:01Z',tension:9,anxiety:3,energy:4,safety:7,bodyContact:6,note:'Пять моих ответов',syncStatus:'pending',legacyScale:false,kind:'checkin',...(options.blocked?{retryBlocked:true,syncError:'HTTP_409'}:{})};if(options.rows){Storage._writeDiary([d,...Storage.getDiaryEntries()]);Storage._writeCheckins([c,...Storage.getCheckins().filter(r=>r.dayKey!==c.dayKey)])}if(options.drafts){Storage.saveFormDraft('body-observation-v1',{version:1,date:'2026-10-19T12:00:00Z',zone:'chest',sensations:['tension'],note:'Мой телесный черновик',view:'front'});Storage.saveFormDraft('checkin',{version:1,date:'2026-10-19T12:00:00Z',tension:8,anxiety:2,energy:4,safety:7,bodyContact:6,note:'Мой черновик оценок'})}renderMainTab();return{diary:Storage.key('diary_v2'),checkins:Storage.key('checkins_v2'),body:Storage.key('form_draft_v1:body-observation-v1'),draft:Storage.key('form_draft_v1:checkin')}}"""

def serve():
 f,server=m.serve();f.network=[];parent=server.RequestHandlerClass
 class Handler(parent):
  def api(self,method):
   path=urlsplit(self.path).path
   if path in ['/api/diary','/api/checkins','/api/diary/days']:f.network.append((method,self.path))
   return super().api(method)
 server.RequestHandlerClass=Handler;return f,server

def settle(page):page.evaluate('Promise.all(document.getAnimations().filter(a=>a.playState==="running"&&Number.isFinite(a.effect.getComputedTiming().endTime)).map(a=>a.finished.catch(()=>{})))')
def open_list(page):
 page.locator('#home-save-status').get_by_role('button',name='Проверить записи').click();expect(page.locator('#screen-save-status')).to_have_class('screen screen--active');settle(page)
def card(page,key):return page.locator('#screen-save-status [data-key="'+key+'"]')

def run(engine,width,mode,base=None):
 f,server=serve();cases=[];errors=[];metrics={}
 try:
  with sync_playwright()as p:
   browser=getattr(p,engine).launch(args=['--disable-http2']if base=='https://app.telo-pomnit.ru/'else[]);page=browser.new_page(viewport={'width':width,'height':844});page.add_init_script(m.m.m.CLOCK+CLIPBOARD+('window.TelegramWebviewProxy={postEvent:()=>{}};'if base else''));page.on('pageerror',lambda e:errors.append(str(e)))
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
   url=base+'index.html?verify=JAPP136#tgWebAppData=synthetic&tgWebAppPlatform=ios&tgWebAppVersion=8.0'if base else f'http://127.0.0.1:{server.server_port}/app/index.html?owner=preview';boot(page,url)
   key=page.evaluate(SEED,{'rows':mode!='drafts','drafts':mode!='rejected','blocked':mode=='rejected'});beforeNetwork=list(f.network);original={k:raw(page,key[k])for k in['body','draft']}if mode!='blocked'else{};open_list(page)
   assert f.network==beforeNetwork;cases.append('opening list makes no archive GET or POST and never submits drafts')
   if mode=='queue':
    expect(page.locator('.ss-summary')).to_have_text('Ждут отправки: 2.');expect(page.locator('.ss-record')).to_have_count(4);expect(card(page,'diary:pending-client')).to_contain_text('Сохранено на этом устройстве');expect(card(page,'checkins:2026-10-19')).to_contain_text('Сохранено на этом устройстве');assert page.locator('#screen-save-status img').count()==0;assert not page.evaluate('window.__unsafe');cases+=['old diary item beyond two latest cards and latest checkin are both visible','device copies and two unsubmitted drafts are separate; text cannot execute HTML']
    card(page,'checkins:2026-10-19').get_by_role('button',name='Скопировать',exact=True).click();wait(page,'window.__copied.length===1');assert all(t in page.evaluate('window.__copied[0]')for t in['Напряжение в теле: 9/10','Тревога: 3/10','Энергия: 4/10','Безопасность: 7/10','Контакт с телом: 6/10','Пять моих ответов']);cases.append('copy contains all five original values and note without modifying data')
    page.locator('#ss-retry').click();wait(page,'!document.getElementById("ss-retry").disabled');expect(page.locator('.ss-summary')).to_have_text('Ждут отправки: 2.');cases.append('failed send remains pending instead of claiming success')
    f.failPosts=False;f.failCheckins=False;page.locator('#ss-retry').click();wait(page,'document.querySelectorAll(".ss-record").length===2');expect(page.locator('.ss-summary')).to_have_text('Нет записей, ожидающих отправки.');assert all(raw(page,key[k])==original[k]for k in original);assert len([r for r in f.network if r[0]=='GET'])==len([r for r in beforeNetwork if r[0]=='GET']);cases+=['only server ACK removes queued entries; drafts remain byte-identical','retry uses existing two queues and makes no full-history reads']
   elif mode=='drafts':
    expect(page.locator('#ss-retry')).to_have_count(0);expect(page.locator('.ss-record')).to_have_count(2);card(page,'draft:body-observation-v1').get_by_role('button',name='Продолжить').click();expect(page.locator('#screen-body-map')).to_have_class('screen screen--active');assert page.evaluate('draft.note')=='Мой телесный черновик';page.evaluate('goBack()');settle(page);card(page,'draft:checkin').get_by_role('button',name='Продолжить').click();expect(page.locator('#checkin-note')).to_have_value('Мой черновик оценок');expect(page.locator('#slider-tension')).to_have_value('8');assert f.network==beforeNetwork;page.evaluate('goBack()');settle(page);cases+=['draft-only state offers Continue and no send button','both original forms restore drafts without POST']
   elif mode=='copy-denied':
    page.evaluate('window.__copyMode="fail"');first=card(page,'diary:pending-client');first.get_by_role('button',name='Скопировать',exact=True).click();expect(first.locator('textarea')).to_be_visible();assert 'Давняя неотправленная запись <img' in first.locator('textarea').input_value();expect(first.locator('.ss-copy-result')).not_to_contain_text('Скопировано.');first.get_by_role('button',name='Выделить текст').click();assert first.locator('textarea').evaluate('el=>el.selectionEnd-el.selectionStart')==len(first.locator('textarea').input_value());second=card(page,'checkins:2026-10-19');second.get_by_role('button',name='Скопировать',exact=True).click();expect(second.locator('textarea')).to_be_visible();assert first.locator('textarea').get_attribute('id')!=second.locator('textarea').get_attribute('id');cases+=['clipboard denial offers complete read-only text and never claims copy success','manual selection works and multiple copy fields have unique labels']
   elif mode=='temporary':
    page.evaluate('goBack();Storage._writeDiary(Storage.getDiaryEntries().map(({_tpDiaryCacheAck,...r})=>r));Storage._writeCheckins(Storage.getCheckins().map(({_tpCheckinCacheAck,...r})=>r))');settle(page);page.evaluate(m.FILL,'japp135-fill');before={k:raw(page,key[k])for k in key};page.evaluate("Storage.saveDiaryEntry({zone:'chest',sensations:['tension'],note:'Новый текст без места'});Storage.saveCheckin({tension:10,anxiety:2,energy:3,safety:4,bodyContact:5,note:'Новые оценки без места'});Storage.saveFormDraft('checkin',{version:1,date:'2026-10-19T12:00:00Z',tension:10,anxiety:2,energy:3,safety:4,bodyContact:5,note:'Новый черновик без места'});renderMainTab()")
    wait(page,'Storage.getDiaryEntries().some(r=>r.note==="Новый текст без места"&&r.syncStatus==="memory-only")');expect(page.locator('#home-save-status')).to_contain_text('Пока не закрывайте приложение');open_list(page);assert page.locator('.ss-record[data-storage=temporary]').count()>=3;assert all(raw(page,key[k])==before[k]for k in key);cases+=['actual full storage clearly separates memory-only text from durable copies','queue and draft old durable snapshots remain byte-identical on write failure']
    target=page.locator('.ss-record').filter(has_text='Новый текст без места');target.get_by_role('button',name='Скопировать',exact=True).click();wait(page,'window.__copied.length===1');assert'Новый текст без места'in page.evaluate('window.__copied[0]');cases.append('memory-only text can be copied before closing without server access')
    f.offline=True;f.offlineCheckins=True;boot(page,url);expect(page.locator('#home-save-status')).to_contain_text('Черновики: 2');open_list(page);expect(card(page,'draft:checkin')).to_contain_text('Мой черновик оценок');cases.append('full-store reload restores original durable draft and queue without pretending lost memory survived')
   elif mode=='rejected':
    expect(page.locator('#ss-retry')).to_have_count(0);expect(page.locator('.ss-blocked')).to_have_count(2);card(page,'diary:pending-client').get_by_role('button',name='Исправить запись').click();expect(page.locator('#screen-body-map')).to_have_class('screen screen--active');assert page.evaluate('draft.note').startswith('Давняя');assert f.network==beforeNetwork;cases+=['blocked400 and409 are never retried blindly','existing diary repair opens original text without sending it']
   elif mode=='owner':
    page.evaluate('window.__copyMode="hold"');card(page,'diary:pending-client').get_by_role('button',name='Скопировать',exact=True).click();wait(page,'typeof window.__releaseCopy==="function"');page.evaluate('Api.logout();Storage.bindUser("other");Api.userId="other";Api._token="synthetic";SaveStatus.open();window.__releaseCopy()');settle(page);expect(page.locator('.ss-record')).to_have_count(0);assert 'Давняя неотправленная'not in page.locator('#screen-save-status').inner_text();assert not page.locator('.ss-copy-result').count();cases+=['logout clears all private list and fallback DOM immediately','late clipboard result cannot repaint or expose previous owner data']
   elif mode=='late-retry':
    f.failPosts=False;f.failCheckins=False;f.holdPost=True;f.holdCheckin=True;page.locator('#ss-retry').click();assert f.postStarted.wait(3)and f.checkinStarted.wait(3);page.evaluate('Api.logout();Storage.bindUser("other");Api.userId="other";Api._token="synthetic";Storage.saveFormDraft("checkin",{version:1,date:"2026-10-19T12:00:00Z",tension:2,anxiety:3,energy:4,safety:5,bodyContact:6,note:"Черновик другого аккаунта"});SaveStatus.open()');f.postGate.set();f.checkinGate.set();wait(page,'Storage._flushing.size===0&&Storage._checkinFlushing.size===0');expect(page.locator('.ss-record')).to_have_count(1);expect(page.locator('.ss-record')).to_contain_text('Черновик другого аккаунта');assert'Давняя неотправленная'not in page.locator('#screen-save-status').inner_text();cases+=['held retry cannot repaint previous owner after logout','new owner draft survives both late queue responses and is never submitted']
   elif mode=='blocked':
    expect(page.locator('.ss-record')).to_have_count(4);expect(page.locator('.ss-record[data-storage=temporary]')).to_have_count(4);card(page,'diary:pending-client').get_by_role('button',name='Скопировать',exact=True).click();wait(page,'window.__copied.length===1');page.locator('#ss-retry').click();wait(page,'!document.getElementById("ss-retry").disabled');expect(page.locator('.ss-summary')).to_have_text('Ждут отправки: 2.');cases+=['blocked localStorage getter does not crash list or falsely claim device saving','memory-only copy and explicit retry remain available while drafts stay unsubmitted']
   settle(page);assert not errors,errors;assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');cases.append('no JS errors or horizontal page overflow');page.screenshot(path=str(H/f'{engine}-{width}-{mode}.png'));browser.close()
 finally:f.checkinGate.set();f.postGate.set();f.gate.set();server.shutdown();server.server_close()
 return{'engine':engine,'width':width,'mode':mode,'base':base,'passed':True,'cases':cases,'metrics':metrics,'realWrites':0}

if __name__=='__main__':
 out=H/('smoke-ui.json'if'--smoke'in sys.argv else'ui-results.json');modes=['queue','drafts','copy-denied','temporary','rejected','owner'];viewports=[('chromium',390)]if'--smoke'in sys.argv else[('chromium',320),('chromium',390),('chromium',1440),('webkit',390)];files=['app/js/save-status.js','app/css/save-status.css','app/js/app.js','app/js/api.js','app/index.html'];hashes={f:hashlib.sha256((R/f).read_bytes()).hexdigest()for f in files};runs=json.loads(out.read_text(encoding='utf-8'))['runs']if'--retry'in sys.argv and out.exists()else[]
 if runs:assert json.loads(out.read_text(encoding='utf-8'))['sourceHashes']==hashes
 for engine,width in viewports:
  for mode in modes:
   if any(r['engine']==engine and r['width']==width and r['mode']==mode for r in runs):continue
   print('Checking',engine,width,mode,flush=True);runs.append(run(engine,width,mode));out.write_text(json.dumps({'passed':len(runs)==len(modes)*len(viewports),'runs':runs,'sourceHashes':hashes},ensure_ascii=False,indent=2),encoding='utf-8')
 print('PASS',len(runs),'runs',sum(len(r['cases'])for r in runs),'checks')
