from fixture import boot
from pathlib import Path
from playwright.async_api import async_playwright
import asyncio,json
H=Path(__file__).parent
async def main():
 results=[]
 async with async_playwright()as pw:
  for engine in['chromium','webkit']:
   b=await getattr(pw,engine).launch();p=await boot(b,'http://127.0.0.1:15357/before/',390)
   box=p.locator('#ai-context-choices input').first;await box.focus();await p.keyboard.press('Space')
   result={'engine':engine,'activeElement':await p.evaluate('document.activeElement.tagName'),'selected':await p.evaluate('aiContext.ids.length'),'hasCount':await p.locator('#ai-context-count').count(),'realSends':len(p.ai_sends)}
   assert result['activeElement']=='BODY'and result['selected']==1,result;results.append(result);await b.close()
 (H/'before-results.json').write_text(json.dumps(results,indent=2),encoding='utf-8');print(results)
asyncio.run(main())
