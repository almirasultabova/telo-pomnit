from pathlib import Path
import asyncio,json
import fixture
from playwright.async_api import async_playwright,expect
H=Path(__file__).parent
async def main():
 results=[]
 async with async_playwright()as pw:
  b=await pw.chromium.launch()
  for name,origin in [('main','https://tg-app-telo-pomnit.vercel.app'),('reserve','https://app.telo-pomnit.ru')]:
   fixture.ORIGIN=origin;p,f=await fixture.boot(b);await f.locator('[data-person="person-0"]').click();await f.locator('#decision-stream').select_option('demo-autumn');await f.locator('#decision-basis').select_option('cash');await f.locator('#submit-decision').click();await expect(f.locator('#submit-decision')).to_have_text('Подтвердить изменения');p.model.confirm_error=503;await f.locator('#submit-decision').click();await expect(f.locator('#submit-decision')).to_have_text('Повторить подтверждение');assert await f.locator('body').evaluate('()=>!document.querySelector(".review-marks,[data-review-case]")');assert not p.errors;await p.screenshot(path=str(H/(name+'-without-marks.png')));results.append({'origin':origin,'comparisonMarkers':False,'pageErrors':p.errors,'realWrites':0});await p.close()
  await b.close()
 (H/'no-marks.json').write_text(json.dumps(results,indent=2),encoding='utf-8');print('PASS main/reserve render without comparison markers')
asyncio.run(main())
