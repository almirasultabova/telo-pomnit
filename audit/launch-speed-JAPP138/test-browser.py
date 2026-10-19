from pathlib import Path
from playwright.async_api import async_playwright
import asyncio, json, time

A=Path(__file__).parent
records=[]
async def run(browser,engine,variant,scenario,size=(390,950),capture=False):
    page=await browser.new_page(viewport={'width':size[0],'height':size[1]},device_scale_factor=1)
    requests=[];errors=[];start=time.monotonic()
    page.on('request',lambda r:requests.append({'path':r.url.split('127.0.0.1:')[-1], 'ms':round((time.monotonic()-start)*1000)}))
    page.on('pageerror',lambda e:errors.append(str(e)))
    port=11377 if variant=='before' else 11378
    await page.goto(f'http://127.0.0.1:{port}/?scenario={scenario}#tgWebAppPlatform=ios&tgWebAppVersion=8.0',wait_until='domcontentloaded')
    if capture:
        await page.wait_for_function("document.documentElement.dataset.fixturePlayingMs",timeout=15000)
        await page.evaluate("document.getElementById('launch-video').currentTime=2.8")
        await page.wait_for_timeout(90)
        await page.screenshot(path=str(A/f'{variant}-{engine}-{size[0]}x{size[1]}.png'))
    await page.wait_for_function("document.getElementById('launch-overlay').hidden",timeout=16000)
    data=await page.evaluate("""()=>({playing:document.documentElement.dataset.fixturePlayingMs,release:document.documentElement.dataset.fixtureReleasedMs,home:document.getElementById('screen-home').classList.contains('screen--active'),onboarding:document.getElementById('screen-onboarding').classList.contains('screen--active'),error:!document.getElementById('startup-error').hidden,inert:document.getElementById('app').inert,fit:getComputedStyle(document.getElementById('launch-video')).objectFit,overflow:document.documentElement.scrollWidth>innerWidth})""")
    await page.wait_for_timeout(70)
    data['release']=await page.evaluate('document.documentElement.dataset.fixtureReleasedMs')
    if scenario in ['denied','offline']:
        assert not data['home'],data
        assert not data['playing'],data
    elif scenario=='onboarding':assert data['onboarding'],data
    else:assert data['home'],data
    assert not data['inert'] and not data['overflow'],data
    assert not errors,errors
    if variant=='after': assert data['fit']=='cover',data
    media=[r for r in requests if '.mp4' in r['path']]
    assert len(set(r['path'] for r in media))<=1,media
    if data['playing'] and scenario in ['first','return','slow','nomemory','onboarding']:
        assert not any('-standard.webp' in r['path'] or '-tall.webp' in r['path'] and 'bud-' not in r['path'] for r in requests),requests
    record={'engine':engine,'variant':variant,'scenario':scenario,'viewport':size,**data,'videoRequestMs':media[0]['ms'] if media else None,'h264':await page.evaluate("document.getElementById('launch-video').canPlayType('video/mp4; codecs=\"avc1.42E01E\"')"),'seekedForCapture':capture}
    records.append(record);print(json.dumps(record),flush=True)
    await page.close()

async def main():
    async with async_playwright() as p:
        for engine in [p.chromium,p.webkit]:
            b=await engine.launch()
            if engine.name=='chromium':
                await run(b,engine.name,'before','slow')
                await run(b,engine.name,'after','slow')
            for group in [['return','blocked-return','missing'],['denied','offline','nomemory'],['onboarding']]:
                await asyncio.gather(*[run(b,engine.name,'after',s) for s in group])
            if engine.name=='chromium':
                await asyncio.gather(*[run(b,engine.name,v,'first',size,True) for v in ['before','after'] for size in [(390,950),(390,724)]])
            await b.close()
    (A/'browser-results.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
asyncio.run(main())
