"""Actual bundled app + embedded panel, isolated synthetic API; no live writes."""
import json, threading, urllib.parse
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/access-admin'
OUT.mkdir(exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
    def copyfile(self, source, outputfile):
        try: super().copyfile(source, outputfile)
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError): pass
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT/'output/app')))
threading.Thread(target=server.serve_forever, daemon=True).start()
results = []
try:
    with sync_playwright() as p:
        for engine in [p.chromium, p.webkit]:
            browser = engine.launch()
            for scenario, width in [('owner',390),('owner',1100),('admin',390),('host',390),('participant',390),('retry',390),('revoked',390),('logout',390),('frame-retry',390),('parent-revoked',390)]:
                ctx = browser.new_context(viewport={'width':width,'height':844})
                ctx.add_init_script('window.TelegramWebviewProxy={postEvent:()=>{}}')
                page = ctx.new_page(); errors=[]; calls=[]
                page.on('pageerror',lambda e:errors.append(str(e)))
                flags = {'fail':scenario=='retry','revoked':False,'frameFail':scenario=='frame-retry'}
                role = 'HOST' if scenario=='host' else 'PARTICIPANT' if scenario=='participant' else 'ADMIN'
                def route(r):
                    path=urllib.parse.urlsplit(r.request.url).path; calls.append((path,r.request.method,r.request.headers.get('authorization')))
                    data={}; status=200
                    if path=='/api/auth/telegram':
                        data={'token':'fixture-a','user':{'id':'a','telegramId':'100','name':'Учебная участница','consentGivenAt':'2026-10-06','isClubAdmin':scenario!='admin' and role=='ADMIN','role':role}}
                    elif path=='/api/access-admin/session':
                        if role!='ADMIN' or flags['revoked']: status=403;data={'error':'Нет доступа'}
                        elif flags['fail']: status=503;data={'error':'Учебный сбой'}
                        else:data={'id':'a','owner':scenario!='admin'}
                    elif path=='/api/access-admin/streams':data=[]
                    elif path=='/api/access-admin/users':data={'items':[],'total':0,'page':1,'pageSize':30}
                    elif path=='/api/access-admin/stats':
                        if flags['revoked']:status=403;data={'error':'Нет доступа'}
                        else:data={k:0 for k in ['pending','approved','rejected','entered','paid','free','diary','checkins','triggers']};data['errors']=[]
                    elif path=='/api/access-admin/audit':data=[]
                    elif path=='/api/me':data={'id':'a','name':'Учебная участница'}
                    elif path=='/api/me/enrollment/access':data={'ai':{'canWrite':False,'message':'Нет активного потока'},'streams':[]}
                    elif path in ['/api/diary','/api/checkins','/api/triggers']:data=[]
                    elif path=='/api/diagnostic/result':data=None
                    elif path.startswith('/api/questionnaires/'):data={'pre':None,'post':None}
                    r.fulfill(status=status,content_type='application/json',body=json.dumps(data))
                def frame_route(r):
                    if flags['frameFail']:r.abort('failed')
                    else:r.continue_()
                page.route('**/api/**',route);page.route('**/access-admin.html?*',frame_route)
                page.goto(f'http://127.0.0.1:{server.server_port}/#tgWebAppPlatform=ios&tgWebAppVersion=8.0')
                expect(page.locator('#screen-home')).to_have_class('screen screen--active',timeout=15000)
                page.locator('.nav-btn[data-tab="profile"]').click()
                button=page.locator('#access-management-btn')
                if role!='ADMIN':
                    expect(button).to_be_hidden();assert page.locator('#access-management-frame').count()==0
                else:
                    expect(button).to_be_visible();expect(button).to_be_enabled()
                    if scenario=='retry':
                        expect(page.locator('#access-management-status')).to_be_visible();flags['fail']=False
                    if scenario=='frame-retry':page.clock.install()
                    button.click()
                    if scenario=='frame-retry':
                        expect(page.locator('#screen-access-admin')).to_be_visible()
                        page.clock.fast_forward(13000)
                        expect(page.locator('#management-frame-retry')).to_be_visible();flags['frameFail']=False
                        page.locator('#management-frame-retry').click()
                    frame=page.frame_locator('#access-management-frame')
                    expect(frame.locator('[data-view="requests"]')).to_be_visible()
                    expect(page.locator('#management-frame-status')).to_be_hidden()
                    assert sum(path=='/api/auth/telegram' for path,_,_ in calls)==1
                    assert all(auth=='Bearer fixture-a' for path,_,auth in calls if path.startswith('/api/access-admin'))
                    assert 'fixture' not in page.locator('#access-management-frame').get_attribute('src')
                    if scenario=='revoked':
                        flags['revoked']=True;frame.locator('[data-view="stats"]').click()
                        expect(page.locator('#access-management-frame')).to_have_count(0);expect(button).to_be_hidden()
                    elif scenario=='parent-revoked':
                        flags['revoked']=True;page.evaluate('renderAccessManagementEntry()')
                        expect(page.locator('#access-management-frame')).to_have_count(0);expect(button).to_be_hidden()
                    elif scenario=='logout':
                        page.evaluate('Api.logout()');expect(page.locator('#access-management-frame')).to_have_count(0);expect(button).to_be_hidden()
                    else:
                        frame.locator('[data-view="stats"]').click()
                        expect(frame.locator('#notice')).to_have_text('')
                        assert frame.locator('main').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
                        if scenario=='owner':page.screenshot(path=str(OUT/f'{engine.name}-embedded-{width}.png'))
                        page.locator('#management-close').click();expect(page.locator('#access-management-frame')).to_have_count(0)
                        expect(page.locator('#tab-profile')).to_be_visible();button.click()
                        expect(page.frame_locator('#access-management-frame').locator('nav')).to_be_visible()
                        page.evaluate('goBack()');expect(page.locator('#access-management-frame')).to_have_count(0)
                        expect(page.locator('#tab-profile')).to_be_visible()
                    assert page.evaluate('getAccessManagementToken()')==''
                assert not errors,errors
                results.append({'engine':engine.name,'scenario':scenario,'width':width,'passed':True})
                ctx.close()
            browser.close()
finally:
    server.shutdown()
    (OUT/'entry-results.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
print(json.dumps({'passed':len(results),'realWrites':0}))
