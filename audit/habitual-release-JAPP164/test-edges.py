from fixture import boot
from playwright.async_api import async_playwright,expect
from pathlib import Path
import asyncio,json
H=Path(__file__).parent
async def main():
 results=[]
 async with async_playwright()as pw:
  for engine in ['chromium','webkit']:
   b=await getattr(pw,engine).launch();p=await boot(b,'https://tg-app-telo-pomnit.vercel.app/',390);groups=[]
   await p.evaluate('startDiag(false,true);pickDiagAnswer(4,0);habitualNext(0)');await p.reload();await p.wait_for_function("typeof qStatusVerified!=='undefined'&&qStatusVerified");await p.evaluate("LaunchSplash.cancel();Storage.setQSheetShown();clearTimeout(qInviteTimer);switchTab('diag');Storage.ensurePathPeriod(pathPeriodScope())");await p.evaluate('renderMyPathTab();startDiag()');assert await p.evaluate('diag.current')==1;assert await p.evaluate('diag.answers[0]')==4;groups.append('draft survives reload')
   await p.evaluate("document.documentElement.style.setProperty('--font-body','Manrope, sans-serif');document.querySelectorAll('.diag-quiz-option').forEach(x=>x.style.fontSize='26px');document.querySelector('#diag-tab-content').scrollTop=200")
   await p.wait_for_function("currentScreen==='home'");await p.evaluate('startDiag()');await p.locator('.diag-quiz-option').nth(6).focus();before=await p.evaluate("document.querySelector('#diag-tab-content').scrollTop");await p.keyboard.press('Enter');assert await p.evaluate("document.activeElement.textContent===Habitual.choices[6]"),await p.evaluate("({focus:document.activeElement.outerHTML,view:habitualView,screen:currentScreen})");assert abs(await p.evaluate("document.querySelector('#diag-tab-content').scrollTop")-before)<2;groups.append('choice preserves long-page position')
   # An in-flight save completing while answers are open must not close that view.
   gate=asyncio.Event()
   async def delayed(route):
    data=route.request.post_data_json;await gate.wait();await route.fulfill(json={**data,'date':'2026-10-20T12:00:00Z'})
   await p.route('**/api/habitual/result',delayed)
   await p.evaluate("diag.answers=Array(16).fill(3);diag.current=15;showDiagQuestion();void habitualNext(15)")
   await p.get_by_role('button',name='Посмотреть свои ответы',exact=True).click();gate.set();await p.wait_for_function("Storage.getHabitualResult()?.syncStatus==='synced'");await p.wait_for_timeout(100);assert await p.evaluate('habitualView')=='answers';groups.append('late save preserves open answer list')
   await p.evaluate("Storage._generation++;const html=document.querySelector('#diag-tab-content').innerHTML;returnHabitualResult();window.oldReturnBlocked=html===document.querySelector('#diag-tab-content').innerHTML");assert await p.evaluate('window.oldReturnBlocked');groups.append('old owner cannot restore private view')
   await p.evaluate("clearPrivateConversationState();window.returnCleared=habitualAnswersReturn===null");assert await p.evaluate('window.returnCleared');groups.append('logout clears return state')
   assert not p.fixture_errors,p.fixture_errors;results.append({'engine':engine,'groups':groups,'errors':p.fixture_errors});await b.close()
 (H/'edge-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8');print('PASS 10 edge groups on published main')
asyncio.run(main())
