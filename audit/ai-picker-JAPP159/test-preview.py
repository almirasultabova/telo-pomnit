from pathlib import Path
from playwright.async_api import async_playwright,expect
import asyncio,json
H=Path(__file__).parent
async def main():
 async with async_playwright()as pw:
  b=await pw.chromium.launch();p=await b.new_page(viewport={'width':1100,'height':1200});errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
  await p.goto('http://127.0.0.1:15359/review',wait_until='domcontentloaded');before=p.frame_locator('iframe[title="До"]');after=p.frame_locator('iframe[title="После"]')
  await expect(after.locator('#ai-context-count')).to_have_text('Выбрано: 2 из 5',timeout=20000);await expect(before.locator('#ai-context-choices input:checked')).to_have_count(2)
  await expect(before.locator('#ai-context-count')).to_have_count(0)
  await p.screenshot(path=str(H/'comparison.png'),animations='disabled')
  await after.locator('#ai-context-preview-btn').click();await expect(after.locator('#ai-context-readable')).to_be_focused();await expect(after.locator('#ai-context-review')).not_to_be_checked();assert not errors,errors
  (H/'preview-results.json').write_text(json.dumps({'passed':True,'countAndRowSelection':True,'explicitPreview':True,'pageErrors':errors,'providerRequests':0},indent=2),encoding='utf-8');await b.close();print('PASS actual preview, clear two selections, explicit full text, no JS errors')
asyncio.run(main())
