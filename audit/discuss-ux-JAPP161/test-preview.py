from pathlib import Path
from playwright.async_api import async_playwright,expect
import asyncio,json
H=Path(__file__).parent
async def main():
 async with async_playwright()as pw:
  b=await pw.chromium.launch();p=await b.new_page(viewport={'width':1100,'height':1250});errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
  await p.goto('http://127.0.0.1:15361/review',wait_until='domcontentloaded');old=p.frame_locator('iframe[title="До"]');new=p.frame_locator('iframe[title="После"]')
  await expect(new.locator('.dq-selection-status')).to_have_text('Выделено: 2000 симв.',timeout=20000);await expect(old.locator('.dq-selection-status')).to_contain_text('Выбранный фрагмент:')
  await expect(new.locator('#dq-use-selection')).to_be_in_viewport();assert len(await old.locator('.dq-selection-status').inner_text())>2000
  await p.screenshot(path=str(H/'comparison.png'),animations='disabled');await new.locator('#dq-use-selection').click();await expect(new.locator('#dq-excerpt')).to_have_value((await old.locator('#dq-source-text').input_value())[:2000]);assert not errors,errors
  (H/'preview-results.json').write_text(json.dumps({'passed':True,'compactStatus':True,'copyPreserved':True,'pageErrors':errors,'realWrites':0},indent=2),encoding='utf-8');await b.close();print('PASS actual preview and exact copied fragment')
asyncio.run(main())
