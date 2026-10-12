import ast,json,urllib.parse
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output/app-2-refinement';tree=ast.parse((ROOT/'scripts/test-app-2-refinement.py').read_text(encoding='utf-8'));setup=[]
for n in tree.body:
 if isinstance(n,ast.Try):break
 setup.append(n)
ns={'__file__':str(ROOT/'scripts/test-app-2-refinement.py')};exec(compile(ast.Module(body=setup,type_ignores=[]),'fixture','exec'),ns)
results=[]
try:
 with ns['sync_playwright']() as pw:
  for engine in [pw.chromium,pw.webkit]:
   browser=engine.launch()
   for case in ['signed','server','invalid']:
    ctx=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce');page=ctx.new_page();fixture=ns['Fixture']('active');calls=[];errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)));page.add_init_script('window.TelegramWebviewProxy={postEvent:()=>{}}')
    actual='https://fixture.local/verified-avatar.webp';payload={'id':999,'first_name':'Not identity','photo_url':actual if case=='signed' else 'javascript:alert(1)' if case=='invalid' else None}
    signed=urllib.parse.urlencode({'user':json.dumps(payload),'hash':'synthetic-signature'});None
    held=[]
    def route(r):
     if r.request.url==actual:r.fulfill(status=200,content_type='image/webp',body=(ROOT/'media/app/redesign/leaf-shadow-owner.webp').read_bytes());return
     if '/api/' in r.request.url:
      path=r.request.url.split('/api',1)[1];calls.append([r.request.method,path])
      if path=='/auth/telegram':held.append(r);return
      if path=='/me':r.fulfill(status=200,content_type='application/json',body=json.dumps({'user':{'id':'a','name':'Альмира Султанова','photoUrl':actual if case=='server' else None}}));return
      fixture.route(r)
     elif r.request.url.startswith('http://127.0.0.1:'):r.continue_()
     else:r.abort()
    page.route('**/*',route);page.goto(f"http://127.0.0.1:{ns['server'].server_port}/#tgWebAppData={urllib.parse.quote(signed,safe='')}&tgWebAppPlatform=ios&tgWebAppVersion=8.0",wait_until='domcontentloaded');ns['expect'](page.locator('#screen-splash')).to_have_class('screen screen--active');assert page.locator('.splash-icon svg').count()==1;assert '🫀' not in page.locator('#screen-splash').text_content()
    if engine.name=='webkit' and case=='signed':page.screenshot(path=str(OUT/'screens/j301-webkit-390-splash.png'))
    page.wait_for_function('typeof Api!=="undefined"');assert held
    held[0].fulfill(status=200,content_type='application/json',body=json.dumps({'token':'club-fixture','user':{'id':'a','name':'Альмира Султанова','consentGivenAt':'2026-10-08','photoUrl':actual if case=='server' else None}}))
    ns['expect'](page.locator('#screen-home')).to_have_class('screen screen--active',timeout=15000);ns['base'].settled(page)
    assert page.locator('#home-greeting').text_content()=='Альмира'
    if case=='invalid':assert page.locator('#home-avatar img').count()==0;assert page.locator('#home-avatar svg').count()==1
    else:ns['expect'](page.locator('#home-avatar img')).to_have_attribute('src',actual);page.wait_for_function('document.querySelector("#home-avatar img").naturalWidth>0')
    if engine.name=='webkit' and case=='signed':page.screenshot(path=str(OUT/'screens/j301-webkit-390-main-top.png'))
    page.locator('.nav-btn[data-tab=profile]').click();ns['base'].settled(page)
    assert page.locator('.profile-name').text_content()=='Альмира Султанова'
    if case=='invalid':assert page.locator('.profile-avatar img').count()==0
    else:ns['expect'](page.locator('.profile-avatar img')).to_have_attribute('src',actual)
    page.evaluate('homeUser.photoUrl="https://fixture.local/broken.webp";renderMainTab();renderUserCard()');ns['expect'](page.locator('.profile-avatar img')).to_have_count(0);assert page.locator('.profile-avatar svg').count()==1
    page.evaluate('homeUser={id:"alien",name:"Чужое имя",photoUrl:'+json.dumps(actual)+'};renderUserCard();renderMainTab()');assert page.locator('.profile-avatar img').count()==0;assert page.locator('.profile-name').text_content()=='Участница'
    assert not errors,errors;assert all(method=='GET' or path.startswith('/auth/') for method,path in calls),calls
    results.append({'engine':engine.name,'case':case,'passed':True});ctx.close()
   browser.close()
finally:ns['server'].shutdown()
(OUT/'j301-avatar-results.json').write_text(json.dumps(results,indent=2));print('Avatar/splash:',len(results),'cases signed/server/invalid/broken/mismatched owner; no production writes')
