from pathlib import Path
import asyncio,json
from playwright.async_api import async_playwright,expect
H=Path(__file__).parent
async def main():
 async with async_playwright()as pw:
  b=await pw.chromium.launch();p=await b.new_page(viewport={'width':940,'height':1100});errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
  await p.goto('http://127.0.0.1:15357/review');frames=[p.frame_locator('iframe[title="'+title+'"]')for title in ['До','После']]
  measurements=[]
  for f in frames:
   button=f.locator('#qscale-bodyContactScale [data-val="7"]');await expect(button).to_be_visible(timeout=20000)
   await button.click();await expect(button).to_have_attribute('aria-pressed','true');measurements.append(await button.bounding_box())
  assert measurements[0]['width']<30 and measurements[1]['width']>=50
  for frame in p.frames[1:]:
   await frame.evaluate("() => {const body=document.getElementById('questionnaire-body'),field=document.getElementById('qscale-bodyContactScale').closest('.q-field');body.scrollTop+=field.getBoundingClientRect().top-body.getBoundingClientRect().top-12}")
  await p.screenshot(path=str(H/'comparison.png'),animations='disabled');assert not errors,errors
  (H/'preview-results.json').write_text(json.dumps({'passed':True,'buttonMeasurements':measurements,'pageErrors':errors,'realWrites':0},indent=2),encoding='utf-8')
  await b.close();print('PASS actual local before/after, different button geometry, selection in both')
asyncio.run(main())
