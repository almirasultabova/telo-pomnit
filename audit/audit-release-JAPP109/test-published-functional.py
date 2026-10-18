from pathlib import Path
import argparse,hashlib,importlib.util,json,threading
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright,expect
ROOT=Path.cwd();OUT=ROOT/'audit/audit-release-JAPP109/published-functional'
s=importlib.util.spec_from_file_location('fixture',ROOT/'scripts/test-observation-drafts.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
def serve():
 f=m.Fixture();server=m.serve(f);original=server.RequestHandlerClass
 samples=[('2026-10-02T12:00:00Z','chest',['tension','custom:тепло']),('2026-10-09T12:00:00Z','chest',['custom:тепло']),('2026-10-09T13:00:00Z','throat',['custom:лёгкость']),('2026-09-28T12:00:00Z','chest',['tension'])]
 f.diary['preview']={str(i):{'id':str(i),'createdAt':date,'zone':zone,'sensations':sens,'note':'Вымышленное наблюдение'} for i,(date,zone,sens) in enumerate(samples)}
 class Handler(original):
  def api(self,method):
   path=urlsplit(self.path).path
   if path=='/api/me/enrollment/access':return self.send_json({'streams':[{'id':'fixture-stream','name':'Учебный поток','phase':'current','startDate':'2026-10-01','endDate':'2026-11-05','canAttend':True,'canReadRecordings':True,'meetings':[]}],'ai':{'canWrite':False,'reason':'ended','message':'Учебный режим без AI'}})
   if path=='/api/questionnaires/fixture-stream':return self.send_json({'pre':{'id':'fixture-pre','answers':{}},'post':None})
   return super().api(method)
 server.RequestHandlerClass=Handler
 return f,server
def run(engine,width):
 f,server=serve();cases=[]
 with sync_playwright() as p:
  browser=getattr(p,engine).launch();page=browser.new_page(viewport={'width':width,'height':844});page.route('**/api/**',lambda route:route.fulfill(response=route.fetch(url=f'http://127.0.0.1:{server.server_port}/api/'+route.request.url.split('/api/',1)[1])));errors=[]
  import time
  def wait_callback(expression,**kwargs):
   until=time.monotonic()+15
   while time.monotonic()<until:
    if page.evaluate(expression):return
    page.wait_for_timeout(50)
   raise AssertionError('Callback condition timeout')
  page.wait_for_function=wait_callback;page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('https://tg-app-telo-pomnit.vercel.app/?verify=JAPP109#tgWebAppData=preview&tgWebAppVersion=8.0&tgWebAppPlatform=ios');page.wait_for_selector('#screen-home.screen--active');page.evaluate('LaunchSplash.cancel()');page.wait_for_function('()=>Storage.getHistoryLoadStatus().diary==="loaded"&&selectedProgramId==="fixture-stream"')
  page.locator('.nav-btn[data-tab=diag]').click()
  expect(page.locator('#tab-diag .section-label').filter(has_text='Карта ощущений')).to_be_visible()
  expect(page.locator('.hmap-description')).to_have_text('Области тела, которые вы отмечали в дневнике. Числа — количество записей за выбранный период.')
  assert 'Карта напряжений' not in page.locator('#diag-tab-content').inner_text()
  def counts():return page.locator('.hmap-labels-col .hmap-count').all_text_contents()
  assert sorted(counts())==['1','2'],counts()
  cases.append('map title/caption describe record counts; multiple sensations count once; out-of-stream entry excluded')
  page.locator('.hmap-week-btn[data-week="1"]').click();assert counts()==['1'],counts()
  expect(page.locator('.hmap-week-btn[data-week="1"]')).to_have_attribute('aria-pressed','true')
  page.locator('.hmap-week-btn[data-week="2"]').click();assert counts()==['1','1'],counts()
  cases.append('week filters preserve counts for tension, warmth and lightness')
  page.locator('.hmap-week-btn[data-week="5"]').click();expect(page.locator('.hmap-labels-col .hmap-empty')).to_be_visible()
  page.locator('.hmap-week-btn[data-week="0"]').click();assert sorted(counts())==['1','2']
  page.locator('.hmap-all-zones summary').click();assert page.locator('.hmap-full-list .hmap-row').count()>2
  cases.append('empty period, all periods and full-zone disclosure remain available')
  page.evaluate('document.querySelector(".hmap-description").scrollIntoView({block:"start"})');page.evaluate('document.fonts.ready');page.wait_for_function('()=>!document.querySelector(".screen--enter,.screen--exit")');page.screenshot(path=str(OUT/f'{engine}-{width}-map.png'))
  for origin in ['main','diary']:
   page.evaluate('(tab)=>{switchTab(tab);startDiaryEntry()}',origin)
   page.evaluate('document.querySelector(".body-zone-disclosure").open=true');page.locator('#body-zone-list [data-zone=chest]').click();page.locator('#zone-continue-btn').click();page.locator('[data-sensation=tension]').click();page.locator('#sensations-continue-btn').click();page.locator('#note-textarea').fill('Учебная запись из '+origin)
   gate=None
   if origin=='diary':f.request_started.clear();gate=threading.Event();f.hold_next=gate
   page.locator('#note-save-btn').click();expect(page.locator('#screen-saved')).to_have_class('screen screen--active',timeout=5000)
   if gate:assert f.request_started.wait(5)
   else:page.wait_for_function('()=>Storage.getDiaryEntries().some(r=>r.clientId&&r.syncStatus==="synced")')
   page.locator('#saved-home-btn').click();expect(page.locator('#tab-main')).to_have_class('tab-pane tab-pane--active');expect(page.locator('.nav-btn[data-tab=main]')).to_have_attribute('aria-current','page')
   assert page.evaluate('()=>currentScreen==="home"&&activeTab==="main"&&screenStack.length===0')
   page.evaluate('goBack()');assert page.evaluate('()=>currentScreen==="home"&&activeTab==="main"')
   if gate:gate.set();page.wait_for_function('()=>Storage.getDiaryEntries().filter(r=>r.clientId&&r.syncStatus==="synced").length===2');assert page.evaluate('()=>activeTab==="main"')
   cases.append('save from '+origin+' returns to Main with cleared back stack; '+('late ACK preserves Main' if gate else 'confirmed save retained'))
  page.evaluate('document.fonts.ready');page.wait_for_function('()=>!document.querySelector(".screen--enter,.screen--exit")');page.screenshot(path=str(OUT/f'{engine}-{width}-main.png'))
  assert len(f.diary['preview'])==6
  assert page.evaluate('()=>document.documentElement.scrollWidth<=innerWidth')
  assert not errors,errors
  browser.close()
 server.shutdown();server.server_close()
 return {'passed':True,'engine':engine,'width':width,'cases':cases,'pageErrors':errors}
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--preview',action='store_true');args=parser.parse_args()
 if args.preview:
  f,server=serve();print(f'LOCAL_FICTIONAL_SAVED_MAP_PREVIEW http://127.0.0.1:{server.server_port}/app/index.html?owner=preview',flush=True);threading.Event().wait()
 else:
  OUT.mkdir(parents=True,exist_ok=True);runs=[run(*a) for a in [('chromium',390),('webkit',390)]]
  result={'passed':True,'runs':runs,'sourceHashes':{name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in ['app/js/app.js','app/css/ux-diary-path.css']}};(OUT/'ui-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'passed':True,'runs':len(runs),'groups':sum(len(r['cases']) for r in runs)}))
