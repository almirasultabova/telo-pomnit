import sys,os
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'route-polish-JAPP153'))
from fixture import boot,ROW
from pathlib import Path
from playwright.async_api import async_playwright,expect
import asyncio,json,copy
HERE=Path(__file__).parent;RESULTS=[]
async def run(browser,engine,width):
    p=await boot(browser,os.environ.get('ORIGIN','https://tg-app-telo-pomnit.vercel.app/'),width);diary=[];groups=[]
    meeting={'id':ROW['id'],'source':'meeting','kind':'analysis','title':'После разбора','text':ROW['text'],'day':ROW['meetingDate'],'date':ROW['createdAt'],'important':False,'hasStep':True,'tags':[]}
    def entries():return [{'id':r['id'],'source':'body','kind':'body','title':'Наблюдение за телом','text':r['note'],'day':r['createdAt'][:10],'date':r['createdAt'],'important':r.get('important',False),'tags':[]}for r in diary]+[meeting]
    async def api(route):
        req=route.request;path=req.url.split('/api/',1)[-1].split('?')[0];body=req.post_data_json if req.method in ['POST','PUT']else{}
        if path=='diary'and req.method=='POST':
            row={**body,'id':'15300000-0000-4000-8000-000000000003'};diary.append(row);return await route.fulfill(json=row)
        if path=='diary/days':return await route.fulfill(json={'timeZone':'Europe/Moscow','days':[r['createdAt'][:10]for r in diary]})
        if path=='diary':return await route.fulfill(json=diary)
        if path=='diary-history/search':
            rows=entries()
            if body.get('important'):rows=[r for r in rows if r['important']]
            return await route.fulfill(json={'entries':rows,'total':len(rows),'offset':0,'hasMore':False})
        if path.startswith('diary-history/'):
            rid=path.split('/')[2];row=next(r for r in entries()if r['id']==rid)
            if path.endswith('/important'):
                row['important']=body['important']
                if row['source']=='body':diary[0]['important']=body['important']
                else:meeting['important']=body['important']
            return await route.fulfill(json=row)
        raise AssertionError(path)
    await p.route('**/api/diary**',api)
    await p.evaluate("goTo('home');switchTab('main')")
    await p.locator('#tab-main .home-action--body').click()
    await p.locator('.body-zone-disclosure summary').click()
    await p.locator('.body-zone-list .zone-btn').first.click()
    await p.locator('#zone-continue-btn').click()
    await p.locator('#sensations-grid button').first.click()
    await p.locator('#sensations-continue-btn').click()
    await p.locator('#note-textarea').fill('Учебная запись полного маршрута. Хочу запомнить это ощущение.')
    await p.locator('#note-save-btn').click()
    await expect(p.locator('#saved-title')).to_have_text('Запись сохранена на сервере')
    assert len(diary)==1
    if width==390:await p.screenshot(path=str(HERE/(engine+'-saved.png')),animations='disabled')
    groups.append('main-body-sensation-note-and-confirmed-save')
    await p.locator('#saved-home-btn').click()
    assert await p.evaluate("currentScreen==='home'&&activeTab==='main'")
    await p.locator('.nav-btn[data-tab="diary"]').click()
    await p.locator('#diary-history-btn').click()
    card=p.locator('.hm-card').filter(has_text='Учебная запись полного маршрута.')
    await card.locator('.hm-open').click()
    await expect(p.locator('.hm-detail-scroll')).to_contain_text('Хочу запомнить это ощущение.')
    await p.locator('#hm-detail-back').click();await expect(card.locator('.hm-open')).to_be_focused()
    await card.locator('.hm-star').focus();await card.locator('.hm-star').press('Enter');await expect(card.locator('.hm-star')).to_have_attribute('aria-pressed','true');await expect(card.locator('.hm-star')).to_be_focused()
    groups.append('return-to-main-history-record-and-important-focus')
    meeting_card=p.locator('.hm-card').filter(has_text='Учебная заметка после встречи.')
    await meeting_card.locator('.hm-open').click()
    await p.get_by_role('button',name='Открыть личный шаг',exact=True).click()
    await p.get_by_role('button',name='Изменить',exact=True).click()
    await p.locator('#ps-edit-text').fill('Учебная правка из общей истории.')
    await p.locator('#ps-back').click()
    await p.get_by_role('button',name='Открыть личный шаг',exact=True).click()
    await expect(p.locator('#ps-edit-text')).to_have_value('Учебная правка из общей истории.')
    assert not p.writes
    if width==390:await p.screenshot(path=str(HERE/(engine+'-edit-draft.png')),animations='disabled')
    groups.append('meeting-history-personal-step-draft-and-return')
    assert not p.fixture_errors,p.fixture_errors
    assert not await p.evaluate('document.documentElement.scrollWidth>innerWidth')
    RESULTS.append({'engine':engine,'width':width,'groups':groups,'passed':True,'realWrites':0,'syntheticDiaryRows':len(diary),'syntheticStepWrites':len(p.writes)})
    print(engine,width,'PASS route',len(groups),'groups',flush=True);await p.close()
async def main():
    async with async_playwright()as pw:
        for engine in ['chromium','webkit']:
            b=await getattr(pw,engine).launch()
            try:
                for width in [320,390]:await run(b,engine,width)
            finally:await b.close()
    (HERE/'route-results.json').write_text(json.dumps(RESULTS,ensure_ascii=False,indent=2),encoding='utf-8')
asyncio.run(main())
