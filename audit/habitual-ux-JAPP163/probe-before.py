from fixture import boot
from playwright.async_api import async_playwright
from pathlib import Path
import asyncio,json
H=Path(__file__).parent
async def main():
 results=[]
 async with async_playwright()as pw:
  for engine in['chromium','webkit']:
   b=await getattr(pw,engine).launch();p=await boot(b,'http://127.0.0.1:15361/before/',390);await p.evaluate('startDiag()');choice=p.locator('.diag-quiz-option').nth(3);await choice.focus();await p.keyboard.press('Enter')
   lost=await p.evaluate('document.activeElement.tagName');assert lost=='BODY'
   await p.evaluate("Storage._set('habitual_result_v2',JSON.stringify({...Habitual.calculate(Array(16).fill(2)),syncStatus:'synced'}));renderMyPathTab();document.querySelector('.habitual-result-disclosure').open=true;showHabitualAnswers()")
   returnButton=p.locator('#diag-tab-content .btn--primary');position=await returnButton.bounding_box();assert position['y']>844
   results.append({'engine':engine,'focusAfterAnswer':lost,'answerRows':await p.locator('.habitual-answers li').count(),'returnButtonY':position['y'],'realPosts':len(p.habitual_posts)});await b.close()
 (H/'before-results.json').write_text(json.dumps(results,indent=2),encoding='utf-8');print(results)
asyncio.run(main())
