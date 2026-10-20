from fixture import boot
from playwright.async_api import async_playwright,expect
from pathlib import Path
import asyncio,json
H=Path(__file__).parent;ORIGIN='https://tg-app-telo-pomnit.vercel.app/'
async def seed(p,answers=None):
 await p.evaluate("a=>{Storage._set('habitual_result_v2',JSON.stringify({...Habitual.calculate(a),syncStatus:'synced'}));renderMyPathTab();document.querySelector('.habitual-result-disclosure').open=true}",answers or [2]*16)
async def main():
 results=[]
 async with async_playwright()as pw:
  for engine,width in [('chromium',320),('chromium',390),('chromium',1440),('webkit',320),('webkit',390)]:
   b=await getattr(pw,engine).launch();p=await boot(b,ORIGIN,width);groups=[]
   await p.evaluate('startDiag(false,true)');assert await p.evaluate("document.activeElement.id")=='habitual-question'
   await expect(p.get_by_role('button',name='Далее',exact=True)).to_be_disabled()
   choice=p.locator('.diag-quiz-option').nth(3);await choice.focus();await p.keyboard.press('Enter');await expect(choice).to_be_focused();await expect(choice).to_have_attribute('aria-pressed','true');groups.append('keyboard choice and selected state')
   await p.evaluate('Storage._emit();applyProgramAccess(programAccess)');assert await p.evaluate('habitualView')=='quiz';await expect(choice).to_be_focused();groups.append('background data preserves quiz')
   await p.get_by_role('button',name='Далее',exact=True).click();assert await p.evaluate('diag.current')==1;assert await p.evaluate("document.activeElement.id")=='habitual-question';assert await p.evaluate("document.querySelector('#diag-tab-content').scrollTop")==0
   await p.get_by_role('button',name='Предыдущее утверждение',exact=True).click();await expect(p.locator('.diag-quiz-option').nth(3)).to_have_attribute('aria-pressed','true');groups.append('next and previous keep answer')
   await p.get_by_role('button',name='Продолжить позже',exact=True).click();await p.get_by_role('button',name='Продолжить опрос',exact=True).click();assert await p.evaluate('diag.current')==1;groups.append('draft continues at unanswered question')
   # Complete actual 16-question flow with a synthetic server failure, then explicit retry.
   p.habitual_fault='fail'
   await p.evaluate('startDiag(false,true)')
   for i in range(16):
    await p.locator('.diag-quiz-option').nth(i%7).click();await p.get_by_role('button',name='Посмотреть результат'if i==15 else'Далее',exact=True).click()
   await p.wait_for_function("Storage.getHabitualResult()?.syncStatus==='pending'");await expect(p.get_by_text('Ответы сохранены на устройстве. Сервер ещё не подтвердил сохранение.',exact=True)).to_be_visible();assert await p.evaluate('Storage.getHabitualDraft()')is None
   saved=await p.evaluate('Storage.getHabitualResult().answers');assert saved==[i%7 for i in range(16)];p.habitual_fault='ok';await p.get_by_role('button',name='Повторить сохранение',exact=True).click();await p.wait_for_function("Storage.getHabitualResult()?.syncStatus==='synced'");groups.append('all 16 unchanged answers pending and retry')
   await seed(p);opener=p.locator('#habitual-show-answers');await opener.scroll_into_view_if_needed();scroll=await p.evaluate("document.querySelector('#diag-tab-content').scrollTop");await opener.click();await expect(p.locator('.habitual-answers li')).to_have_count(16);assert await p.evaluate("document.activeElement.id")=='habitual-answers-title';assert (await p.locator('.habitual-return-top').bounding_box())['y']<350
   assert await p.evaluate("[...document.querySelectorAll('.habitual-answers li p')].every((p,i)=>p.textContent===Habitual.items[i].text)");assert await p.evaluate("[...document.querySelectorAll('.habitual-answers li strong')].every(p=>p.textContent===Habitual.choices[2])")
   await p.evaluate('Storage._emit();applyProgramAccess(programAccess)');assert await p.evaluate('habitualView')=='answers';await p.locator('.habitual-return-top').click();await expect(opener).to_be_focused();assert await p.locator('.habitual-result-disclosure').evaluate('(x)=>x.open');assert abs(await p.evaluate("document.querySelector('#diag-tab-content').scrollTop")-scroll)<2;groups.append('16 full answers and top return restores place')
   await opener.click();await p.locator('.habitual-answer-review .btn--primary').click();await expect(opener).to_be_focused();await opener.click();await p.evaluate('goBack()');await expect(opener).to_be_focused();groups.append('bottom and native return restore place')
   for value,state in [(0,'not_identified'),(1,'low_frequency'),(4,'tie'),(5,'incomplete')]:
    await seed(p,[value]*16);assert await p.evaluate('Storage.getHabitualResult().state')==state;await p.locator('#habitual-show-answers').click();assert await p.evaluate("[...document.querySelectorAll('.habitual-answers strong')].every(x=>x.textContent===Habitual.choices["+str(value)+"])");await p.locator('.habitual-return-top').click()
   groups.append('zero low tie unknown result review unchanged')
   await seed(p);await p.locator('#habitual-show-answers').click();assert not await p.evaluate("document.documentElement.scrollWidth>innerWidth");await p.screenshot(path=str(H/f'{engine}-{width}-answers.png'));await p.evaluate('returnHabitualResult();startDiag(false,true);pickDiagAnswer(3,0)');await p.screenshot(path=str(H/f'{engine}-{width}-quiz.png'));groups.append('layout and captured mobile desktop views')
   await p.evaluate("Storage._generation++;const old=document.querySelector('#diag-tab-content').innerHTML;pickDiagAnswer(4,0);habitualPrevious();window.staleQuizUnchanged=old===document.querySelector('#diag-tab-content').innerHTML");assert await p.evaluate('window.staleQuizUnchanged');groups.append('stale owner cannot change quiz')
   assert not p.fixture_errors,p.fixture_errors;results.append({'engine':engine,'width':width,'groups':groups,'syntheticPosts':len(p.habitual_posts),'pageErrors':p.fixture_errors});print(engine,width,'PASS',len(groups),'groups',flush=True);await b.close()
 (H/'ui-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
asyncio.run(main())
