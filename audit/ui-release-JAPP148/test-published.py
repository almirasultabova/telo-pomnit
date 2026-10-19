import sys,os
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'ui-consistency-JAPP147'))
from fixture import boot,questionnaire
HERE=Path(__file__).parent
from playwright.async_api import async_playwright,expect
import asyncio,json,re
ORIGIN=os.environ.get('UI_TEST_ORIGIN','https://tg-app-telo-pomnit.vercel.app/');RESULTS=[]
async def shot(p,name):await p.screenshot(path=str(HERE/name),animations='disabled')
async def wait_posts(p,n):
    for _ in range(100):
        if len(p.fixture_posts)>=n:return
        await asyncio.sleep(.01)
    raise AssertionError('Fixture POST not received')
async def run(browser,engine,width):
    p=await boot(browser,ORIGIN,width);groups=[]
    await p.evaluate("switchTab('diary')");await p.locator('#stop-reaction-btn').click()
    await expect(p.locator('#screen-trigger .screen-title')).to_have_text('Моя реакция')
    await expect(p.locator('#trigger-situation')).to_have_attribute('placeholder','Опишите ситуацию так, как вам удобно.')
    await expect(p.get_by_label('Насколько сильной была реакция?')).to_be_visible()
    await p.locator('#trigger-situation').fill('Учебная ситуация: меня перебили.')
    await p.locator('#reaction-grid button').first.click()
    await expect(p.locator('#trigger-save-btn')).to_be_enabled()
    assert not await p.evaluate('document.documentElement.scrollWidth>innerWidth');groups.append('reaction-copy-and-existing-selection')
    if width==390:await shot(p,engine+'-reaction.png')
    await p.evaluate('openFeedback()');await expect(p.locator('#fb-clear-rating')).not_to_be_visible()
    await p.locator('#fb-text').fill('Учебное сообщение. Было трудно найти расписание.')
    await p.locator('#fb-stars [data-star="4"]').click();await expect(p.locator('#fb-clear-rating')).to_be_visible()
    await p.locator('#fb-clear-rating').click();await expect(p.locator('#fb-clear-rating')).not_to_be_visible()
    assert await p.locator('#fb-stars [aria-pressed="true"]').count()==0
    await expect(p.locator('#fb-stars [data-star="1"]')).to_be_focused()
    assert await p.evaluate("Storage.getFormDraft('feedback').rating")==0;groups.append('optional-rating-reset-and-draft')
    await p.locator('#fb-submit').click();error=p.locator('#fb-send-error')
    await expect(error).to_be_visible();await expect(error).to_be_focused()
    await expect(error).to_have_attribute('role','alert');await expect(p.locator('#fb-submit')).to_have_text('Повторить отправку')
    await expect(p.locator('#fb-text')).to_have_value('Учебное сообщение. Было трудно найти расписание.')
    first=p.fixture_posts[-1]['data'];assert first['rating']is None and first['text'].startswith('Учебное сообщение')
    await expect(p.locator('#fb-submit')).to_be_in_viewport()
    assert await p.locator('#fb-submit').evaluate("e=>{const r=e.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('#fb-submit')===e}")
    assert not p.fixture_dialogs;groups.append('feedback-failure-preserves-input-and-inline-recovery')
    if width==390:await shot(p,engine+'-feedback-error.png')
    await p.locator('#fb-submit').click();await expect(error).to_be_visible()
    assert p.fixture_posts[-1]['data']['operationId']==first['operationId'];groups.append('feedback-retry-same-operation')
    await p.locator('#fb-text').fill('Новый учебный текст после ошибки.')
    await expect(error).to_have_count(0);assert await p.evaluate("Storage.getFormDraft('feedback').text")=='Новый учебный текст после ошибки.'
    p.fixture_modes['/feedback']='ok';await p.locator('#fb-submit').click();await expect(p.locator('#feedback-thanks')).to_be_visible()
    assert p.fixture_posts[-1]['data']['operationId']!=first['operationId'];assert await p.evaluate("Storage.getFormDraft('feedback')")is None;groups.append('edited-message-new-operation-and-success')
    p.fixture_modes['/feedback']='fail';await p.evaluate('openFeedback()');await p.locator('#fb-text').fill('Учебное новое сообщение.')
    gate=asyncio.Event();p.fixture_gates['/feedback']=gate;n=len(p.fixture_posts)
    await p.locator('#fb-submit').click();await wait_posts(p,n+1)
    await expect(p.locator('#fb-submit')).to_have_attribute('aria-busy','true')
    await p.evaluate('submitFeedback()');assert len(p.fixture_posts)==n+1
    await p.locator('#fb-text').fill('Ещё более новый учебный текст.')
    gate.set();await expect(p.locator('#fb-submit')).to_be_enabled();assert await p.locator('#fb-send-error').count()==0
    await expect(p.locator('#fb-text')).to_have_value('Ещё более новый учебный текст.');p.fixture_gates.clear();groups.append('late-failure-does-not-cover-new-draft')
    gate=asyncio.Event();p.fixture_gates['/feedback']=gate;n=len(p.fixture_posts)
    await p.locator('#fb-submit').click();await wait_posts(p,n+1)
    await p.evaluate("goTo('trigger');openFeedback()")
    gate.set();await expect(p.locator('#fb-submit')).to_be_enabled();assert await p.locator('#fb-send-error').count()==0
    p.fixture_gates.clear();groups.append('late-failure-does-not-cover-reopened-form')
    await questionnaire(p);answers=await p.evaluate('collectQBlock();JSON.stringify(qAnswers)')
    await p.locator('#q-next-btn').click();qerror=p.locator('#q-send-error')
    await expect(qerror).to_be_visible();await expect(qerror).to_be_focused()
    await expect(qerror).to_have_attribute('role','alert');await expect(p.locator('#q-next-btn')).to_have_text('Повторить отправку')
    assert await p.evaluate('JSON.stringify(qAnswers)')==answers
    assert not p.fixture_dialogs;groups.append('questionnaire-inline-failure-preserves-answers')
    if width==390:await shot(p,engine+'-questionnaire-error.png')
    await p.set_viewport_size({'width':width,'height':430});await expect(p.locator('#q-next-btn')).to_be_in_viewport();await expect(qerror).to_be_in_viewport();groups.append('short-viewport-footer-accessible')
    await p.set_viewport_size({'width':width,'height':844})
    await p.locator('#q-back-btn').click();await expect(qerror).to_have_count(0)
    await p.locator('#q-next-btn').click();await expect(p.locator('#q-next-btn')).to_have_text('Отправить')
    current_answers=await p.evaluate('qAnswers');assert all(current_answers.get(k)==v for k,v in json.loads(answers).items());groups.append('questionnaire-navigation-clears-old-error')
    await p.locator('#q-next-btn').click();await expect(qerror).to_be_visible()
    p.fixture_modes['/questionnaires/pre']='ok';last=p.fixture_posts[-1]['data'];await p.locator('#q-next-btn').click()
    await p.wait_for_function('!qSubmitting')
    await expect(p.locator('#screen-questionnaire .q-completion h1')).to_have_text('Спасибо')
    assert p.fixture_posts[-1]['data']==last;assert await p.locator('#q-send-error').count()==0;groups.append('questionnaire-retry-identical-data-and-success')
    # Frequency label is explanatory; the computation and its input are unchanged.
    text=await p.evaluate("currentProgram().phase='completed';currentProgram().endDate='2026-10-18T15:00:00Z';renderStreamSummary([{zone:'chest',sensations:['tightness'],date:'2026-10-16T12:00:00Z'}])")
    assert 'Чаще всего вы отмечали область:'in text and 'Главная зона потока'not in text;groups.append('frequency-summary-label')
    assert not await p.evaluate('document.documentElement.scrollWidth>innerWidth')
    assert not p.fixture_errors,p.fixture_errors;assert not p.fixture_dialogs,p.fixture_dialogs
    RESULTS.append({'engine':engine,'width':width,'passed':True,'groups':groups,'pageErrors':p.fixture_errors,'nativeDialogs':p.fixture_dialogs,'postsIntercepted':len(p.fixture_posts)})
    print(engine,width,'PASS',len(groups),'groups',flush=True);await p.close()
async def extra(browser,engine):
    p=await boot(browser,ORIGIN,320);await p.evaluate('openFeedback()');await p.locator('#fb-text').fill('Учебный текст')
    await p.locator('#fb-submit').click();await expect(p.locator('#fb-send-error')).to_be_visible()
    await p.add_style_tag(content='.form-message{font-size:26px!important}#fb-submit{font-size:30px!important}')
    await p.locator('#fb-submit').scroll_into_view_if_needed();await expect(p.locator('#fb-submit')).to_be_in_viewport()
    assert not await p.evaluate('document.documentElement.scrollWidth>innerWidth')
    await p.evaluate('Api.logout()');assert await p.locator('#fb-send-error').count()==0
    assert not p.fixture_errors;RESULTS.append({'engine':engine,'passed':True,'extra':['double-size-message-and-button-text','logout-clears-error']});await p.close()
    p=await boot(browser,ORIGIN,390);await questionnaire(p)
    gate=asyncio.Event();p.fixture_gates['/questionnaires/pre']=gate
    await p.locator('#q-next-btn').click();await wait_posts(p,1);await p.evaluate("goTo('trigger')");gate.set()
    await p.wait_for_function('!qSubmitting');assert await p.locator('#q-send-error').count()==0
    await expect(p.locator('#screen-trigger')).to_have_class(re.compile(r'\bscreen--active\b'))
    assert not p.fixture_dialogs and not p.fixture_errors
    RESULTS.append({'engine':engine,'passed':True,'extra':['late-questionnaire-failure-keeps-current-screen']});await p.close()
async def main():
    async with async_playwright()as pw:
        for engine,widths in ([('chromium',[390])] if os.environ.get('UI_TEST_RESERVE') else [('chromium',[320,390,1440]),('webkit',[390])]):
            browser=await getattr(pw,engine).launch()
            try:
                for width in widths:await run(browser,engine,width)
                if not os.environ.get('UI_TEST_RESERVE'):await extra(browser,engine)
            finally:await browser.close()
    (HERE/('reserve-ui.json'if os.environ.get('UI_TEST_RESERVE')else'main-ui.json')).write_text(json.dumps(RESULTS,ensure_ascii=False,indent=2),encoding='utf-8')
asyncio.run(main())
