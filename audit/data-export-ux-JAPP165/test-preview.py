from pathlib import Path
from playwright.async_api import async_playwright,expect
import asyncio,json
H=Path(__file__).parent
async def main():
 async with async_playwright()as pw:
  b=await pw.chromium.launch();p=await b.new_page(viewport={'width':1100,'height':1000});errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
  await p.goto('http://127.0.0.1:15365/review');await p.wait_for_function("document.querySelectorAll('iframe').length===2")
  for name in['before','after']:await expect(p.frame_locator('#'+name).locator('.pdf-ready-panel')).to_be_visible()
  await p.screenshot(path=str(H/'comparison-pdf.png'),full_page=True)
  await p.goto('http://127.0.0.1:15365/review?mode=copy')
  await expect(p.frame_locator('#before').locator('#screen-data-export-preview .screen-title')).to_have_text('Копия данных')
  await expect(p.frame_locator('#after').locator('#screen-data-export-preview .screen-title')).to_have_text('Неотправленные записи')
  await p.screenshot(path=str(H/'comparison-copy.png'),full_page=True);assert not errors,errors;await b.close()
 (H/'preview-results.json').write_text(json.dumps({'passed':True,'httpOnlySyntheticApi':True,'comparisonModes':['pdf','local-copy'],'errors':errors},indent=2),encoding='utf-8');print('PASS HTTP-only PDF and local-copy comparisons')
asyncio.run(main())
