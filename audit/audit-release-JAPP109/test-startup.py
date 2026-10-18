"""Exercise startup with Telegram bridge and API fixtures; never use personal data."""
import json
import os
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parents[2] / 'output/silk-launch-release'
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(root / 'output/app')))
threading.Thread(target=server.serve_forever, daemon=True).start()
base_url = os.environ.get('APP_TEST_BASE_URL', f'http://127.0.0.1:{server.server_port}/')
url = base_url + '#tgWebAppPlatform=ios&tgWebAppVersion=8.0'
results = []
scenarios = os.environ.get('APP_TEST_SCENARIOS', 'success,parallel-load,blocked-storage,returning-user,fresh-user,network-failure,body-timeout,runtime-error,access-denied').split(',')
try:
    with sync_playwright() as p:
        for engine in (p.chromium, p.webkit):
            browser = engine.launch()
            for scenario in scenarios:
                print(f'Checking {engine.name}: {scenario}', flush=True)
                page = browser.new_page(viewport={'width': 375, 'height': 667}, is_mobile=True)
                errors = []
                page.on('pageerror', lambda e: errors.append(str(e)))
                page.add_init_script("window.bridgeEvents=[]; window.TelegramWebviewProxy={postEvent:(name,data)=>window.bridgeEvents.push(name)};")
                if scenario == 'blocked-storage':
                    page.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new Error('Storage unavailable')}})")
                if scenario == 'runtime-error':
                    # Break the actual entry renderer: unrelated event-handler errors
                    # can be superseded by a successful startup and are not its failure.
                    page.add_init_script("document.addEventListener('DOMContentLoaded',()=>{window.renderDiaryTab=()=>{throw new Error('fixture renderer failure')}})")
                if scenario == 'body-timeout':
                    page.add_init_script("window.fetch=(url,options)=>Promise.resolve({ok:true,status:200,json:()=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('fixture body stalled'))))})")
                if scenario == 'parallel-load':
                    page.add_init_script("""
                      const originalFetch=window.fetch;
                      window.startupCalls=[];
                      window.fetch=(url,options)=>{
                        window.startupCalls.push(String(url));
                        if(String(url).startsWith('/api/diary')) return new Promise(resolve=>{
                          const timer=setInterval(()=>{
                            if(window.startupCalls.includes('/api/me/enrollment/access')&&window.startupCalls.includes('/api/me')){
                              clearInterval(timer);resolve(originalFetch(url,options));
                            }
                          },10);
                        });
                        return originalFetch(url,options);
                      };
                    """)
                def api(route):
                    path = route.request.url.split('/api', 1)[1]
                    if scenario == 'access-denied':
                        route.fulfill(status=403, content_type='application/json', body='{"error":"Аккаунт удалён"}')
                        return
                    if scenario == 'network-failure':
                        route.abort()
                        return
                    payload = {
                        '/auth/telegram': {'token': 'fixture', 'user': {'id':'fixture-user', 'name':'Test', 'consentGivenAt':'2026-10-05'}},
                        '/diary?limit=90': [], '/diagnostic/result': None,
                        '/triggers?limit=90': [], '/checkins?limit=200': [],
                        '/me/enrollment/access': {'ai': {'allowed':False, 'message':'Нет оплаченной программы'}, 'streams':[]},
                        '/me': {'name':'Test'},
                    }.get(path, {})
                    if scenario == 'fresh-user' and path == '/auth/telegram':
                        payload = {'token':'fixture', 'user':{'id':'fixture-user','name':'New', 'consentGivenAt':None}}
                    if scenario in ('returning-user','blocked-storage') and path == '/diary?limit=90':
                        payload = [{'id':'existing-record','createdAt':'2026-10-04T15:00:00.000Z','zone':'chest','sensations':[], 'note':'Сохранённая запись до повторного входа'}]
                    route.fulfill(status=200, content_type='application/json', body=json.dumps(payload))
                page.route('**/api/**', api)
                requests = []
                page.on('request', lambda r: requests.append(r.url))
                page.goto(url, wait_until='domcontentloaded')
                assert 'web_app_ready' in page.evaluate('window.bridgeEvents'), 'Telegram ready missing'
                if scenario in ('success', 'parallel-load', 'blocked-storage', 'returning-user'):
                    expect(page.locator('#screen-home')).to_have_class('screen screen--active', timeout=10000)
                    expect(page.locator('#startup-error')).to_be_hidden()
                    assert not errors, errors
                    # The old offer was scheduled 400ms AFTER home. Exercise that delayed behavior.
                    page.wait_for_timeout(600)
                    expect(page.locator('#offer-modal')).to_be_hidden()
                    expect(page.locator('#screen-onboarding')).not_to_have_class('screen screen--active')
                    if scenario in ('returning-user','blocked-storage'):
                        assert page.evaluate("()=>Storage.getDiaryEntries().some(row=>row.note==='Сохранённая запись до повторного входа')"), 'Saved history missing after startup'
                        assert page.evaluate("()=>Storage.getDiaryEntries().every(row=>Number.isFinite(Date.parse(row.date)))"), 'Invalid restored date'

                elif scenario == 'fresh-user':
                    expect(page.locator('#screen-onboarding')).to_have_class('screen screen--active', timeout=10000)
                    expect(page.locator('#onboarding-start-btn')).to_be_disabled()
                elif scenario == 'access-denied':
                    expect(page.get_by_text('У вас нет доступа к приложению.', exact=False)).to_be_visible(timeout=10000)
                    expect(page.locator('#startup-error')).to_be_hidden()
                else:
                    expect(page.locator('#startup-error')).to_be_visible(timeout=14000)
                    expect(page.get_by_role('button', name='Повторить загрузку')).to_be_visible()
                assert not any('/js/' in r or '/css/' in r for r in requests), 'Startup depends on external assets'
                results.append({'engine':engine.name, 'scenario':scenario, 'passed':True})
                page.close()
            browser.close()
finally:
    server.shutdown()
(root / 'output/app-startup-results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(results, ensure_ascii=False))
