"""Check the links a human opens, with no automation-only fixture injection."""
import asyncio,json,re
from pathlib import Path
from playwright.async_api import async_playwright,expect
HERE=Path(__file__).parent
async def main():
    results=[]
    async with async_playwright()as pw:
        browser=await pw.chromium.launch()
        page=await browser.new_page(viewport={'width':390,'height':844})
        errors=[];failed=[];external=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('response',lambda r:failed.append({'url':r.url,'status':r.status})if r.status>=400 and '/api/'not in r.url else None)
        async def block(route):
            external.append(route.request.url);await route.abort()
        await page.route('https://**',block)
        await page.goto('http://127.0.0.1:14949/review')
        await expect(page.get_by_role('heading',name='Единое оформление экранов')).to_be_visible()
        assert await page.locator('a').count()==9
        for view,selector in [('home','#screen-home'),('profile','#tab-profile'),('body','#screen-body-map'),('feedback','#screen-feedback'),('questionnaire','#screen-questionnaire')]:
            await page.goto('http://127.0.0.1:14949/index.html?view='+view)
            await expect(page.locator(selector)).to_be_visible(timeout=20000)
            await page.wait_for_function("Api.isAuthed() && qStatusVerified && !document.getElementById('launch-overlay')?.checkVisibility()",timeout=20000)
            if view=='body':await expect(page.locator('#body-zone-list button')).not_to_have_count(0)
            if view=='feedback':await expect(page.locator('#fb-text')).to_be_visible()
            if view=='questionnaire':await expect(page.locator('#q-next-btn')).to_have_text('Отправить')
            results.append({'view':view,'passed':True})
        assert not errors,errors
        assert not failed,failed
        assert not external,external
        (HERE/'preview-results.json').write_text(json.dumps({'views':results,'pageErrors':errors,'failedAssets':failed,'externalRequests':external},ensure_ascii=False,indent=2),encoding='utf-8')
        print('Human preview PASS',len(results),'views, no external requests')
        await browser.close()
asyncio.run(main())
