import ast,json,datetime
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output/app-2-refinement'
tree=ast.parse((ROOT/'scripts/test-app-2-refinement.py').read_text(encoding='utf-8'));setup=[]
for n in tree.body:
 if isinstance(n,ast.Try):break
 setup.append(n)
ns={'__file__':str(ROOT/'scripts/test-app-2-refinement.py')};exec(compile(ast.Module(body=setup,type_ignores=[]),'fixture','exec'),ns)

results=[]
def shots(page,engine,width,name,tab):
 page.locator('#tab-'+tab+' .screen-scroll').evaluate('e=>e.scrollTop=0');page.screenshot(path=str(OUT/'screens'/f'j301-{engine}-{width}-{name}-top.png'))
 scroll=page.locator('#tab-'+tab+' .screen-scroll');height=scroll.evaluate('e=>e.scrollHeight')+page.locator('#tab-'+tab+' .screen-header').evaluate('e=>e.offsetHeight')+110
 page.set_viewport_size({'width':width,'height':height});style=page.add_style_tag(content=f'html,body,#app{{height:{height}px!important}}');ns['base'].settled(page);page.screenshot(path=str(OUT/'screens'/f'j301-{engine}-{width}-{name}-full.png'));style.evaluate('e=>e.remove()');page.set_viewport_size({'width':width,'height':844});ns['base'].settled(page)
try:
 with ns['sync_playwright']() as pw:
  for engine in [pw.chromium,pw.webkit]:
   browser=engine.launch()
   for width,state in [(320,'active'),(390,'active'),(430,'active'),(390,'new'),(390,'upcoming'),(390,'completed'),(390,'between'),(390,'staff'),(390,'error')]:
    ctx=browser.new_context(viewport={'width':width,'height':844},reduced_motion='reduce');page=ctx.new_page();fixture=ns['Fixture'](state);errors=[];calls=[]
    page.on('pageerror',lambda e:errors.append(str(e)));page.add_init_script('window.TelegramWebviewProxy={postEvent:()=>{}}')
    def route(r):
     if '/api/' in r.request.url:
      path=r.request.url.split('/api',1)[1];calls.append([r.request.method,path])
      if path=='/me/enrollment/access' and state!='error':
       completed=state in ['completed','between'];upcoming=state=='upcoming';current=not completed and not upcoming
       stream={'id':'own-stream','name':'Осенний поток','startDate':'2026-10-15' if upcoming else '2026-09-01' if completed else '2026-10-01','endDate':'2026-11-12' if upcoming else '2026-10-01' if completed else '2026-10-31','phase':'upcoming' if upcoming else 'completed' if completed else 'current','recordingsExpiresAt':'2026-12-01T00:00:00+03:00','canAttend':current,'canReadRecordings':state!='between','zoomLink':'https://zoom.us/j/000000000','chatLink':'https://t.me/test_stream','meetings':[{'id':'m1','date':'2026-10-15T16:00:00Z','topic':'Тело и привычная реакция','description':'Описание из API. '+('Подробное содержание встречи. '*6),'prepare':'Подготовка из API.','zoomLink':'https://zoom.us/j/000000001'}]}
       old={**stream,'id':'own-old','name':'Предыдущий поток','startDate':'2026-09-01','endDate':'2026-09-30','phase':'completed','canAttend':False,'canReadRecordings':False,'meetings':[]}
       r.fulfill(status=200,content_type='application/json',body=json.dumps({'serverTime':'2026-10-10T10:00:00Z','streams':[] if state=='new' else [stream,old],'ai':{'canWrite':state in ['active','staff'],'message':'Тестовое состояние доступа'}}))
      elif path.startswith('/questionnaires/') and r.request.method=='GET':r.fulfill(status=200,content_type='application/json',body=json.dumps({'pre':None,'post':None}))
      else:fixture.route(r)
     elif r.request.url.startswith('http://127.0.0.1:'):r.continue_()
     else:r.abort()
    page.route('**/*',route);page.goto(f"http://127.0.0.1:{ns['server'].server_port}/#tgWebAppPlatform=ios&tgWebAppVersion=8.0");ns['expect'](page.locator('#screen-home')).to_have_class('screen screen--active',timeout=15000);ns['base'].settled(page);page.locator('.nav-btn[data-tab=diag]').click();ns['base'].settled(page)
    assert page.locator('#tab-diag').evaluate('e=>e.scrollWidth<=e.clientWidth+1');assert page.locator('#path-stream-select option').count()==(0 if state in ['new','error'] else 2)
    if state=='error':ns['expect'](page.locator('#diag-tab-content')).to_contain_text('в Профиле')
    if state=='active':shots(page,engine.name,width,'path','diag')
    page.locator('#path-program-btn').click();ns['base'].settled(page);assert page.evaluate('activeTab')=='profile'
    page.evaluate("homeUser.name='Альмира Султанова';renderMainTab();renderUserCard()")
    assert page.locator('.profile-name').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
    assert page.locator('#home-greeting').text_content()=='Альмира'
    assert page.locator('#profile-account-actions #data-rights-btn').count()==1
    if state in ['new','error']:ns['expect'](page.locator('.profile-program-access')).to_be_hidden()
    assert page.locator('.profile-identity').bounding_box()['y']<page.locator('.profile-program').bounding_box()['y']
    assert page.locator('.profile-closing,.profile-quote,.profile-meta').count()==0
    assert page.locator('#profile-stats .stat-box').count()==2
    assert page.locator('#profile-account-actions').evaluate('e=>!!(document.querySelector("#hosts-list").compareDocumentPosition(e)&Node.DOCUMENT_POSITION_FOLLOWING)')
    page.locator('#open-feedback-btn').click();ns['expect'](page.locator('#screen-feedback')).to_have_class('screen screen--active');ns['back'](page);assert page.evaluate('activeTab')=='profile'
    shots(page,engine.name,width,'profile-'+state,'profile')
    if state not in ['new','error']:
     ns['expect'](page.locator('#owned-stream-select')).to_have_value('own-stream');page.locator('.access-meeting summary').click();ns['expect'](page.locator('.access-meeting')).to_contain_text('Подготовка из API.');ns['expect'](page.locator('.meeting-summary-topic')).to_have_text('Тело и привычная реакция')
     links=page.locator('.access-meeting a[href*=zoom]');assert links.count()==(1 if state in ['active','staff'] else 0)
     page.locator('.meeting-attendance').click();ns['expect'](page.locator('.meeting-attendance')).to_have_attribute('aria-pressed','true');assert page.locator('.access-meeting').evaluate('e=>e.open')
     if state=='active':
      page.locator('.access-meeting').screenshot(path=str(OUT/'screens'/f'j301-{engine.name}-{width}-meeting.png'))
      page.wait_for_function('qStatusVerified===true');page.evaluate('renderQuestionnaireBanner()')
      page.locator('.q-banner').focus();page.locator('.q-banner').press('Enter');ns['expect'](page.locator('#screen-questionnaire')).to_have_class('screen screen--active');ns['back'](page);assert page.evaluate('activeTab')=='profile'
      shots(page,engine.name,width,'profile','profile')
     if state=='staff':assert page.locator('.q-banner').count()==0;ns['expect'](page.locator('#q-banner-wrap')).to_contain_text('Вы вошли как ведущая')
     page.locator('#owned-stream-select').select_option('own-old');assert page.evaluate('selectedProgramId')=='own-old';assert page.locator('#path-stream-select').input_value()=='own-old';assert page.locator('#zoom-btn-wrap a[href*=zoom]').count()==0;assert page.locator('.access-meeting').count()==0;ns['expect'](page.locator('#schedule-section')).to_contain_text('Расписание вашего потока уточняется')
     page.locator('.nav-btn[data-tab=diag]').click();ns['base'].settled(page);ns['expect'](page.locator('#diag-tab-content')).to_contain_text('Архив потока');assert page.evaluate('Storage.getDiaryEntries().length')==(0 if state=='new' else 1)
    else:assert page.locator('#zoom-btn-wrap a[href*=zoom]').count()==0
    assert not errors,errors;assert all(method=='GET' or path.startswith('/auth/') for method,path in calls),calls
    results.append({'engine':engine.name,'width':width,'state':state,'passed':True});ctx.close()
   browser.close()
finally:ns['server'].shutdown()
(OUT/'j301-results.json').write_text(json.dumps(results,indent=2));print('J301:',len(results),'cases; own stream switching, archive, meeting disclosure/attendance, gated Zoom, questionnaire keyboard/Back, staff/no-stream/error; no production writes')
