from pathlib import Path
from playwright.async_api import async_playwright, expect
import asyncio, json, os
H=Path(__file__).parent; RESULTS=[]
ORIGIN=os.environ.get('MEETING_TEST_ORIGIN','http://127.0.0.1:38143/')
def access():
    meeting={'id':'meeting-first','number':1,'date':'2026-10-15T15:00:00Z','topic':'Психосоматические разборы','description':'Описание встречи. <img src=x onerror=alert(1)>','prepare':'Подготовьте удобное место.','zoomLink':'https://zoom.example.test/live','recordingUrl':'https://zoom.example.test/rec/share/fixture','recordingPasscode':'?=Test^&<'}
    stream={'id':'stream-first','name':'Октябрьский поток 2026','startDate':'2026-10-15T15:00:00Z','endDate':'2026-11-12T15:00:00Z','status':'active','phase':'current','canUseAi':False,'canAttend':True,'canReadRecordings':True,'recordingsExpiresAt':'2027-02-13T00:00:00Z','meetings':[meeting,dict(meeting,id='meeting-second',number=2,topic='Телесная практика',recordingUrl=None,recordingPasscode=None)]}
    return {'serverTime':'2026-10-19T17:00:00Z','ai':{'canWrite':False,'reason':'purchase_required','message':'Учебный просмотр'},'streams':[stream]}
async def check(browser,engine,width):
    p=await browser.new_page(viewport={'width':width,'height':844}); errors=[]; requests=[]
    p.on('pageerror',lambda e:errors.append(str(e)))
    await p.add_init_script("window.TelegramWebviewProxy={postEvent(){}};localStorage.setItem('tp_user:meeting-fixture:tp_offer_seen','true');localStorage.setItem('tp_user:meeting-fixture:launch_seen_v3','1');")
    async def api(route):
        requests.append(route.request.method+' '+route.request.url.split('/api',1)[1].split('?')[0]);path=route.request.url.split('/api',1)[1].split('?')[0]
        user={'id':'meeting-fixture','name':'Учебный просмотр','consentGivenAt':'2026-10-19T12:00:00Z'}
        data={'/auth/telegram':{'token':'fixture-not-a-real-token','user':user},'/me':{'user':user},'/me/enrollment/access':access(),'/diary':[],'/diary/days':{'timeZone':'Europe/Moscow','days':[]},'/checkins':[],'/triggers':[]}.get(path,{})
        await route.fulfill(status=200,json=data)
    await p.route('**/api/**',api)
    await p.goto(ORIGIN+'index.html?verify=JAPP143#tgWebAppPlatform=ios&tgWebAppVersion=8.0',wait_until='domcontentloaded')
    await expect(p.locator('#screen-home')).to_have_class('screen screen--active')
    await p.evaluate("LaunchSplash.cancel();switchTab('profile');document.getElementById('program-calendar').open=true")
    opener=p.locator('[data-program-meeting="meeting-first"]');await expect(opener).to_be_visible()
    assert await p.locator('.program-meeting-row button').count()==2
    assert await p.locator('.program-meeting-row details,.program-meeting-row .meeting-attend-btn').count()==0
    await opener.click(); dialog=p.locator('#program-meeting-dialog');await expect(dialog).to_be_visible()
    await expect(dialog.locator('.meeting-panel-close')).to_be_focused()
    await expect(dialog.locator('.meeting-recording a')).to_have_text('Запись эфира')
    assert await dialog.locator('#meeting-recording-passcode').input_value()=='?=Test^&<'
    assert await dialog.locator('.meeting-panel-body img').count()==0
    await expect(dialog.locator('.meeting-panel-body')).to_contain_text('<img src=x onerror=alert(1)>')
    await expect(dialog.locator('.meeting-panel-body')).to_contain_text('Подготовьте удобное место.')
    assert await dialog.locator('a[href="https://zoom.example.test/live"]').count()==1
    await p.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.copiedFixture=text}})")
    await dialog.locator('.meeting-code-copy').click();await expect(dialog.locator('.meeting-code-status')).to_have_text('Код скопирован')
    assert await p.evaluate('window.copiedFixture')=='?=Test^&<'
    await dialog.locator('.meeting-panel-attend').click();await expect(dialog.locator('.meeting-panel-attend')).to_have_text('Снять отметку участия')
    await expect(dialog.locator('.meeting-panel-attend')).to_be_focused()
    await dialog.locator('.meeting-panel-close').click();await expect(dialog).not_to_be_visible();await expect(opener).to_be_focused()
    await expect(opener).to_contain_text('Участвовала')
    await opener.click();await dialog.locator('.meeting-panel-attend').click();await expect(dialog.locator('.meeting-panel-attend')).to_have_text('Отметить участие')
    await p.keyboard.press('Escape');await expect(dialog).not_to_be_visible()
    await opener.click();await p.evaluate('goBack()');await expect(dialog).not_to_be_visible();await expect(p.locator('#tab-profile')).to_be_visible()
    await opener.click();await p.evaluate("() => { navigator.clipboard.writeText=async()=>{throw Error('fixture denied')} }")
    await dialog.locator('.meeting-code-copy').click();await expect(dialog.locator('.meeting-code-status')).to_contain_text('Код выделен')
    await expect(dialog.locator('#meeting-recording-passcode')).to_be_focused()
    await p.keyboard.press('Tab');assert await p.evaluate("document.getElementById('program-meeting-dialog').contains(document.activeElement)")
    await p.evaluate("currentProgram().canReadRecordings=false;MeetingPanel.sync()")
    assert await dialog.locator('.meeting-recording').count()==0
    await p.evaluate("currentProgram().canReadRecordings=true;currentProgram().recordingsExpiresAt='2026-10-18T00:00:00Z';MeetingPanel.sync()")
    assert await dialog.locator('.meeting-recording').count()==0
    await p.evaluate("currentProgram().recordingsExpiresAt='2027-02-13T00:00:00Z';currentProgram().canAttend=false;MeetingPanel.sync()")
    assert await dialog.locator('.meeting-recording').count()==1
    assert await dialog.locator('a[href="https://zoom.example.test/live"]').count()==0
    await p.evaluate("() => { navigator.clipboard.writeText=()=>new Promise(resolve=>window.resolveCopyFixture=resolve) }")
    await dialog.locator('.meeting-code-copy').click();await dialog.locator('.meeting-panel-close').click();await p.evaluate('resolveCopyFixture()');await expect(dialog).not_to_be_visible()
    await opener.click();await p.evaluate("Api._authGeneration++;MeetingPanel.sync()")
    await expect(dialog).not_to_be_visible();assert await dialog.locator('.meeting-recording').count()==0
    await p.evaluate('MeetingPanel.open("meeting-first")');await expect(dialog).to_be_visible()
    await p.evaluate("selectedProgramId='different-stream';MeetingPanel.sync()")
    await expect(dialog).not_to_be_visible()
    await p.evaluate("selectedProgramId='stream-first';MeetingPanel.open('meeting-second')")
    await expect(dialog).to_be_visible();assert await dialog.locator('.meeting-recording').count()==0
    await p.evaluate("MeetingPanel.close();MeetingPanel.open('meeting-first')")
    await expect(dialog).to_be_visible();await expect(dialog.locator('.meeting-panel-close')).to_be_visible()
    # Long content remains scrollable while close/attendance stay reachable.
    await p.evaluate("currentProgram().meetings[0].description='Подробности встречи. '.repeat(180);MeetingPanel.sync()")
    assert await dialog.evaluate('e=>e.scrollWidth<=e.clientWidth')
    await expect(dialog.locator('.meeting-panel-attend')).to_be_in_viewport()
    await expect(dialog.locator('.meeting-panel-close')).to_be_in_viewport()
    assert await dialog.locator('.meeting-panel-body').evaluate('e=>e.scrollHeight>e.clientHeight')
    if width==390:
        await p.evaluate("currentProgram().meetings[0].description='На встрече можно задать свой вопрос и послушать разборы участниц.';MeetingPanel.sync()")
        await p.screenshot(path=str(H/(engine+'-meeting.png')))
    await p.evaluate("switchTab('main')");await expect(dialog).not_to_be_visible()
    await p.evaluate("switchTab('profile');MeetingPanel.open('meeting-first');Api.logout()")
    await expect(dialog).not_to_be_visible();assert await dialog.locator('.meeting-recording').count()==0
    assert not await p.evaluate('document.documentElement.scrollWidth>innerWidth')
    assert not errors,errors
    assert not any(x.startswith(('POST /meetings','PATCH /','PUT /'))for x in requests),requests
    RESULTS.append({'engine':engine,'width':width,'passed':True,'groups':19,'pageErrors':errors,'syntheticApi':True})
    print(engine,width,'PASS',flush=True);await p.close()
async def main():
    async with async_playwright()as pw:
        for engine,widths in [('chromium',[320,390,1440]),('webkit',[390])]:
            b=await getattr(pw,engine).launch()
            try:
                for width in widths:await check(b,engine,width)
            finally:await b.close()
    (H/('published-ui.json'if'https:'in ORIGIN else'ui-results.json')).write_text(json.dumps(RESULTS,indent=2),encoding='utf-8')
asyncio.run(main())
