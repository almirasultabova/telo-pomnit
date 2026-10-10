"""Home stage2: synthetic API, genuine SDK, states, ownership, screenshots. No live API."""
import importlib.util, json, threading, re, os
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('base', ROOT/'scripts/test-app-2-ui.py')
base = importlib.util.module_from_spec(spec); spec.loader.exec_module(base)
OUT = ROOT/os.environ.get('APP2_STREAM_OUT','output/app-2-stream'); (OUT/'screens').mkdir(parents=True,exist_ok=True)
NOW = '2026-10-10T10:00:00Z'
class Fixture(base.Fixture):
    def __init__(self, state):
        super().__init__(); self.state=state; self.requests=[]; self.owner='home-a'; self.name='Анна'; self.fail=state=='error'
        self.diary=[] if state=='new' else [{'id':'own-note','createdAt':'2026-10-09T16:30:00Z','zone':'chest','sensations':['tension'],'note':'Заметила напряжение в плечах после разговора.'}]
    def route(self,route):
        req=route.request; path=req.url.split('/api',1)[1]; self.requests.append([req.method,path]); body=None; status=200
        if path=='/auth/telegram':
            if self.state=='blocked': status=403; body={'code':'CLUB_ACCESS_PENDING','error':'Учебный допуск ожидается'}
            else: body={'token':'home-fixture','user':{'id':self.owner,'name':self.name,'isClubAdmin':self.state=='staff','consentGivenAt':NOW}}
        elif path=='/me':body={'id':self.owner,'name':self.name,'consentGivenAt':NOW}
        elif path=='/me/enrollment/access':
            if self.fail:status=503;body={'error':'Учебная ошибка связи'}
            else:
                completed=self.state in ['completed','between']; upcoming=self.state=='upcoming'
                stream={'id':'own-stream','name':'Осенний поток','startDate':'2026-10-15' if upcoming else '2026-09-01' if completed else '2026-10-01','endDate':'2026-11-12' if upcoming else '2026-10-01' if completed else '2026-10-31','phase':'upcoming' if upcoming else 'completed' if completed else 'current','recordingsExpiresAt':'2026-12-01T00:00:00+03:00','canAttend':not upcoming and not completed,'canReadRecordings':self.state!='between','meetings':[{'id':'past','date':'2026-10-01T10:00:00Z','topic':'Прошедшая встреча'},{'id':'next','date':'2026-10-15T16:00:00Z','topic':'Тело и привычная реакция'}]}
                body={'serverTime':NOW,'streams':[] if self.state in ['new','no-flow'] else [stream],'ai':{'canWrite':self.state in ['active','staff'],'message':'AI доступен для этого потока.' if self.state in ['active','staff'] else 'AI недоступен вне активного потока.'}}
        elif path.startswith('/diary?'):
            if self.fail:status=503;body={'error':'Учебная ошибка истории'}
            else:body=self.diary
        elif path.startswith('/checkins?'):
            if self.fail:status=503;body={'error':'Учебная ошибка истории'}
            else:body=[]
        elif path=='/admin/admissions':body=[]
        else:super().route(route);return
        route.fulfill(status=status,content_type='application/json',body=json.dumps(body,ensure_ascii=False))

server=ThreadingHTTPServer(('127.0.0.1',0),partial(base.Quiet,directory=str(ROOT/'output/app')))
threading.Thread(target=server.serve_forever,daemon=True).start()
results=[]
try:
 with sync_playwright() as pw:
  for engine in [pw.chromium,pw.webkit]:
   browser=engine.launch()
   for state in ['new','upcoming','active','completed','between','staff','error','no-flow','blocked']:
    context=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce')
    page=context.new_page(); fixture=Fixture(state); errors=[]; external=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.add_init_script('window.TelegramWebviewProxy={postEvent:()=>{}}')
    def dispatch(route):
        if '/api/' in route.request.url:fixture.route(route)
        elif route.request.url.startswith('http://127.0.0.1:'):route.continue_()
        else:external.append(route.request.url);route.abort()
    page.route('**/*',dispatch)
    page.goto(f'http://127.0.0.1:{server.server_port}/#tgWebAppPlatform=ios&tgWebAppVersion=8.0')
    if state=='blocked':
        page.wait_for_function('Api.clubBlocked'); assert not page.locator('#screen-home').evaluate("e=>e.classList.contains('screen--active')")
        assert page.locator('#home-observations').inner_text()==''
    else:
        expect(page.locator('#screen-home')).to_have_class('screen screen--active',timeout=15000); base.settled(page)
        expect(page.locator('#home-greeting')).to_have_text('Анна')
        if state=='error':
            expect(page.locator('#home-stream')).to_contain_text('Не удалось загрузить');expect(page.locator('#home-observations')).to_contain_text('Не удалось загрузить')
            assert 'Пока нет записей' not in page.locator('#home-observations').inner_text()
        elif state=='new': expect(page.locator('#home-observations')).to_contain_text('Пока нет записей')
        elif state=='between':expect(page.locator('#home-stream')).to_contain_text('Между потоками');assert 'Тело и привычная реакция' not in page.locator('#home-stream').inner_text()
        elif state=='completed':expect(page.locator('#home-stream')).to_contain_text('Завершён')
        elif state=='staff':expect(page.locator('#home-stream')).to_contain_text('Служебный режим')
        elif state in ['active','upcoming']:expect(page.locator('#home-stream')).to_contain_text('15 октября');assert 'Прошедшая встреча' not in page.locator('#home-stream').inner_text()
        if state in ['active','upcoming','staff']:
            assert page.locator('.home-scroll > section:not(.home-scene)').first.get_attribute('class')=='home-stream-section'
        else:
            assert page.locator('.home-scroll > section:not(.home-scene)').first.get_attribute('class')=='home-actions'
        # Render and tab switching are read-only; no extra network requests.
        before=len(fixture.requests); page.evaluate('renderMainTab();renderMainTab();switchTab("main")');assert len(fixture.requests)==before
        assert [x for x in fixture.requests if x[0] in ['POST','PATCH','DELETE','PUT']]==[['POST','/auth/telegram']]
        assert page.locator('.nav-btn').count()==4
        if state=='active':
            for button,screen in [('main-body-btn','body-map'),('main-reaction-btn','trigger'),('main-state-btn','checkin')]:
                page.locator('#'+button).click();expect(page.locator('#screen-'+screen)).to_have_class('screen screen--active')
                assert page.evaluate('Telegram.WebApp.BackButton.isVisible');page.evaluate("Telegram.WebView.receiveEvent('back_button_pressed')");expect(page.locator('#screen-home')).to_have_class('screen screen--active')
                assert page.evaluate("activeTab==='main'")
            page.locator('#home-observations .home-link').first.click();expect(page.locator('#screen-history')).to_have_class('screen screen--active')
            page.evaluate("Telegram.WebView.receiveEvent('back_button_pressed')")
            assert page.evaluate("activeTab==='main'")
        if state in ['new','no-flow']: expect(page.locator('#home-stream')).to_contain_text('Без активного потока')
        if state in ['active','upcoming']:
            expect(page.locator('.home-meeting')).to_contain_text('15 октября')
            expect(page.locator('.home-meeting-clock')).to_have_text('19:00 · МСК')
            expect(page.locator('.home-meeting time')).to_have_attribute('datetime','2026-10-15T16:00:00Z')
            assert '2026' in page.locator('.home-meeting time').get_attribute('aria-label')
        assert page.locator('#home-stream').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
        widths=[320,390,430] if state in ['new','active','between'] else [390]
        for width in widths:
            page.set_viewport_size({'width':width,'height':844});base.settled(page)
            assert page.locator('.home-scroll').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            assert page.locator('.home-scene-image').evaluate('e=>e.complete&&e.naturalWidth>0')
            page.locator('.home-scroll').evaluate('e=>e.scrollTop=0');page.mouse.move(0,0)
            page.screenshot(path=str(OUT/'screens'/f'{engine.name}-{state}-{width}-viewport.png'))
            height=page.locator('.home-scroll').evaluate('e=>e.scrollHeight')+90
            page.set_viewport_size({'width':width,'height':height});base.settled(page)
            page.screenshot(path=str(OUT/'screens'/f'{engine.name}-{state}-{width}-full.png'),full_page=True)
            page.locator('.home-stream-card').screenshot(path=str(OUT/'screens'/f'{engine.name}-{state}-{width}-stream.png'))
        if state=='error':
            fixture.fail=False
            page.get_by_role('button',name=re.compile('^Повторить загрузку потока')).click();expect(page.locator('#home-stream')).to_contain_text('Осенний поток')
            page.get_by_role('button',name=re.compile('^Повторить загрузку наблюдений')).click();expect(page.locator('#home-observations')).to_contain_text('Заметила напряжение')
        if state=='new':
            # Unverified Telegram values cannot supply the greeting. Text stays text.
            fixture.name='<img src=x onerror=alert(1)>'
            page.evaluate('homeUser.name="<img src=x onerror=alert(1)>";renderMainTab()')
            assert page.locator('#home-greeting img').count()==0
            # Changing the account hides the previous owner's observations/name.
            page.evaluate('Api.userId="different-owner";renderMainTab()')
            expect(page.locator('#home-greeting')).to_have_text('Здравствуйте');assert page.locator('#home-observations').inner_text()==''
    assert not errors,errors;assert not external,external
    results.append({'engine':engine.name,'state':state,'passed':True});context.close()
   browser.close()
finally:server.shutdown()
(OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print('PASS Home states, ownership, read-only rendering, SDK Back, responsive captures:',len(results))
