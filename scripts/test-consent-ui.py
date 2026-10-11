"""Consent entry/retry/reopen: actual bundle, synthetic accounts and API only."""
import ast,json,threading
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output/consent-fix';OUT.mkdir(exist_ok=True)
tree=ast.parse((ROOT/'scripts/test-stage1-ui.py').read_text(encoding='utf-8'));defs=[]
for node in tree.body:
 if isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='server' for t in node.targets):break
 defs.append(node)
scope={'__file__':str(ROOT/'scripts/test-stage1-ui.py')};exec(compile(ast.Module(body=defs,type_ignores=[]),'fixture','exec'),scope)
class Fixture(scope['Fixture']):
 def __init__(self):super().__init__();self.consent=False;self.consent_fail=False;self.consent_requests=[]
 def route(self,route):
  req=route.request
  if req.url.endswith('/me/consent'):
   self.consent_requests.append(req.post_data);assert req.post_data=='{}'
   if self.consent_fail:route.fulfill(status=503,content_type='application/json',body='{"error":"Synthetic failure"}');return
  if req.url.endswith('/habitual/result'):route.fulfill(status=200,content_type='application/json',body='null');return
  super().route(route)
server=ThreadingHTTPServer(('127.0.0.1',0),partial(scope['Quiet'],directory=str(ROOT/'output/app')));threading.Thread(target=server.serve_forever,daemon=True).start();results=[]
try:
 with sync_playwright() as p:
  for engine in [p.chromium,p.webkit]:
   browser=engine.launch()
   for scenario in ['entry','retry','banner']:
    ctx=browser.new_context(viewport={'width':390,'height':844},is_mobile=True);ctx.add_init_script('window.TelegramWebviewProxy={postEvent:()=>{}}');f=Fixture();page=ctx.new_page();page.route('**/api/**',f.route)
    page.goto(f'http://127.0.0.1:{server.server_port}/#tgWebAppPlatform=ios&tgWebAppVersion=8.0');expect(page.locator('#screen-onboarding')).to_have_class('screen screen--active',timeout=15000)
    if scenario=='banner':
     page.evaluate('Storage.setConsentFromServer(false);goTo("home",true);switchTab("profile");renderConsentBanner()');page.locator('#consent-banner-cb').check();page.locator('#consent-banner-btn').click();page.wait_for_function('Storage.isConsentGiven()')
    else:
     page.locator('#consent-cb').check()
     if scenario=='retry':
      f.consent_fail=True;page.locator('#onboarding-start-btn').click();expect(page.locator('#onboarding-start-btn')).to_be_enabled();assert not f.consent;assert not page.evaluate('Storage.isConsentGiven()');f.consent_fail=False
     page.locator('#onboarding-start-btn').click();expect(page.locator('#screen-home')).to_have_class('screen screen--active',timeout=10000)
    assert f.consent and all(x=='{}' for x in f.consent_requests)
    page.reload();expect(page.locator('#screen-home')).to_have_class('screen screen--active',timeout=15000);assert page.evaluate('Storage.isConsentGiven()');results.append({'engine':engine.name,'scenario':scenario,'passed':True});ctx.close()
   browser.close()
finally:server.shutdown();(OUT/'ui-results.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
print(json.dumps({'passed':len(results),'realConsentWrites':0}))
