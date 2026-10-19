from pathlib import Path
from playwright.async_api import expect
import copy, re
HERE=Path(__file__).parent
USER={'id':'ui-consistency-preview','name':'Учебный просмотр','consentGivenAt':'2026-10-19T12:00:00Z','role':'PARTICIPANT'}
STREAM='ui-preview-stream'
ACCESS={'serverTime':'2026-10-19T18:00:00Z','ai':{'canWrite':False,'reason':'questionnaire_required','questionnaireStreamId':STREAM,'message':'Заполните анкету участницы, чтобы начать разговор с AI-ассистентом.'},'streams':[{'id':STREAM,'name':'Учебный поток','phase':'current','status':'active','startDate':'2026-10-15T15:00:00Z','endDate':'2026-11-12T15:00:00Z','canAttend':True,'canReadRecordings':True,'canUseAi':False,'recordingsExpiresAt':'2027-02-13T00:00:00Z','meetings':[]}]}
def payload(path):
    return copy.deepcopy({'/auth/telegram':{'token':'local-preview-not-a-real-token','user':USER},'/me':{'user':USER},'/me/enrollment/access':ACCESS,'/questionnaires/'+STREAM:{'pre':None,'post':None},'/diary':[],'/diary/days':{'timeZone':'Europe/Moscow','days':[]},'/checkins':[],'/triggers':[]}.get(path,{}))
async def boot(browser,origin,width=390):
    page=await browser.new_page(viewport={'width':width,'height':844});page.fixture_errors=[];page.fixture_posts=[];page.fixture_dialogs=[];page.fixture_modes={};page.fixture_gates={};page.fixture_pre=None
    page.on('pageerror',lambda e:page.fixture_errors.append(str(e)))
    async def dialog(d):page.fixture_dialogs.append(d.message);await d.dismiss()
    page.on('dialog',dialog)
    await page.add_init_script("window.TelegramWebviewProxy={postEvent(){}};localStorage.setItem('tp_user:ui-consistency-preview:tp_offer_seen','true');localStorage.setItem('tp_user:ui-consistency-preview:launch_seen_v3','1');")
    async def api(route):
        path=route.request.url.split('/api',1)[1].split('?')[0]
        if route.request.method=='POST'and path in['/feedback','/questionnaires/pre']:
            page.fixture_posts.append({'path':path,'data':route.request.post_data_json})
            mode=page.fixture_modes.get(path,'fail');gate=page.fixture_gates.get(path)
            if gate:await gate.wait()
            if mode=='ok':
                result={'ok':True}
                if path.endswith('/pre'):
                    page.fixture_pre={'id':'synthetic-pre','answers':route.request.post_data_json['answers'],'formVersion':1};result=page.fixture_pre
                await route.fulfill(status=200,json=result)
            else:await route.fulfill(status=503,json={'error':'Учебный отказ соединения'})
            return
        data=payload(path)
        if page.fixture_pre and path=='/questionnaires/'+STREAM:data={'pre':page.fixture_pre,'post':None}
        if page.fixture_pre and path=='/me/enrollment/access':data['ai']={'canWrite':True,'reason':'program','message':'Учебный просмотр'}
        await route.fulfill(status=200,json=data)
    await page.route('**/api/**',api)
    await page.goto(origin+'index.html?owner=preview&v=JAPP147&automation=1#tgWebAppPlatform=ios&tgWebAppVersion=8.0',wait_until='domcontentloaded')
    await expect(page.locator('#screen-home')).to_have_class(re.compile(r'\bscreen--active\b'))
    await page.evaluate('LaunchSplash.cancel();Storage.setQSheetShown();clearTimeout(qInviteTimer)')
    await page.wait_for_function('qStatusVerified')
    return page
async def questionnaire(page):
    await page.evaluate("openQuestionnaire();qAnswers={};for(const block of Q_BLOCKS)for(const f of block.fields)if(f.required)qAnswers[f.id]=f.type==='radio'?f.options[0]:f.type==='checkbox'?[f.options[0]]:f.type==='scale'?5:'Учебный ответ';qStep=Q_BLOCKS.length-1;renderQBlock();focusQuestionnaireBlock()")
    await expect(page.locator('#screen-questionnaire')).to_have_class(re.compile(r'\bscreen--active\b'))
