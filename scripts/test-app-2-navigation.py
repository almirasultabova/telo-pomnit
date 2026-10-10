"""Stage1 shell regression. Local browser/SDK, synthetic API, no live writes."""
import importlib.util, json, threading, re
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('app2ui',ROOT/'scripts/test-app-2-ui.py')
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
class Fixture(base.Fixture):
    def __init__(self,blocked=False):
        super().__init__();self.blocked=blocked;self.shell_calls=[]
    def route(self,route):
        req=route.request;path=req.url.split('/api',1)[1];self.shell_calls.append([req.method,path])
        if path=='/auth/telegram' and self.blocked:
            route.fulfill(status=403,content_type='application/json',body=json.dumps({'code':'CLUB_ACCESS_PENDING','error':'Fixture pending'}));return
        super().route(route)
def back(page):
    base.settled(page)
    assert page.evaluate('Telegram.WebApp.BackButton.isVisible')
    page.evaluate("Telegram.WebView.receiveEvent('back_button_pressed')")
    base.settled(page)
def active(page,screen):
    expect(page.locator('#screen-'+screen)).to_have_class(re.compile(r'\bscreen--active\b'),timeout=15000)
server=ThreadingHTTPServer(('127.0.0.1',0),partial(base.Quiet,directory=str(ROOT/'output/app')))
threading.Thread(target=server.serve_forever,daemon=True).start()
results=[]
try:
 with sync_playwright() as pw:
  for engine in [pw.chromium,pw.webkit]:
   browser=engine.launch()
   for blocked in [False,True]:
    context=browser.new_context(viewport={'width':390,'height':844})
    page=context.new_page();fixture=Fixture(blocked);errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.add_init_script('window.TelegramWebviewProxy={postEvent:()=>{}}')
    def route_all(route):
        if '/api/' in route.request.url:fixture.route(route)
        elif route.request.url.startswith('http://127.0.0.1:'):route.continue_()
        else:route.abort()
    page.route('**/*',route_all)
    page.goto(f'http://127.0.0.1:{server.server_port}/#tgWebAppPlatform=ios&tgWebAppVersion=8.0')
    if blocked:
        page.wait_for_function('Boolean(Api.clubBlocked)')
        expect(page.locator('#screen-home')).not_to_have_class(re.compile(r'\bscreen--active\b'))
        page.evaluate("document.getElementById('main-body-btn').click();document.getElementById('main-reaction-btn').click();document.getElementById('main-state-btn').click()")
        assert page.evaluate("currentScreen!=='body-map'&&currentScreen!=='trigger'&&currentScreen!=='checkin'")
        assert not any(method=='POST' and path!='/auth/telegram' for method,path in fixture.shell_calls)
        results.append({'engine':engine.name,'case':'blocked-home-actions','passed':True})
    else:
        expect(page.locator('#screen-home')).to_have_class('screen screen--active',timeout=15000)
        assert page.evaluate("activeTab==='main'")
        after_boot=len(fixture.shell_calls)
        for _ in range(3):
            for tab in ['diary','diag','profile','main']:
                page.locator(f'.nav-btn[data-tab="{tab}"]').click()
                expect(page.locator('#tab-'+tab)).to_have_class('tab-pane tab-pane--active')
                assert page.locator('.nav-btn[aria-current=page]').count()==1
        assert not any(method in ['POST','DELETE','PUT','PATCH'] for method,path in fixture.shell_calls[after_boot:])
        assert not page.evaluate('Telegram.WebApp.BackButton.isVisible')
        for button,screen in [('main-body-btn','body-map'),('main-reaction-btn','trigger'),('main-state-btn','checkin')]:
            page.locator('#'+button).click();active(page,screen);back(page);active(page,'home')
            assert page.evaluate("activeTab==='main'")
        page.locator('#main-body-btn').click();page.evaluate("draft.zone='chest';draft.sensations=['tension'];goTo('note')")
        active(page,'note');page.locator('#note-textarea').fill('Локальный черновик')
        back(page);active(page,'body-map');back(page);active(page,'home')
        expect(page.locator('#note-textarea')).to_have_value('Локальный черновик')
        page.locator('.nav-btn[data-tab="diary"]').click();page.locator('#diary-history-btn').click();active(page,'history');back(page)
        assert page.evaluate("activeTab==='diary'")
        page.locator('.nav-btn[data-tab="main"]').click();page.locator('#main-state-btn').click()
        assert page.locator('#checkin-scales input[type=range]').count()==5
        assert page.evaluate("Object.keys(checkinDraft).join(',')")=='tension,anxiety,energy,safety,bodyContact'
        assert page.locator('#slider-tension').get_attribute('min')=='1'
        assert page.locator('#slider-tension').get_attribute('max')=='10'
        back(page);page.locator('.nav-btn[data-tab="profile"]').click()
        page.locator('#data-rights-btn').click();active(page,'data-rights');back(page);active(page,'home')
        assert page.evaluate("activeTab==='profile'")
        page.locator('#open-feedback-btn').click();active(page,'feedback');back(page)
        page.evaluate('Api.isClubAdmin=true;Api.getAdmissions=async()=>[{accessStatus:"pending",id:"fixture",telegramId:"100",firstName:"Учебная"}];renderAdmissions()')
        expect(page.locator('.nav-badge')).to_have_text('1')
        expect(page.locator('.nav-btn[data-tab="profile"] > span')).to_have_text('Профиль')
        assert not any(method in ['POST','DELETE','PUT','PATCH'] and path!='/auth/data-rights' for method,path in fixture.shell_calls[after_boot:]),fixture.shell_calls[after_boot:]
        results.append({'engine':engine.name,'case':'tabs-actions-draft-five-scales-rights-feedback-admin','passed':True})
    assert not errors,errors
    context.close()
   browser.close()
finally:
 server.shutdown()
 out=ROOT/'output/app-2-qa/after/navigation-results.json'
 out.write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'PASS shell navigation: {len(results)} cases; no live API')
