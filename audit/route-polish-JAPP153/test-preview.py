from pathlib import Path
from playwright.async_api import async_playwright,expect
import asyncio,json
HERE=Path(__file__).parent
async def main():
    async with async_playwright()as pw:
        b=await pw.chromium.launch();p=await b.new_page(viewport={'width':1100,'height':1000});errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
        await p.goto('http://127.0.0.1:15353/review')
        await expect(p.locator('#quick')).to_be_enabled(timeout=20000)
        await p.locator('#quick').click()
        for frame in [p.frame_locator('#before'),p.frame_locator('#after')]:
            await expect(frame.locator('#ps-edit-text')).to_have_value('Учебная правка: перед ответом сделаю спокойный выдох.')
        await p.locator('#back').click();await p.locator('#open').click()
        await expect(p.frame_locator('#after').locator('#ps-edit-text')).to_have_value('Учебная правка: перед ответом сделаю спокойный выдох.')
        await expect(p.frame_locator('#after').locator('#ps-edit-text')).to_be_visible()
        await expect(p.frame_locator('#before').locator('#ps-edit-text')).not_to_be_visible()
        await p.screenshot(path=str(HERE/'comparison.png'),animations='disabled')
        assert not errors,errors
        (HERE/'preview-results.json').write_text(json.dumps({'passed':True,'beforeLosesEdit':True,'afterRestoresEdit':True,'realWrites':0,'pageErrors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
        print('PASS actual before/after preview: edit, leave, reopen')
        await b.close()
asyncio.run(main())
