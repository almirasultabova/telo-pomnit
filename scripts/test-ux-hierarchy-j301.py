"""Meaningful Diary/MyPath browser checks. Only localhost and synthetic API."""
import ast,json,datetime
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output/app-2-refinement';(OUT/'screens').mkdir(parents=True,exist_ok=True)
tree=ast.parse((ROOT/'scripts/test-app-2-refinement.py').read_text(encoding='utf-8'));setup=[]
for n in tree.body:
 if isinstance(n,ast.Try):break
 setup.append(n)
ns={'__file__':str(ROOT/'scripts/test-app-2-refinement.py')};exec(compile(ast.Module(body=setup,type_ignores=[]),'fixture','exec'),ns)
results=[]
def shot(page,engine,width,name,tab):
 scroll=page.locator('#tab-'+tab+' .screen-scroll');scroll.evaluate('e=>e.scrollTop=0');height=scroll.evaluate('e=>e.scrollHeight')+page.locator('#tab-'+tab+' .screen-header').evaluate('e=>e.offsetHeight')+110
 page.set_viewport_size({'width':width,'height':height});style=page.add_style_tag(content=f'html,body,#app{{height:{height}px!important}}');ns['base'].settled(page);page.screenshot(path=str(OUT/'screens'/f'j301-{engine}-{width}-{name}-full.png'));style.evaluate('e=>e.remove()');page.set_viewport_size({'width':width,'height':844});ns['base'].settled(page)
try:
 with ns['sync_playwright']() as pw:
  for engine in [pw.chromium,pw.webkit]:
   browser=engine.launch()
   for width in [320,390,430]:
    ctx=browser.new_context(viewport={'width':width,'height':844},reduced_motion='reduce');page=ctx.new_page();fixture=ns['Fixture']('active');errors=[];calls=[]
    longnote='https://example.test/'+('longsegment'*30)+'\n'+('Наблюдение за собой. '*8)
    fixture.diary=[{'id':f'n{i}','zone':'chest','sensations':['tension'],'createdAt':'2026-10-09T12:00:00Z','note':longnote if i==0 else 'Личное наблюдение '+str(i)} for i in range(20)]
    page.on('pageerror',lambda e:errors.append(str(e)));page.add_init_script('window.TelegramWebviewProxy={postEvent:()=>{}}')
    def route(r):
     if '/api/' in r.request.url:calls.append([r.request.method,r.request.url.split('/api',1)[1]]);fixture.route(r)
     elif r.request.url.startswith('http://127.0.0.1:'):r.continue_()
     else:r.abort()
    page.route('**/*',route);page.goto(f"http://127.0.0.1:{ns['server'].server_port}/#tgWebAppPlatform=ios&tgWebAppVersion=8.0");ns['expect'](page.locator('#screen-home')).to_have_class('screen screen--active',timeout=15000);ns['base'].settled(page)
    page.locator('.nav-btn[data-tab=diary]').click();ns['expect'](page.locator('#start-entry-btn')).to_be_visible();assert page.locator('#start-entry-btn').bounding_box()['height']>=44
    assert page.locator('.recent-disclosure').evaluate('e=>!e.open');assert page.locator('#recent-entries .entry-card').count()==3
    bodyfont=page.locator('#start-entry-btn').evaluate('e=>parseFloat(getComputedStyle(e).fontSize)');titlefont=page.locator('#tab-diary .screen-title').evaluate('e=>parseFloat(getComputedStyle(e).fontSize)');assert bodyfont<=16 and titlefont>bodyfont
    page.locator('#start-entry-btn').click();ns['expect'](page.locator('#screen-body-map')).to_have_class('screen screen--active');ns['back'](page)
    page.evaluate("Storage._diaries.set(Storage._userId,Storage.getDiaryEntries().map((e,i)=>i===0?{...e,date:new Date().toISOString()}:e));renderDiaryTab()")
    ns['expect'](page.locator('#add-entry-btn')).to_be_visible();assert page.locator('#today-card .entry-note').text_content()==longnote
    assert page.locator('#add-entry-btn').evaluate("e=>getComputedStyle(e).backgroundColor")== 'rgb(42, 74, 56)';assert page.locator('#stop-reaction-btn').evaluate("e=>getComputedStyle(e).flexDirection")== 'row';assert page.locator('#today-card').evaluate('e=>e.scrollWidth<=e.clientWidth+1');shot(page,engine.name,width,'diary','diary')
    page.locator('#diary-history-btn').click();ns['base'].settled(page);assert page.locator('#history-list .entry-card').count()==20, {'cards':page.locator('#history-list .entry-card').count(),'entries':page.evaluate('Storage.getDiaryEntries().length'),'screen':page.evaluate('currentScreen')};assert page.locator('#export-pdf-btn').bounding_box()['height']>=44;ns['back'](page)
    page.locator('.nav-btn[data-tab=diag]').click();page.evaluate("Storage._set('habitual_result_v2',JSON.stringify({...Habitual.calculate([4,0,0,0,4,0,0,0,4,0,0,0,4,0,0,0]),syncStatus:'synced',clientId:'fixture',date:new Date().toISOString()}));renderMyPathTab()")
    ns['expect'](page.locator('.diag-result-name')).to_have_text('Замирание');assert page.locator('.habitual-result-disclosure').evaluate('e=>!e.open');page.locator('.habitual-result-disclosure summary').click();ns['expect'](page.locator('.habitual-result-disclosure')).to_contain_text('не устанавливает диагноз');ns['expect'](page.locator('.habitual-result-disclosure')).to_contain_text('Вы чаще отмечали остановку');page.locator('.habitual-result-disclosure summary').click()
    assert page.locator('.path-chart-placeholder circle').count()==0;assert page.locator('.path-chart-placeholder').count()==1;shot(page,engine.name,width,'path-empty','diag')
    page.evaluate("Storage._checkins.set(Storage._userId,[{id:'c1',date:'2026-10-08T12:00:00Z',syncStatus:'synced',legacyScale:false,...Object.fromEntries(CHECKIN_SCALES.map((s,i)=>[s.key,i+2]))}]);renderMyPathTab()")
    assert page.locator('.checkin-chart-svg g[data-scale]').count()==5;assert page.locator('.checkin-chart-svg circle').count()==5;assert page.locator('.path-chart-placeholder').count()==0;shot(page,engine.name,width,'path-data','diag')
    assert page.locator('#tab-diag').evaluate('e=>e.scrollWidth<=e.clientWidth+1');assert not errors,errors;assert all(m=='GET' or p.startswith('/auth/') for m,p in calls),calls
    results.append({'engine':engine.name,'width':width,'passed':True,'primaryButtonFont':bodyfont,'entries':20,'recent':3,'chartScales':5,'chartPoints':5});ctx.close()
   browser.close()
finally:ns['server'].shutdown()
(OUT/'j301-hierarchy-results.json').write_text(json.dumps(results,indent=2),encoding='utf-8');print('J301 hierarchy:',len(results),'cases passed')
