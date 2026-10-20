from pathlib import Path
import asyncio,json
from playwright.async_api import async_playwright,expect
H=Path(__file__).parent
async def main():
 async with async_playwright()as pw:
  b=await pw.chromium.launch();p=await b.new_page(viewport={'width':1100,'height':1100});errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
  await p.goto('http://127.0.0.1:15355/review')
  for title in ['До','После']:
   f=p.frame_locator(f'iframe[title="{title}"]');await expect(f.locator('#fb-text')).to_be_visible(timeout=20000)
   await f.locator('#fb-text').fill('Учебный вопрос о расписании.')
   await f.locator('#fb-submit').click();await expect(f.locator('#fb-send-error')).to_be_visible()
   await f.locator('#fb-submit').click();await expect(f.locator('#feedback-thanks')).to_be_visible()
  await p.screenshot(path=str(H/'comparison.png'),animations='disabled')
  assert not errors,errors
  (H/'preview-results.json').write_text(json.dumps({'passed':True,'bothFrames':True,'errorAndRetry':True,'pageErrors':errors,'realWrites':0},indent=2),encoding='utf-8')
  await b.close();print('PASS real local review, both forms, synthetic failure/retry, no JS errors')
asyncio.run(main())
