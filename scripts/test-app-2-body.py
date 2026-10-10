"""Owner body plates: actual app/SDK, synthetic API, no production writes."""
import importlib.util,json,threading,re
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output/app-2-body';(OUT/'screens').mkdir(parents=True,exist_ok=True)
spec=importlib.util.spec_from_file_location('base',ROOT/'scripts/test-app-2-ui.py');base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
server=ThreadingHTTPServer(('127.0.0.1',0),partial(base.Quiet,directory=str(ROOT/'output/app')));threading.Thread(target=server.serve_forever,daemon=True).start();results=[]
try:
 with sync_playwright() as pw:
  for engine in [pw.chromium,pw.webkit]:
   browser=engine.launch()
   for width in [320,390,430]:
    context=browser.new_context(viewport={'width':width,'height':844},reduced_motion='reduce');page=context.new_page();fixture=base.Fixture();fixture.body_posts=[];errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)));page.add_init_script('window.TelegramWebviewProxy={postEvent:()=>{}}')
    def route(req):
     if '/api/' in req.request.url:
      if req.request.method=='POST' and req.request.url.split('/api',1)[1]=='/diary':
       payload=req.request.post_data_json;fixture.body_posts.append(payload)
       row={**payload,'id':'body-'+payload['clientId'],'createdAt':'2026-10-11T00:10:00Z'};fixture.diary.append(row)
       req.fulfill(status=200,content_type='application/json',body=json.dumps(row))
      else:fixture.route(req)
     elif req.request.url.startswith('http://127.0.0.1:'):req.continue_()
     else:req.abort()
    page.route('**/*',route);page.goto(f'http://127.0.0.1:{server.server_port}/#tgWebAppPlatform=ios&tgWebAppVersion=8.0');expect(page.locator('#screen-home')).to_have_class('screen screen--active',timeout=15000);base.settled(page)
    page.locator('#main-body-btn').click();base.settled(page)
    assert page.evaluate('DATA.zones.filter(z=>z.selectable!==false).every(z=>BODY_PLATE_REGIONS[z.id])')
    for view in ['front','back']:
     page.locator('#view-'+('front' if view=='front' else 'back')+'-btn').click()
     expect(page.locator('#zone-continue-btn')).to_be_disabled()
     assert page.locator('#body-figure-svg').get_attribute('viewBox')=='0 0 100 150'
     assert view+'-owner.png' in page.locator('#body-figure-svg image').get_attribute('href')
     ids=page.evaluate('DATA.zones.filter(z=>z.view==="'+view+'"&&z.selectable!==false).map(z=>z.id)')
     assert page.locator('#body-figure-svg [data-zone]').count()==len(ids)
     assert page.locator('#body-zone-list button').count()==len(ids)
     assert page.locator('#screen-body-map .screen-scroll').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
     page.screenshot(path=str(OUT/'screens'/f'{engine.name}-{width}-{view}.png'))
     page.set_viewport_size({'width':width,'height':1150});page.locator('#screen-body-map .screen-scroll').evaluate('e=>e.scrollTop=0')
     page.screenshot(path=str(OUT/'screens'/f'{engine.name}-{width}-{view}-full.png'),full_page=True)
     page.set_viewport_size({'width':width,'height':844})
     page.locator('.body-zone-disclosure summary').click()
     for zone in ids:
      button=page.locator('#body-zone-list [data-zone="'+zone+'"]');button.click()
      assert page.evaluate('draft.zone')==zone
      expect(button).to_have_attribute('aria-pressed','true')
      expect(page.locator('#zone-continue-btn')).to_be_enabled()
      assert button.bounding_box()['height']>=44
     page.locator('.body-zone-disclosure summary').click()
    # Native keyboard activation of a back area, then the genuine save flow.
    target=page.locator('#body-figure-svg [data-zone="lower_back"]');target.focus();target.press('Enter')
    expect(page.locator('#zone-info-name')).to_have_text('Поясница')
    page.evaluate('document.activeElement.blur();document.querySelector("#screen-body-map .screen-scroll").scrollTop=0')
    page.mouse.move(0,0);page.screenshot(path=str(OUT/'screens'/f'{engine.name}-{width}-selected.png'))
    page.locator('#zone-continue-btn').click();base.settled(page)
    page.locator('.sensation-btn[data-sensation="tension"]').click()
    page.locator('#sensations-continue-btn').click();base.settled(page)
    page.locator('#note-textarea').fill('Проверка нового изображения: поясница')
    page.locator('#note-save-btn').click();expect(page.locator('#screen-saved')).to_have_class('screen screen--active',timeout=15000)
    page.wait_for_function("Storage.getRecentEntries(1)[0]?.syncStatus==='synced'")
    assert len(fixture.body_posts)==1,fixture.body_posts
    assert fixture.body_posts[0]['zone']=='lower_back' and fixture.body_posts[0]['sensations']==['tension']
    assert fixture.body_posts[0]['clientId']
    page.reload();expect(page.locator('#screen-home')).to_have_class('screen screen--active',timeout=15000);base.settled(page)
    assert page.evaluate('Storage.getRecentEntries(1)[0].zone')=='lower_back'
    assert len(fixture.body_posts)==1
    assert not errors,errors
    results.append({'engine':engine.name,'width':width,'zones':len(page.evaluate('DATA.zones.filter(z=>z.selectable!==false)')),'passed':True,'diaryPosts':1});context.close()
   # Network failure of the owner's media keeps all existing zone choices usable.
   context=browser.new_context(viewport={'width':390,'height':844});page=context.new_page();fixture=base.Fixture();page.add_init_script('window.TelegramWebviewProxy={postEvent:()=>{}}')
   def fail_media(req):
    if '/api/' in req.request.url:fixture.route(req)
    elif '-owner.png' in req.request.url:req.abort()
    elif req.request.url.startswith('http://127.0.0.1:'):req.continue_()
    else:req.abort()
   page.route('**/*',fail_media);page.goto(f'http://127.0.0.1:{server.server_port}/#tgWebAppPlatform=ios&tgWebAppVersion=8.0');expect(page.locator('#screen-home')).to_have_class('screen screen--active',timeout=15000);page.locator('#main-body-btn').click();base.settled(page)
   expect(page.locator('#body-media-status')).to_be_visible();page.locator('.body-zone-disclosure summary').click();page.locator('#body-zone-list [data-zone="chest"]').click();expect(page.locator('#zone-continue-btn')).to_be_enabled();page.screenshot(path=str(OUT/'screens'/f'{engine.name}-media-failure.png'));results.append({'engine':engine.name,'case':'media-failure','passed':True});context.close();browser.close()
finally:server.shutdown()
(OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'passed':len(results),'synthetic':True}))
