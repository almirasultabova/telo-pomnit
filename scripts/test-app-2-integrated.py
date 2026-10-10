"""Integrated app: actual bundle, synthetic accounts, no production API."""
import ast,json,threading,re
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output/app-2-integrated';(OUT/'screens').mkdir(parents=True,exist_ok=True)
tree=ast.parse((ROOT/'scripts/test-app-2-stream.py').read_text(encoding='utf-8'));defs=[]
for item in tree.body:
 if isinstance(item,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='server' for t in item.targets):break
 defs.append(item)
ns={'__file__':str(ROOT/'scripts/test-app-2-stream.py')};exec(compile(ast.Module(body=defs,type_ignores=[]),'fixture','exec'),ns)
Fixture,base=ns['Fixture'],ns['base']
server=ThreadingHTTPServer(('127.0.0.1',0),partial(base.Quiet,directory=str(ROOT/'output/app')));threading.Thread(target=server.serve_forever,daemon=True).start();results=[]
try:
 with sync_playwright() as pw:
  for engine in [pw.chromium,pw.webkit]:
   browser=engine.launch()
   for state,width in [(s,w) for s in ['active','new','between'] for w in [320,390,430]]+[('staff',390),('error',390),('long',320)]:
    context=browser.new_context(viewport={'width':width,'height':844},reduced_motion='reduce');page=context.new_page();fixture=Fixture('active' if state=='long' else state);errors=[]
    if state=='long':fixture.name='Анна-Мария Александровна';fixture.diary[0]['note']='Очень длинная личная заметка '+('наблюдение за телом и состоянием ' * 16)+'<img src=x onerror=alert(1)>'
    page.on('pageerror',lambda e:errors.append(str(e)));page.add_init_script('window.TelegramWebviewProxy={postEvent:()=>{}}')
    def route(req):
     if '/api/' in req.request.url:
      path=req.request.url.split('/api',1)[1]
      if path.startswith('/checkins?') and state not in ['new','error','between']:
       req.fulfill(status=200,content_type='application/json',body=json.dumps([{'id':f'check-{i}','createdAt':f'2026-10-{day}T16:00:00Z','dayKey':f'2026-10-{day}','tension':v,'anxiety':v+1,'energy':10-v,'safety':8-i,'bodyContact':3+i,'note':''} for i,(day,v) in enumerate([('02',4),('09',6)])]));fixture.requests.append(['GET',path])
      else:fixture.route(req)
     elif req.request.url.startswith('http://127.0.0.1:'):req.continue_()
     else:req.abort()
    page.route('**/*',route);page.goto(f'http://127.0.0.1:{server.server_port}/#tgWebAppPlatform=ios&tgWebAppVersion=8.0');expect(page.locator('#screen-home')).to_have_class('screen screen--active',timeout=15000);base.settled(page)
    for tab in ['main','diary','diag','profile']:
     page.locator(f'.nav-btn[data-tab="{tab}"]').click();base.settled(page)
     expect(page.locator(f'#tab-{tab}')).to_have_class('tab-pane tab-pane--active');assert page.locator('.nav-btn[aria-current="page"]').count()==1
     scroll=page.locator(f'#tab-{tab} .screen-scroll, #tab-{tab} .home-scroll').first
     assert scroll.evaluate('e=>e.scrollWidth<=e.clientWidth+1'),(engine.name,state,width,tab)
     assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
     for button in page.locator('.bottom-nav .nav-btn').all():assert button.bounding_box()['height']>=44
     page.evaluate('document.activeElement.blur()');page.screenshot(path=str(OUT/'screens'/f'{engine.name}-{state}-{width}-{tab}.png'))
     height=scroll.evaluate('e=>e.scrollHeight')+page.locator(f'#tab-{tab} .screen-header').count()*100+90
     page.set_viewport_size({'width':width,'height':min(max(height,844),6000)});base.settled(page)
     page.screenshot(path=str(OUT/'screens'/f'{engine.name}-{state}-{width}-{tab}-full.png'),full_page=True)
     page.set_viewport_size({'width':width,'height':844})
     if tab=='profile':expect(page.locator('.profile-name')).to_have_text(fixture.name)
     if tab=='profile':expect(page.get_by_role('button',name='Мои данные и приватность',exact=True)).to_be_visible()
     if tab=='diary' and state=='new':expect(page.locator('.diary-history-empty')).to_contain_text('Записей пока нет')
     if tab=='diary' and state=='error':assert 'Записей пока нет' not in page.locator('#recent-entries').inner_text()
     if tab=='diag' and state=='active':assert page.locator('.cchart-leg').count()==5
     if tab=='diag' and state=='active' and width==390:
      disclosure=page.locator('.hmap-all-zones');disclosure.locator('summary').click()
      assert disclosure.locator('.hmap-row').count()==page.evaluate('DATA.zones.filter(z=>z.selectable!==false).length')
      assert disclosure.locator('.hmap-zone-name').first.evaluate('e=>parseFloat(getComputedStyle(e).fontSize)>=13 && getComputedStyle(e).textOverflow!=="ellipsis"')
      assert scroll.evaluate('e=>e.scrollWidth<=e.clientWidth+1')
      page.screenshot(path=str(OUT/'screens'/f'{engine.name}-active-390-all-zones.png'))
      disclosure.locator('summary').click()
     if state=='long':assert page.locator('#recent-entries img').count()==0
    assert not errors,errors
    assert [x for x in fixture.requests if x[0] in ['POST','PATCH','PUT','DELETE']]==[['POST','/auth/telegram']]
    results.append({'engine':engine.name,'state':state,'width':width,'pass':True});context.close()
   browser.close()
finally:server.shutdown()
(OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'passed':len(results),'tabs':len(results)*4,'screens':len(list((OUT/'screens').glob('*.png')))}))
