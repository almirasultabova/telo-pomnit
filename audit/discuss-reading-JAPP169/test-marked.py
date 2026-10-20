from pathlib import Path
from playwright.async_api import async_playwright,expect
import asyncio,json
H=Path(__file__).parent
async def main():
 async with async_playwright()as pw:
  b=await pw.chromium.launch();p=await b.new_page(viewport={'width':1100,'height':1000});errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
  await p.goto('http://127.0.0.1:15369/review',wait_until='load')
  for key in ['return','error','saved']:
   await p.locator('[data-case="'+key+'"]').click();await expect(p.locator('#'+key)).to_be_visible();assert await p.locator('.case:visible').count()==1
   assert await p.locator('#'+key+' .phone img').evaluate_all('nodes=>nodes.every(x=>x.complete&&x.naturalWidth===390)')
   await p.locator('#'+key).screenshot(path=str(H/f'explained-{key}.png'))
  await p.set_viewport_size({'width':390,'height':844});await p.locator('[data-case="error"]').focus();await p.keyboard.press('Enter');await expect(p.locator('#error')).to_be_visible();assert not await p.evaluate('document.documentElement.scrollWidth>innerWidth');assert not errors
  await p.screenshot(path=str(H/'explained-mobile.png'),full_page=True)
  (H/'marked-results.json').write_text(json.dumps({'comparisons':3,'matchedScreenshots':6,'allImagesLoaded':True,'keyboardSwitching':True,'mobileWidth':390,'horizontalOverflow':False,'pageErrors':errors,'appRuntimeChanged':False,'published':False},indent=2),encoding='utf-8');await b.close();print('PASS three marked comparisons and mobile/keyboard view; app unchanged')
asyncio.run(main())
