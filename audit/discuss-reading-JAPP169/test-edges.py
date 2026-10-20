from fixture import boot
from playwright.async_api import async_playwright,expect
from pathlib import Path
import asyncio,json
H=Path(__file__).parent
async def main():
 rows=[]
 async with async_playwright()as pw:
  for engine in ['chromium','webkit']:
   b=await getattr(pw,engine).launch();p=await boot(b,'http://127.0.0.1:15369/',390);groups=[]
   await p.locator('.dq-back').click();p.list_fault=True;await p.evaluate('DiscussionNotes.invalidate();DiscussionNotes.refresh()');await p.locator('#discuss-entry').click();await expect(p.locator('#dq-status')).to_contain_text('Не удалось');await expect(p.locator('#dq-status')).to_be_focused();assert 'Загружаем'not in await p.locator('.dq-scroll').inner_text();p.list_fault=False;await p.get_by_role('button',name='Попробовать ещё раз',exact=True).click();await expect(p.locator('.dq-record')).to_have_count(20);await expect(p.locator('#screen-discuss h1')).to_be_focused();groups.append('first load failure has no false loading state and retry works')
   p.discuss_rows=[];await p.locator('.dq-back').click();await p.locator('#discuss-entry').click();await expect(p.locator('.dq-empty')).to_contain_text('Что хочется обсудить?');await p.get_by_role('button',name='Обсудили',exact=True).click();await expect(p.locator('.dq-empty')).to_contain_text('Здесь будет то, что вы обсудили');groups.append('both empty tabs remain understandable')
   await p.locator('#screen-discuss').get_by_role('button',name='Написать',exact=True).click();await p.locator('#dq-text').fill('Учебный текст во время задержки');p.discuss_gate=asyncio.Event();await p.locator('#dq-save').click();await expect(p.locator('.dq-scroll')).to_have_attribute('aria-busy','true');await expect(p.locator('#dq-status')).to_contain_text('Сохраняем');await p.evaluate('goBack()');assert await p.evaluate('currentScreen')=='discuss';assert len(p.discuss_attempts)==1;groups.append('busy state blocks duplicate save and native back')
   await p.evaluate("goTo('home');switchTab('main')");focus=await p.evaluate('document.activeElement.id');p.discuss_gate.set();await p.wait_for_function("document.querySelector('.dq-scroll').getAttribute('aria-busy')==='false'");assert await p.evaluate('currentScreen')=='home';assert await p.evaluate('document.activeElement.id')==focus;groups.append('late save response does not move current screen focus')
   assert not p.fixture_errors;rows.append({'engine':engine,'groups':groups,'realWrites':0});print(engine,'PASS',len(groups),'edges',flush=True);await b.close()
 (H/'edge-results.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
asyncio.run(main())
