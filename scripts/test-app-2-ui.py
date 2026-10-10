"""Real local build screenshots/layout checks; synthetic API, no external writes."""
import ast
import hashlib
import json
import os
import threading
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
tree = ast.parse((ROOT / 'scripts/test-stage3-ui.py').read_text(encoding='utf-8'))
definitions = []
for statement in tree.body:
    if isinstance(statement, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'server' for t in statement.targets):
        break
    definitions.append(statement)
scope = {'__file__': str(ROOT / 'scripts/test-stage3-ui.py')}
exec(compile(ast.Module(body=definitions, type_ignores=[]), 'fixture', 'exec'), scope)
Base, Quiet = scope['Fixture'], scope['Quiet']


class Fixture(Base):
    def route(self, route):
        path = route.request.url.split('/api', 1)[1]
        if path == '/habitual/result':
            route.fulfill(status=200, content_type='application/json', body='null')
        else:
            super().route(route)


def settled(page):
    page.wait_for_function("!document.querySelector('.screen--enter,.screen--enter-back,.screen--exit,.screen--exit-back')")
    page.evaluate('document.fonts.ready')
    page.evaluate("Promise.all([document.fonts.load('500 32px \"Cormorant Garamond\"','Главная'),document.fonts.load('400 16px Manrope','Дневник')])")


def run():
    baseline = os.environ.get('APP2_BASELINE') == '1'
    out = ROOT / os.environ.get('APP2_QA_OUT', 'output/app-2-qa/baseline/screens' if baseline else 'output/app-2-qa/after/screens')
    out.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT / 'output/app')))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    results = []
    try:
        with sync_playwright() as pw:
            for engine in (pw.chromium, pw.webkit):
                browser = engine.launch()
                sizes = [(390, 844)] if baseline else [(320, 568), (375, 667), (390, 844), (430, 932), (844, 390), (1280, 900)]
                for width, height in sizes:
                    context = browser.new_context(viewport={'width': width, 'height': height}, reduced_motion='reduce', color_scheme='dark' if width == 430 else 'light')
                    page = context.new_page()
                    errors, escaped = [], []
                    page.on('pageerror', lambda e: errors.append(str(e)))
                    page.add_init_script('window.TelegramWebviewProxy={postEvent:()=>{}}')
                    fixture = Fixture()
                    def route_all(route):
                        if '/api/' in route.request.url:
                            fixture.route(route)
                        elif route.request.url.startswith(f'http://127.0.0.1:{server.server_port}/'):
                            route.continue_()
                        else:
                            escaped.append(route.request.url); route.abort()
                    page.route('**/*', route_all)
                    page.goto(f'http://127.0.0.1:{server.server_port}/#tgWebAppPlatform=ios&tgWebAppVersion=8.0')
                    expect(page.locator('#screen-home')).to_have_class('screen screen--active', timeout=15000)
                    states = [('diary', 'diary'), ('path', 'diag'), ('profile', 'profile')]
                    if not baseline:
                        states.insert(0, ('main', 'main'))
                    for name, tab in states:
                        page.locator(f'.nav-btn[data-tab="{tab}"]').click()
                        settled(page)
                        if not baseline:
                            assert page.locator('.nav-btn').count() == 4
                            assert page.locator('.nav-btn--active').count() == 1
                            assert page.locator(f'.nav-btn[data-tab="{tab}"]').get_attribute('aria-current') == 'page'
                            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                            assert page.evaluate("document.querySelector('.bottom-nav').getBoundingClientRect().bottom<=innerHeight+1")
                            assert page.evaluate("document.querySelector('.tab-pane--active .screen-scroll').scrollWidth<=document.querySelector('.tab-pane--active .screen-scroll').clientWidth+1")
                        page.screenshot(path=str(out / f'{engine.name}-{width}x{height}-{name}.png'))
                        if not baseline and width == 320 and name == 'main':
                            page.locator('#main-state-btn').scroll_into_view_if_needed()
                            page.screenshot(path=str(out / f'{engine.name}-{width}x{height}-main-scrolled.png'))
                    page.locator('.nav-btn[data-tab="diary"]').click()
                    page.evaluate("draft.zone='chest';draft.sensations=['tension'];goTo('note')")
                    settled(page)
                    page.screenshot(path=str(out / f'{engine.name}-{width}x{height}-note.png'))
                    if not baseline:
                        assert page.locator('#note-textarea').evaluate("el=>parseFloat(getComputedStyle(el).fontSize)") >= 16
                        assert page.locator('#note-save-btn').evaluate('el=>el.getBoundingClientRect().height') >= 52
                        assert page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim()") == '#F7F4EF'
                        assert page.evaluate("document.fonts.check('500 32px \"Cormorant Garamond\"','Главная')")
                        assert page.evaluate("document.fonts.check('400 16px Manrope','Дневник')")
                    assert not errors, errors
                    assert not escaped, escaped
                    results.append({'engine': engine.name, 'viewport': [width, height], 'states': [n for n, _ in states] + ['note'], 'passed': True, 'pageErrors': errors, 'externalRequests': escaped})
                    context.close()
                if not baseline:
                    context = browser.new_context(viewport={'width':320,'height':568},reduced_motion='reduce')
                    page = context.new_page(); fixture = Fixture(); failed_assets=[]
                    page.add_init_script('window.TelegramWebviewProxy={postEvent:()=>{}}')
                    def fallback_route(route):
                        url=route.request.url
                        if '/api/' in url: fixture.route(route)
                        elif '.woff2' in url or '/redesign/' in url: failed_assets.append(url);route.abort()
                        elif url.startswith(f'http://127.0.0.1:{server.server_port}/'):route.continue_()
                        else:raise AssertionError('External request: '+url)
                    page.route('**/*',fallback_route)
                    page.goto(f'http://127.0.0.1:{server.server_port}/#tgWebAppPlatform=ios&tgWebAppVersion=8.0')
                    expect(page.locator('#screen-home')).to_have_class('screen screen--active',timeout=15000)
                    page.evaluate("document.documentElement.style.setProperty('--safe-bottom','24px')")
                    assert page.locator('.bottom-nav').evaluate('el=>el.getBoundingClientRect().height')==96
                    page.locator('#main-state-btn').scroll_into_view_if_needed()
                    page.locator('#main-state-btn').focus()
                    assert page.locator('#main-state-btn').evaluate('el=>getComputedStyle(el).outlineStyle')=='solid'
                    page.screenshot(path=str(out / f'{engine.name}-320x568-fallback-main.png'))
                    page.locator('#main-state-btn').click()
                    expect(page.locator('#screen-checkin')).to_have_class('screen screen--active',timeout=15000)
                    assert page.locator('#checkin-scales input[type=range]').count()==5
                    assert len(failed_assets)>0
                    results.append({'engine':engine.name,'viewport':[320,568],'case':'fonts-image-failure-safe-area-keyboard','passed':True})
                    context.close()
                browser.close()
    finally:
        server.shutdown()
        (out.parent / 'ui-results.json').write_text(json.dumps({'bundleSha256': hashlib.sha256((ROOT/'output/app/index.html').read_bytes()).hexdigest(), 'baseline': baseline, 'results': results}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'PASS UI: {len(results)} engine/viewport cases; baseline={baseline}; synthetic API only')


if __name__ == '__main__':
    run()
