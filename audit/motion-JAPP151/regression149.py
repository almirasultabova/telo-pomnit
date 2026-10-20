import asyncio, json, re, sys
from pathlib import Path
from playwright.async_api import async_playwright, expect

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE.parent/'ui-consistency-JAPP147'))
from fixture import boot
ORIGIN = 'http://127.0.0.1:15151/'
HERE=HERE/'regression149'
HERE.mkdir(exist_ok=True)
RESULTS = []

def contrast(a, b):
    def luminance(rgb):
        channels = [int(n)/255 for n in re.findall(r'\d+', rgb)[:3]]
        channels = [x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in channels]
        return sum(x*y for x,y in zip(channels,[.2126,.7152,.0722]))
    a,b=sorted([luminance(a),luminance(b)])
    return (b+.05)/(a+.05)

async def ready(p):
    await p.wait_for_function("!document.querySelector('.screen--enter,.screen--exit,.screen--enter-back,.screen--exit-back')")
    await p.wait_for_function("document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).every(a=>a.playState==='finished')")
    await p.evaluate('document.fonts.ready')

async def capture(p, engine, width, name):
    if width in [320, 390, 1440]:
        await p.screenshot(path=str(HERE/f'{engine}-{width}-{name}.png'), animations='disabled')

async def run(browser, engine, width):
    p = await boot(browser, ORIGIN, width)
    groups = []
    # All four tabs remain distinct compositions. Their section titles share one hierarchy.
    for tab in ['diary', 'diag', 'profile']:
        await p.evaluate(f"switchTab('{tab}')")
        await ready(p)
        title = p.locator(f'#tab-{tab} > .screen-header .screen-title')
        await expect(title).to_be_visible()
        box = await title.bounding_box()
        assert box['width'] > 0 and box['x'] >= -0.5 and box['x']+box['width'] <= width+0.5, (tab, width, box)
        await capture(p, engine, width, tab)
    title_sizes = await p.locator('.tab-pane:not(#tab-main) > .screen-header .screen-title').evaluate_all('(es)=>es.map(e=>getComputedStyle(e).fontSize)')
    assert len(set(title_sizes)) == 1 and float(title_sizes[0][:-2]) <= 36
    groups.append('four-tabs-compact-title-hierarchy')

    await p.evaluate("switchTab('main')")
    home_before = await p.locator('#tab-main').evaluate('(e)=>e.innerHTML')
    await capture(p, engine, width, 'home')
    await p.locator('#main-reaction-btn').click()
    await ready(p)
    await expect(p.locator('#screen-trigger')).to_have_class(re.compile(r'\bscreen--active\b'))
    save = p.locator('#trigger-save-btn')
    await expect(save).to_be_disabled()
    await expect(save).to_be_in_viewport()
    disabled = await save.evaluate('(e)=>({bg:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color})')
    await p.locator('#trigger-situation').fill('Учебная ситуация, которая останется черновиком.')
    await p.locator('#reaction-grid button').first.click()
    await expect(save).to_be_enabled()
    enabled = await save.evaluate('(e)=>({bg:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color})')
    assert enabled != disabled
    await expect(p.locator('#reaction-grid [aria-pressed="true"]')).to_have_count(1)
    await p.locator('#trigger-situation').focus()
    assert await p.locator('#trigger-situation').evaluate('e=>parseFloat(getComputedStyle(e).outlineWidth)') >= 2
    await capture(p, engine, width, 'reaction')
    groups.append('main-action-selection-validation-and-input-focus')

    await p.evaluate("goTo('note')")
    await ready(p)
    await p.locator('#note-textarea').fill('Длинная учебная заметка '+('длинноесловобезпробелов'*8))
    note = await p.locator('#note-textarea').evaluate('e=>({font:getComputedStyle(e).fontSize,radius:getComputedStyle(e).borderRadius,bg:getComputedStyle(e).backgroundColor})')
    await capture(p, engine, width, 'note')
    groups.append('long-note-within-screen')

    await p.evaluate('openFeedback()')
    await ready(p)
    feedback = await p.locator('#fb-text').evaluate('e=>({font:getComputedStyle(e).fontSize,radius:getComputedStyle(e).borderRadius,bg:getComputedStyle(e).backgroundColor})')
    assert feedback == note and float(feedback['font'][:-2]) >= 16
    for label in await p.locator('#feedback-form-wrap > label').all():
        label_box = await label.bounding_box()
        control = p.locator('#'+await label.get_attribute('for'))
        control_box = await control.bounding_box()
        assert control_box['y'] >= label_box['y']+label_box['height']
        assert control_box['y']-label_box['y']-label_box['height'] <= 10
        assert await label.evaluate('e=>getComputedStyle(e).textTransform') == 'none'
    await capture(p, engine, width, 'feedback')
    # Actual failure/retry: preserve entered content and keep recovery usable in a short window.
    await p.locator('#fb-text').fill('Учебная обратная связь. Не отправляется в рабочую базу.')
    await p.locator('#fb-submit').click()
    await expect(p.locator('#fb-send-error')).to_be_visible()
    await expect(p.locator('#fb-submit')).to_be_in_viewport()
    await p.set_viewport_size({'width':width,'height':430})
    await p.locator('#fb-submit').scroll_into_view_if_needed()
    await expect(p.locator('#fb-submit')).to_be_in_viewport()
    assert await p.locator('#fb-submit').evaluate('e=>{let r=e.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest("#fb-submit")===e}')
    p.fixture_modes['/feedback'] = 'ok'
    await p.locator('#fb-submit').click()
    await expect(p.locator('#feedback-thanks')).to_be_visible()
    await p.set_viewport_size({'width':width,'height':844})
    groups.append('consistent-fields-block-labels-and-short-window-retry')

    await p.evaluate("document.getElementById('checkin-btn').click()")
    await ready(p)
    await expect(p.locator('#screen-checkin .checkin-scale-item')).to_have_count(5)
    values = await p.locator('#screen-checkin .checkin-scale-val').all_text_contents()
    assert values == ['5']*5
    await p.locator('#screen-checkin .checkin-step-btn').last.click()
    values_after = await p.locator('#screen-checkin .checkin-scale-val').all_text_contents()
    assert values_after[:-1] == values[:-1] and values_after[-1] != values[-1]
    await p.locator('#checkin-note').fill('Учебная заметка к состоянию.')
    await capture(p, engine, width, 'checkin')
    await expect(p.locator('#checkin-save-btn')).to_be_in_viewport()
    groups.append('five-scales-independent-values-and-sticky-save')

    await p.evaluate("switchTab('diary');goTo('home')")
    await ready(p)
    await p.locator('#start-entry-btn').click()
    await ready(p)
    await expect(p.locator('#screen-body-map')).to_have_class(re.compile(r'\bscreen--active\b'))
    await expect(p.locator('#zone-continue-btn')).to_be_disabled()
    await p.locator('.body-zone-disclosure summary').click()
    await p.locator('.body-zone-list .zone-btn').first.click()
    await expect(p.locator('#zone-continue-btn')).to_be_enabled()
    await p.locator('#zone-continue-btn').click()
    await ready(p)
    await expect(p.locator('#screen-sensations')).to_have_class(re.compile(r'\bscreen--active\b'))
    await p.locator('#sensations-grid button').first.click()
    await expect(p.locator('#sensations-continue-btn')).to_be_enabled()
    await ready(p)
    selected = p.locator('#sensations-grid button[aria-pressed="true"] .sensation-label')
    selected_colors = await selected.evaluate('e=>({fg:getComputedStyle(e).color,bg:getComputedStyle(e.closest("button")).backgroundColor})')
    assert contrast(selected_colors['fg'], selected_colors['bg']) >= 4.5, selected_colors
    await capture(p, engine, width, 'sensations')
    groups.append('body-map-selection-and-sensation-transition')

    await p.evaluate("goTo('trigger')")
    await ready(p)
    await p.locator('#trigger-history-btn').click()
    await ready(p)
    await expect(p.locator('#screen-trigger-history')).to_have_class(re.compile(r'\bscreen--active\b'))
    await expect(p.locator('#new-trigger-btn')).to_be_visible()
    await p.locator('#new-trigger-btn').focus()
    assert await p.locator('#new-trigger-btn').evaluate('e=>parseFloat(getComputedStyle(e).outlineWidth)') >= 2
    await capture(p, engine, width, 'empty-history')
    groups.append('history-empty-state-and-keyboard-focus')

    assert not await p.evaluate('document.documentElement.scrollWidth>innerWidth')
    assert not p.fixture_errors, p.fixture_errors
    assert not p.fixture_dialogs, p.fixture_dialogs
    RESULTS.append({'engine':engine,'width':width,'groups':groups,'passed':True,'pageErrors':p.fixture_errors,'syntheticPosts':len(p.fixture_posts)})
    print(engine,width,'PASS',len(groups),'groups',flush=True)
    await p.close()

async def edges(browser, engine):
    p = await boot(browser, ORIGIN, 320)
    for name in ['Александра-Мария', 'Александра-Мария Оченьдлиннаяфамилия', 'А'*100]:
        await p.evaluate('(name)=>{homeUser.name=name;renderUserCard();renderMainTab()}',name)
        for tab, selector in [('main','#home-greeting'),('profile','.profile-name')]:
            await p.evaluate(f"switchTab('{tab}')")
            await ready(p)
            assert not await p.evaluate('document.documentElement.scrollWidth>innerWidth'),name
            box=await p.locator(selector).bounding_box()
            assert box['x']>=-.5 and box['x']+box['width']<=320.5,(name,box)
    await p.evaluate('openFeedback()')
    await ready(p)
    await p.add_style_tag(content='#feedback-form-wrap .fb-section-label{font-size:24px}#fb-submit{font-size:26px}#screen-feedback .screen-title{font-size:40px}')
    await p.locator('#fb-text').fill('Увеличенный текст учебной формы.')
    await p.locator('#fb-submit').click()
    await expect(p.locator('#fb-send-error')).to_be_visible()
    await expect(p.locator('#fb-submit')).to_be_in_viewport()
    assert not await p.evaluate('document.documentElement.scrollWidth>innerWidth')
    for label in await p.locator('#feedback-form-wrap > label').all():
        a=await label.bounding_box();b=await p.locator('#'+await label.get_attribute('for')).bounding_box()
        assert b['y']>=a['y']+a['height']
    assert not p.fixture_errors,p.fixture_errors
    RESULTS.append({'engine':engine,'passed':True,'edgeGroups':['long-names-and-defensive-overflow','enlarged-labels-heading-and-retry']})
    await p.close()

async def main():
    async with async_playwright() as pw:
        for engine,widths in [('chromium',[320,390,768,1440]),('webkit',[390])]:
            browser=await getattr(pw,engine).launch()
            try:
                for width in widths: await run(browser,engine,width)
                await edges(browser,engine)
            finally: await browser.close()
    (HERE/'visual-results.json').write_text(json.dumps(RESULTS,ensure_ascii=False,indent=2),encoding='utf-8')
asyncio.run(main())
