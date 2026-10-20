from fixture import boot
from pathlib import Path
from playwright.async_api import async_playwright,expect
import asyncio,json
H=Path(__file__).parent;RESULTS=[]
async def run(b,engine):
 p=await boot(b,'http://127.0.0.1:15369/',320);groups=[];s=p.locator('#screen-discuss');p.sources[0]['text']='<img src=x onerror=alert(1)> '+('Учебная копия. '*600)
 await s.get_by_role('button',name='Из заметки',exact=True).click();await s.locator('.dq-source-record').first.get_by_role('button').click()
 field=s.locator('#dq-source-text');original=await field.input_value();await field.evaluate("e=>{e.setSelectionRange(0,7000);e.dispatchEvent(new Event('select'))}")
 await expect(s.locator('.dq-selection-status')).to_contain_text('6000');await s.locator('.dq-fragment-preview summary').click();await expect(s.locator('.dq-fragment-preview img')).to_have_count(0);await expect(s.locator('.dq-fragment-preview blockquote')).to_contain_text('<img src=x')
 await p.add_style_tag(content='.dq-selection-status,.dq-fragment-preview summary{font-size:26px!important}')
 await p.wait_for_function("!document.querySelector('.screen--enter,.screen--exit,.screen--enter-back,.screen--exit-back')");assert not await p.evaluate('document.documentElement.scrollWidth>innerWidth');groups.append('long-literal-fragment-and-larger-text-safe')
 await s.locator('#dq-use-selection').click();await expect(s.locator('#dq-excerpt')).to_have_value(original[:7000].strip());await expect(s.locator('#dq-save')).to_be_disabled();await s.locator('#dq-excerpt').fill('Сокращённая копия для сохранения.');await s.locator('#dq-save').click();await expect(s.locator('#dq-status')).to_have_text('Запись сохранена для вас.');assert p.sources[0]['text']==original;groups.append('over-limit-copy-never-truncated-original-unchanged')
 await s.get_by_role('button',name='Назад',exact=True).click();await s.get_by_role('button',name='Из заметки',exact=True).click();await s.locator('.dq-source-record').first.get_by_role('button').click()
 await field.evaluate("e=>{e.setSelectionRange(0,20);e.dispatchEvent(new Event('select'));e.setSelectionRange(0,0);e.dispatchEvent(new Event('select'))}");await expect(s.locator('#dq-use-selection')).to_be_disabled();await expect(s.locator('.dq-fragment-preview')).not_to_be_visible();groups.append('cleared-range-disables-selection-action')
 await s.get_by_role('button',name='Назад',exact=True).click();p.discuss_fault='history-fail';await s.locator('.dq-source-record').first.get_by_role('button').click();await expect(s.locator('#dq-status')).to_contain_text('Не удалось открыть заметку');await expect(s.locator('.dq-source-record')).to_have_count(10)
 p.discuss_fault='ok';await s.locator('.dq-source-record').first.get_by_role('button').click();await expect(field).to_have_value(original);groups.append('source-read-error-keeps-list-and-retry')
 # Cache and its return handler must not survive a change of identity.
 await p.evaluate('Api.logout();document.querySelector("#screen-discuss .dq-back").click()');await expect(s.locator('.dq-source-record')).to_have_count(0);await expect(field).to_have_count(0);groups.append('cached-return-cannot-show-previous-owners-notes')
 await p.close()
 p=await boot(b,'http://127.0.0.1:15369/',390);s=p.locator('#screen-discuss');await s.get_by_role('button',name='Из заметки',exact=True).click();p.history_gate=asyncio.Event();await s.locator('.dq-source-record').first.get_by_role('button').click();await p.evaluate('Api.logout()');p.history_gate.set();await p.history_done.wait();await p.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await expect(s.locator('#dq-source-text')).to_have_count(0);assert not p.discuss_writes and not p.fixture_errors and not p.fixture_dialogs;groups.append('late-source-read-after-logout-does-not-reopen-note')
 RESULTS.append({'engine':engine,'passed':True,'groups':groups,'realWrites':0});print(engine,'PASS six edges',flush=True);await p.close()
async def main():
 async with async_playwright()as pw:
  for engine in['chromium','webkit']:
   b=await getattr(pw,engine).launch()
   try:await run(b,engine)
   finally:await b.close()
 (H/'edge-results.json').write_text(json.dumps(RESULTS,ensure_ascii=False,indent=2),encoding='utf-8')
asyncio.run(main())
