import ast,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output/app-2-refinement'
tree=ast.parse((ROOT/'scripts/test-app-2-refinement.py').read_text(encoding='utf-8'));setup=[]
for n in tree.body:
 if isinstance(n,ast.Try):break
 setup.append(n)
ns={'__file__':str(ROOT/'scripts/test-app-2-refinement.py')};exec(compile(ast.Module(body=setup,type_ignores=[]),'fixture','exec'),ns)
results=[]
try:
 with ns['sync_playwright']() as pw:
  for engine in [pw.chromium,pw.webkit]:
   browser=engine.launch()
   for width in [320,390,430]:
    context=browser.new_context(viewport={'width':width,'height':844});page=context.new_page();fixture=ns['Fixture']('active');fixture.diary=[{'id':'long-note','zone':'chest','sensations':['tension'],'createdAt':'2026-10-09T12:00:00Z','note':'https://example.test/'+('longsegment'*30)+'\n'+('Длинное личное наблюдение. '*50)}];errors=[];calls=[]
    page.on('pageerror',lambda e:errors.append(str(e)));page.add_init_script('window.TelegramWebviewProxy={postEvent:()=>{}}')
    def route(r):
     if '/api/' in r.request.url:calls.append([r.request.method,r.request.url.split('/api',1)[1]]);fixture.route(r)
     elif r.request.url.startswith('http://127.0.0.1:'):r.continue_()
     else:r.abort()
    page.route('**/*',route);page.goto(f'http://127.0.0.1:{ns["server"].server_port}/#tgWebAppPlatform=ios&tgWebAppVersion=8.0');ns['expect'](page.locator('#screen-home')).to_have_class('screen screen--active',timeout=15000)
    page.locator('.nav-btn[data-tab=diary]').click();page.locator('#diary-history-btn').click();ns['base'].settled(page)
    history=page.locator('#history-list').evaluate('e=>({width:e.clientWidth,content:e.scrollWidth})');exact=page.locator('#history-list .entry-note').first.text_content();assert exact==fixture.diary[0]['note'];assert history['content']<=history['width']
    if width==320:page.screenshot(path=str(OUT/'screens'/f'j291-{engine.name}-history.png'))
    ns['back'](page);page.locator('#ai-chat-btn').click();page.locator('#ai-input').fill('Длинное сообщение\n'+('Наблюдение за состоянием.\n'*80));page.set_viewport_size({'width':width,'height':320});ns['base'].settled(page)
    box=page.locator('#ai-send-btn').bounding_box();messages=page.locator('#ai-messages').bounding_box();bar=page.locator('#ai-input-bar').bounding_box()
    if width==320:page.screenshot(path=str(OUT/'screens'/f'j291-{engine.name}-ai-small.png'))
    assert box['y']>=0 and box['y']+box['height']<=320,{'button':box,'messages':messages,'bar':bar,'history':history};assert messages['height']>=48;assert page.locator('#ai-input').input_value().endswith('Наблюдение за состоянием.\n');assert not errors,errors;assert all(m=='GET' or p.startswith('/auth/') for m,p in calls),calls
    results.append({'engine':engine.name,'width':width,'history':history,'conversationHeight':messages['height'],'composerHeight':bar['height'],'sendVisible':True});context.close()
   browser.close()
finally:ns['server'].shutdown()
(OUT/'j291-results.json').write_text(json.dumps(results,indent=2),encoding='utf-8');print(json.dumps(results,indent=2))
