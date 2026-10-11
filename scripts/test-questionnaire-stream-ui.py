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
    context=browser.new_context(viewport={'width':width,'height':844});page=context.new_page();fixture=ns['Fixture']('active');errors=[];calls=[];saved=[]
    page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept());page.add_init_script('window.TelegramWebviewProxy={postEvent:()=>{}}')
    def route(r):
     if '/api/' in r.request.url:
      path=r.request.url.split('/api',1)[1];calls.append([r.request.method,path])
      if path=='/me/enrollment/access':
       stream={'id':'own-stream','name':'Поток А','startDate':'2026-10-01','endDate':'2026-10-31','phase':'current','canAttend':True,'canReadRecordings':True,'recordingsExpiresAt':'2026-12-01T00:00:00Z','meetings':[]}
       r.fulfill(status=200,content_type='application/json',body=json.dumps({'serverTime':'2026-10-11T08:00:00Z','streams':[stream,{**stream,'id':'own-old','name':'Поток Б'}],'ai':{'canWrite':True}}))
      elif path.startswith('/questionnaires/') and r.request.method=='GET':r.fulfill(status=200,content_type='application/json',body=json.dumps({'pre':{'id':'filled'} if path.endswith('own-stream') else None,'post':None}))
      elif path=='/questionnaires/pre':
       saved.append(r.request.post_data_json);r.fulfill(status=200,content_type='application/json',body=json.dumps({'id':'saved'}))
      else:fixture.route(r)
     elif r.request.url.startswith('http://127.0.0.1:'):r.continue_()
     else:r.abort()
    page.route('**/*',route);page.goto(f'http://127.0.0.1:{ns["server"].server_port}/#tgWebAppPlatform=ios&tgWebAppVersion=8.0');ns['expect'](page.locator('#screen-home')).to_have_class('screen screen--active',timeout=15000)
    page.locator('.nav-btn[data-tab=profile]').click();ns['expect'](page.locator('#q-banner-wrap')).to_contain_text('Анкета этого потока заполнена.')
    if width==390:page.screenshot(path=str(OUT/'screens'/f'j289-{engine.name}-filled.png'))
    page.evaluate('Storage.setQuestionnaireDone()');page.locator('#owned-stream-select').select_option('own-old');ns['expect'](page.locator('.q-banner')).to_be_visible();assert page.evaluate('qStreamId')=='own-old'
    if width==390:page.screenshot(path=str(OUT/'screens'/f'j289-{engine.name}-unfilled.png'))
    page.locator('.q-banner').focus();page.locator('.q-banner').press('Enter');ns['expect'](page.locator('#screen-questionnaire')).to_have_class('screen screen--active');ns['back'](page);assert page.evaluate('activeTab')=='profile'
    # No speculative writes during startup/selection. Legacy local flag cannot skip GET.
    assert not saved;assert sum(m=='GET' and p.startswith('/questionnaires/') for m,p in calls)==3,calls
    page.evaluate("window.qDeferred=[];Api.getQuestionnaireStatus=id=>new Promise((resolve,reject)=>qDeferred.push({id,resolve,reject}));selectProgram('own-stream');selectProgram('own-old')")
    ns['expect'](page.locator('#q-banner-wrap')).to_contain_text('Проверяем');assert not page.locator('.q-banner').count()
    page.evaluate('qDeferred[1].resolve({pre:null})');ns['expect'](page.locator('.q-banner')).to_be_visible();page.evaluate('qDeferred[0].resolve({pre:{id:"old"}})');assert page.evaluate('qStatusDone')==False
    page.evaluate("selectProgram('own-stream');qDeferred[2].reject(new Error('network'))");ns['expect'](page.locator('#q-status-retry')).to_be_visible();assert not page.locator('.q-banner').count()
    if width==390:page.screenshot(path=str(OUT/'screens'/f'j289-{engine.name}-error.png'))
    page.locator('#q-status-retry').click();page.evaluate('qDeferred[3].resolve({pre:null})');ns['expect'](page.locator('.q-banner')).to_be_visible()
    # Owner/generation guards for stale responses and already loaded status.
    page.evaluate("window.qOwner=Api.userId;window.qGeneration=Api._authGeneration;selectProgram('own-old');Api.userId='other';Api._authGeneration++;qDeferred[4].resolve({pre:null});renderQuestionnaireBanner();openQuestionnaire()")
    assert page.locator('.q-banner').count()==0;assert page.evaluate('currentScreen')=='home'
    page.evaluate("Api.userId=qOwner;Api._authGeneration=qGeneration;Api.getQuestionnaireStatus=async()=>({pre:null});checkAndShowQuestionnaire('own-old')");ns['expect'](page.locator('.q-banner')).to_be_visible()
    # Successful submission targets the verified opened stream, not a mutable selection.
    page.locator('.q-banner').click();page.evaluate('qAnswers={test:"synthetic"};submitQuestionnaire()');ns['expect'](page.locator('.q-done')).to_be_visible();assert saved==[{'streamId':'own-old','answers':{'test':'synthetic'}}];page.locator('.questionnaire-footer button').click()
    ns['expect'](page.locator('#q-banner-wrap')).to_contain_text('Анкета этого потока заполнена.');page.locator('#owned-stream-select').select_option('own-stream');ns['expect'](page.locator('.q-banner')).to_be_visible();page.locator('.q-banner').click();ns['expect'](page.locator('#q-next-btn')).to_be_visible();assert not page.locator('.q-done').count()
    # Failure preserves answers; a late save cannot replace another stream's status.
    page.evaluate("Api.saveQuestionnairePre=async()=>{throw new Error('503')};qAnswers={test:'preserved'};submitQuestionnaire()")
    ns['expect'](page.locator('#q-next-btn')).to_be_enabled();assert page.evaluate('qAnswers.test')=='preserved';assert not page.locator('.q-done').count()
    page.evaluate("Api.saveQuestionnairePre=()=>new Promise(resolve=>window.qSaveResolve=resolve);submitQuestionnaire();submitQuestionnaire();selectProgram('own-old')")
    page.evaluate('qSaveResolve({id:"late"})');assert not page.locator('.q-done').count();assert page.evaluate('qStatusDone')==False
    # Missing server fields stay unknown rather than claiming an empty questionnaire.
    page.evaluate("Api.getQuestionnaireStatus=async()=>({});checkAndShowQuestionnaire(selectedProgramId)");ns['expect'](page.locator('#q-status-retry')).to_be_visible()
    # A switched stream cannot submit the previous form.
    page.evaluate("selectProgram('own-old');submitQuestionnaire()");assert len(saved)==1;ns['back'](page)
    page.evaluate("Api.isClubAdmin=true;checkAndShowQuestionnaire(selectedProgramId)");ns['expect'](page.locator('#q-banner-wrap')).to_contain_text('Служебный аккаунт');assert not page.locator('.q-banner').count()
    assert not errors,errors;assert page.locator('body').evaluate('e=>e.scrollWidth<=innerWidth')
    results.append({'engine':engine.name,'width':width,'passed':True,'syntheticPosts':len(saved)});context.close()
   browser.close()
finally:ns['server'].shutdown()
(OUT/'j289-results.json').write_text(json.dumps(results,indent=2),encoding='utf-8');print('J289:',len(results),'cases: stream-specific GET, legacy flag ignored, stale responses, retry, owner guards, submission binding, reopened form, Back; isolated API only')
