"""Current local build, synthetic API only; real UI actions and delayed transport."""
import ast,json,threading
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output/reliability';OUT.mkdir(parents=True,exist_ok=True)
tree=ast.parse((ROOT/'scripts/test-app-2-stream.py').read_text(encoding='utf-8'));defs=[]
for item in tree.body:
 if isinstance(item,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='server' for t in item.targets):break
 defs.append(item)
ns={'__file__':str(ROOT/'scripts/test-app-2-stream.py')};exec(compile(ast.Module(body=defs,type_ignores=[]),'fixture','exec'),ns);Fixture,base=ns['Fixture'],ns['base']
server=ThreadingHTTPServer(('127.0.0.1',0),partial(base.Quiet,directory=str(ROOT/'output/app')));threading.Thread(target=server.serve_forever,daemon=True).start();results=[]
try:
 with sync_playwright() as pw:
  for engine in [pw.chromium,pw.webkit]:
   browser=engine.launch()
   for width in [390,768,1440]:
    ctx=browser.new_context(viewport={'width':width,'height':1000},reduced_motion='reduce');page=ctx.new_page();fixture=Fixture('active');errors=[];submitted=[]
    page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept());page.add_init_script('window.TelegramWebviewProxy={postEvent:()=>{}}')
    page.add_init_script("const nativeFetch=window.fetch;window.fetch=(url,...args)=>String(url).includes('/habitual/result')?new Promise(resolve=>window.releaseHabitual=()=>resolve(new Response('null',{status:200,headers:{'Content-Type':'application/json'}}))):nativeFetch(url,...args);")
    def route(r):
     if '/api/' in r.request.url:
      path=r.request.url.split('/api',1)[1]
      if path.startswith('/questionnaires/') and r.request.method=='GET':r.fulfill(status=200,content_type='application/json',body='{"pre":null,"post":null}')
      elif path=='/questionnaires/pre':submitted.append(r.request.post_data_json);r.fulfill(status=200,content_type='application/json',body='{"id":"synthetic"}')
      else:fixture.route(r)
     elif r.request.url.startswith(f'http://127.0.0.1:{server.server_port}/'):r.continue_()
     else:r.abort()
    page.route('**/*',route);url=f'http://127.0.0.1:{server.server_port}/#tgWebAppPlatform=ios&tgWebAppVersion=8.0';page.goto(url);expect(page.locator('#screen-home')).to_have_class('screen screen--active',timeout=15000)
    page.locator('.nav-btn[data-tab="profile"]').click();expect(page.locator('.q-banner')).to_be_visible();page.locator('.q-banner').click();page.locator('#q-next-btn').click();assert page.evaluate('qStep')==0;assert not submitted
    page.screenshot(path=str(OUT/f'{engine.name}-{width}-questionnaire-required.png'))
    page.locator('#qf-name').fill('Синтетическое имя')
    for name in ['age','occupation','familyStatus','hasChildren']:page.locator(f'input[name="qf-{name}"]').first.locator('..').click()
    page.locator('#q-next-btn').click();page.locator('input[name="qf-source"]').first.locator('..').click()
    choice=page.locator('input[name="qf-whatCaughtAttention"]').first;choice.focus();page.keyboard.press('Space');assert choice.is_checked();page.keyboard.press('Space');assert not choice.is_checked()
    page.locator('#q-next-btn').click();page.locator('#q-back-btn').click();assert not page.locator('input[name="qf-whatCaughtAttention"]').first.is_checked()
    page.locator('.q-close-btn').click();page.locator('.q-banner').click();assert page.evaluate('qStep')==1;page.locator('#q-back-btn').click();assert page.locator('#qf-name').input_value()=='Синтетическое имя';page.locator('.q-close-btn').click()
    page.reload();expect(page.locator('#screen-home')).to_have_class('screen screen--active',timeout=15000);page.locator('.nav-btn[data-tab="profile"]').click();expect(page.locator('.q-banner')).to_be_visible();page.locator('.q-banner').click();assert page.locator('#qf-name').input_value()=='Синтетическое имя'
    for _ in range(6):page.locator('#q-next-btn').click()
    expect(page.locator('.q-done')).to_be_visible();assert len(submitted)==1;assert submitted[0]['answers']['whatCaughtAttention']==[]
    page.locator('.questionnaire-footer button').click();page.locator('.nav-btn[data-tab="profile"]').click();page.locator('#open-feedback-btn').click();page.locator('#fb-text').fill('Черновик');page.evaluate('goBack()');page.locator('#open-feedback-btn').click();assert page.locator('#fb-text').input_value()=='Черновик'
    page.evaluate('window.calls=[];Api.sendFeedback=p=>new Promise(resolve=>calls.push({p,resolve}));void 0');page.locator('#fb-submit').click();page.locator('#fb-text').fill('Новый текст');expect(page.locator('#fb-submit')).to_be_disabled();page.evaluate('submitFeedback()');assert page.evaluate('calls.length')==1;page.evaluate('calls[0].resolve({ok:true,id:"late"});void 0');expect(page.locator('#fb-submit')).to_be_enabled();expect(page.locator('#feedback-thanks')).to_be_hidden();assert page.locator('#fb-text').input_value()=='Новый текст'
    assert page.evaluate('Array.from(document.querySelectorAll(".screen:not(.screen--active)")).every(s=>s.inert&&s.getAttribute("aria-hidden")==="true")');assert not errors,errors
    page.screenshot(path=str(OUT/f'{engine.name}-{width}-feedback.png'));results.append({'engine':engine.name,'width':width,'pass':True});print(engine.name,width,'PASS',flush=True);ctx.close()
   browser.close()
finally:server.shutdown()
(OUT/'results.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
