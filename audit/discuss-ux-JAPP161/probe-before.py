from fixture import boot
from playwright.async_api import async_playwright,expect
from pathlib import Path
import asyncio,json
H=Path(__file__).parent
async def main():
 results=[]
 async with async_playwright()as pw:
  for engine in['chromium','webkit']:
   b=await getattr(pw,engine).launch();p=await boot(b,'http://127.0.0.1:15359/before/',390);s=p.locator('#screen-discuss')
   await s.get_by_role('button',name='Из заметки',exact=True).click();await s.get_by_role('button',name='Показать ещё',exact=True).click();await expect(s.locator('.dq-source-record')).to_have_count(13)
   await s.locator('.dq-source-record').last.get_by_role('button').click();field=s.locator('#dq-source-text');await field.evaluate("e=>{e.setSelectionRange(0,2000);e.dispatchEvent(new Event('select'))}")
   statusLength=len(await s.locator('.dq-selection-status').inner_text());buttonY=(await s.locator('#dq-use-selection').bounding_box())['y']
   await s.get_by_role('button',name='Назад',exact=True).click();await expect(s.locator('.dq-source-record')).to_have_count(10)
   row={'engine':engine,'selectionStatusCharacters':statusLength,'useButtonY':buttonY,'visibleHeight':844,'rowsAfterBack':10,'rowsBeforeBack':13,'realWrites':len(p.discuss_writes)};assert statusLength>2000 and buttonY>844;results.append(row);await b.close()
 (H/'before-results.json').write_text(json.dumps(results,indent=2),encoding='utf-8');print(results)
asyncio.run(main())
