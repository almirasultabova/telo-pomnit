from pathlib import Path
from playwright.async_api import async_playwright,expect
import asyncio,json
H=Path(__file__).parent
async def main():
 async with async_playwright()as pw:
  b=await pw.chromium.launch();p=await b.new_page(viewport={'width':1100,'height':1000});errors=[];p.on('pageerror',lambda e:errors.append(str(e)));await p.goto('http://127.0.0.1:15367/review?mode=error')
  after=p.frame_locator('#after');before=p.frame_locator('#before');await expect(after.locator('#ai-history-status')).to_contain_text('На экране остался предыдущий.');await expect(after.locator('#ai-history-select')).to_have_value('history-a');await expect(before.locator('#ai-history-select')).to_have_value('history-b');await expect(before.locator('#ai-access-notice')).to_contain_text('Не удалось загрузить диалог');header=await after.locator('#screen-ai-chat .screen-header').bounding_box()
  for name in ['#ai-history-status','#ai-history-retry']:
   box=await after.locator(name).bounding_box();assert box['y']>=header['y']-1 and box['y']+box['height']<=header['y']+header['height']+1,(name,box,header)
  await p.screenshot(path=str(H/'comparison-error.png'),full_page=True)
  await p.goto('http://127.0.0.1:15367/review')
  for name in['before','after']:await expect(p.frame_locator('#'+name).locator('#ai-history-select')).to_have_value('history-a')
  await expect(p.frame_locator('#after').locator('#ai-history-status')).to_have_text('Разговор открыт.');await p.screenshot(path=str(H/'comparison-ready.png'),full_page=True);assert not errors,errors;await b.close()
 (H/'preview-results.json').write_text(json.dumps({'passed':True,'httpOnlySyntheticApi':True,'errors':errors},indent=2),encoding='utf-8');print('PASS HTTP-only history comparison, no provider')
asyncio.run(main())
