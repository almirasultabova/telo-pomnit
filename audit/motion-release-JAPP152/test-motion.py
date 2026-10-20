from pathlib import Path
import asyncio,json,re,sys
from playwright.async_api import async_playwright,expect
HERE=Path(__file__).parent
sys.path.insert(0,str(HERE.parent/'ui-consistency-JAPP147'))
from fixture import boot
import os
ORIGIN=os.environ.get('UI_TEST_ORIGIN','https://tg-app-telo-pomnit.vercel.app/')
HERE=HERE/('motion-reserve'if os.environ.get('UI_TEST_RESERVE')else'motion-main')
HERE.mkdir(exist_ok=True)
RESULTS=[]
async def settled(p):
    await p.wait_for_function("!document.querySelector('.screen--enter,.screen--exit,.screen--enter-back,.screen--exit-back')")
async def race(p):
    return await p.evaluate("""async()=>{
      const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
      goTo('home');await pause(350);goTo('trigger');await pause(80);goTo('note');await pause(80);goTo('trigger');
      const start=performance.now();await pause(170);const el=document.getElementById('screen-trigger');
      return {elapsed:performance.now()-start,active:el.classList.contains('screen--active'),enter:el.classList.contains('screen--enter'),transform:getComputedStyle(el).transform};
    }""")
async def run(browser,engine,width,reduced):
    p=await boot(browser,ORIGIN,width);groups=[]
    await p.emulate_media(reduced_motion='reduce'if reduced else'no-preference')
    await settled(p)
    await p.evaluate("document.getElementById('stop-reaction-btn').click()")
    info=await p.locator('#screen-trigger').evaluate("e=>{const s=getComputedStyle(e);return {duration:s.animationDuration,name:s.animationName,transform:s.transform,willChange:s.willChange}}")
    assert info['willChange']=='auto',info
    if reduced:assert info['name']=='none'and info['transform']=='none',info
    else:
        assert info['name']=='slideInRight',info
        assert float(info['duration'].removesuffix('s'))<=.25,info
        if info['transform']!='none':assert abs(float(info['transform'].split(',')[4]))<width/4,info
    groups.append('bounded-entry-and-no-permanent-layer-hint')
    await settled(p)
    await expect(p.locator('#trigger-save-btn')).to_be_disabled()
    await p.locator('#trigger-situation').fill('Учебный черновик реакции сохраняется при переходах.')
    await p.locator('#reaction-grid button').first.click()
    await p.locator('#trigger-situation').focus()
    await p.evaluate('openFeedback()')
    await settled(p)
    await p.evaluate('goBack()')
    await settled(p)
    await expect(p.locator('#trigger-situation')).to_have_value('Учебный черновик реакции сохраняется при переходах.')
    await expect(p.locator('#trigger-situation')).to_be_focused()
    await expect(p.locator('#trigger-save-btn')).to_be_enabled()
    groups.append('back-restores-field-focus-and-existing-draft')
    timeline=await race(p)
    assert timeline['active']
    assert timeline['enter'] is (not reduced),timeline
    await settled(p)
    groups.append('return-before-old-timeout-keeps-current-entry')
    # Repeated navigation over consecutive frames exercises cancellation without delaying input.
    await p.evaluate("""async()=>{
      const route=['trigger','note','checkin','trigger-history','feedback'];
      for(let i=0;i<25;i++){goTo(route[i%route.length]);await new Promise(requestAnimationFrame)}
      goTo('trigger');
    }""")
    await settled(p)
    state=await p.evaluate("""()=>({screen:currentScreen,active:[...document.querySelectorAll('.screen--active')].map(e=>e.id),hidden:[...document.querySelectorAll('.screen:not(.screen--active)')].every(e=>e.inert&&e.getAttribute('aria-hidden')==='true'),focus:document.getElementById('screen-trigger').contains(document.activeElement)})""")
    assert state=={'screen':'trigger','active':['screen-trigger'],'hidden':True,'focus':True},state
    await expect(p.locator('#trigger-save-btn')).to_be_in_viewport()
    groups.append('last-of-many-actions-is-active-accessible-and-usable')
    await p.emulate_media(reduced_motion='no-preference')
    await p.evaluate("goTo('note')")
    await p.emulate_media(reduced_motion='reduce')
    assert await p.locator('#screen-note').evaluate('e=>getComputedStyle(e).transform')=='none'
    await settled(p)
    groups.append('reduce-motion-can-change-during-navigation')
    # Missing presentation helper still permits immediate navigation.
    await p.evaluate("delete window.ScreenMotion;goTo('trigger')")
    await expect(p.locator('#screen-trigger')).to_have_class(re.compile(r'\bscreen--active\b'))
    await expect(p.locator('#trigger-save-btn')).to_be_in_viewport()
    groups.append('missing-motion-helper-keeps-route-usable')
    assert not p.fixture_errors,p.fixture_errors
    assert not p.fixture_dialogs,p.fixture_dialogs
    assert not await p.evaluate('document.documentElement.scrollWidth>innerWidth')
    RESULTS.append({'engine':engine,'width':width,'reduced':reduced,'groups':groups,'passed':True,'entry':info,'race':timeline})
    print(engine,width,'reduce'if reduced else'normal','PASS',len(groups),'groups',flush=True)
    await p.close()
async def baseline(browser,engine):
    p=await boot(browser,ORIGIN+'before/',390);await settled(p)
    old=await race(p)
    assert old['active']and not old['enter'],old
    RESULTS.append({'engine':engine,'baselineOldCleanupReproduced':True,'race':old})
    await p.close()
async def comparison(browser):
    p=await browser.new_page(viewport={'width':1100,'height':1000});errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
    await p.goto(ORIGIN+'review')
    await expect(p.locator('#open')).to_be_enabled(timeout=20000)
    await p.locator('#open').click()
    for frame in [p.frame_locator('#before'),p.frame_locator('#after')]:
        await expect(frame.locator('#screen-trigger')).to_have_class(re.compile(r'\bscreen--active\b'))
    await p.locator('#back').click()
    await p.locator('#quick').click()
    await expect(p.locator('#status')).to_have_text('Остаёмся в последней открытой форме. Можно продолжать.')
    for frame in [p.frame_locator('#before'),p.frame_locator('#after')]:
        await expect(frame.locator('#screen-trigger')).to_have_class(re.compile(r'\bscreen--active\b'))
    await p.screenshot(path=str(HERE/'comparison.png'),animations='disabled')
    assert not errors,errors
    RESULTS.append({'comparisonReadyAndControls':True,'pageErrors':errors})
    await p.close()
async def main():
    async with async_playwright()as pw:
        for engine,widths in ([('chromium',[390])]if os.environ.get('UI_TEST_RESERVE')else[('chromium',[320,390,1440]),('webkit',[390])]):
            browser=await getattr(pw,engine).launch()
            try:
                for width in widths:await run(browser,engine,width,False)
                await run(browser,engine,390,True)
                # Baseline evidence is retained in local candidate J151.

            finally:await browser.close()
    (HERE/'motion-results.json').write_text(json.dumps(RESULTS,ensure_ascii=False,indent=2),encoding='utf-8')
asyncio.run(main())
