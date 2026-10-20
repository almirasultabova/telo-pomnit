from pathlib import Path
from fixture import boot,ENTRIES
from playwright.async_api import async_playwright,expect
import asyncio,json
H=Path(__file__).parent;RESULTS=[]
async def run(b,engine,width):
 p=await boot(b,'http://127.0.0.1:15359/',width);groups=[];boxes=p.locator('#ai-context-choices input');count=p.locator('#ai-context-count')
 await expect(count).to_have_text('Выбрано: 0 из 5');assert await boxes.count()==len(ENTRIES)
 assert await p.locator('#ai-context-choices .privacy-context-choice').first.evaluate('e=>e.getBoundingClientRect().height')>=48
 await p.locator('#ai-input').fill('Учебный вопрос, который должен остаться в поле.')
 await boxes.first.focus();await p.keyboard.press('Space');await expect(boxes.first).to_be_checked();await expect(boxes.first).to_be_focused();await expect(count).to_have_text('Выбрано: 1 из 5')
 selected=await boxes.first.evaluate('e=>getComputedStyle(e.closest("label")).backgroundColor');plain=await boxes.nth(1).evaluate('e=>getComputedStyle(e.closest("label")).backgroundColor');assert selected!=plain;groups.append('clear-selected-state-count-keyboard-focus')
 await boxes.last.scroll_into_view_if_needed();await boxes.last.focus();scroll=await p.locator('#ai-context-choices').evaluate('e=>e.scrollTop');await p.keyboard.press('Space')
 assert abs((await p.locator('#ai-context-choices').evaluate('e=>e.scrollTop'))-scroll)<2;await expect(boxes.last).to_be_focused();await p.keyboard.press('Space');groups.append('list-scroll-and-focus-survive-selection')
 for i in[1,2,3,4]:await boxes.nth(i).click()
 await expect(count).to_have_text('Выбрано: 5 из 5');await expect(p.locator('#ai-context-limit')).to_contain_text('снимите одну отметку')
 assert await p.locator('#ai-context-choices input:checked').count()==5;assert await p.locator('#ai-context-choices input:disabled').count()==len(ENTRIES)-5
 await boxes.first.click();await expect(boxes.nth(5)).to_be_enabled();await boxes.nth(5).click();await expect(count).to_have_text('Выбрано: 5 из 5');assert not await boxes.first.is_checked();groups.append('five-limit-clear-reason-and-replace-selection')
 if width==390:await p.screenshot(path=str(H/f'{engine}-limit.png'),animations='disabled')
 await p.locator('#ai-context-preview-btn').click();await expect(p.locator('#ai-context-readable')).to_be_focused();assert len(p.previews[-1]['diaryEntryIds'])==5
 await expect(p.locator('#ai-context-review')).not_to_be_checked();await expect(p.locator('#ai-send-btn')).to_be_disabled()
 assert await p.locator('#ai-context-readable article').count()==5;await p.locator('#ai-context-exact-details summary').click();await expect(p.locator('#ai-context-preview')).to_contain_text(ENTRIES[1]['note'])
 await p.locator('#ai-context-review').check();await expect(p.locator('#ai-send-btn')).to_be_enabled();groups.append('full-preview-focused-and-separate-permission')
 await boxes.nth(1).click();await expect(p.locator('#ai-context-readable')).to_have_count(0);await expect(p.locator('#ai-context-review')).to_have_count(0);await expect(p.locator('#ai-send-btn')).to_be_disabled();groups.append('changed-selection-requires-new-preview-permission')
 await expect(p.locator('#ai-input')).to_have_value('Учебный вопрос, который должен остаться в поле.');assert not p.ai_sends;groups.append('draft-and-no-automatic-ai-send')
 p.picker_fault='preview-fail';await p.locator('#ai-context-preview-btn').click();await expect(p.locator('#ai-access-notice')).to_contain_text('Учебная ошибка просмотра');await expect(p.locator('#ai-context-preview-btn')).to_be_enabled();await expect(count).to_have_text('Выбрано: 4 из 5')
 p.picker_fault='ok';await p.locator('#ai-context-preview-btn').click();await expect(p.locator('#ai-context-readable')).to_be_focused();groups.append('preview-failure-retains-selection-and-retry')
 await p.locator('#ai-context-mode').select_option('none');await expect(count).to_have_count(0);await expect(p.locator('#ai-context-choices')).to_have_count(0);await expect(p.locator('#ai-send-btn')).to_be_enabled();groups.append('without-diary-clears-selection-approval')
 p.picker_entries=[];await p.locator('#ai-context-mode').select_option('selected');await expect(p.locator('#ai-context-choices')).to_contain_text('пока нет записей');await expect(count).to_have_text('Выбрано: 0 из 5');await expect(p.locator('#ai-context-preview-btn')).to_be_disabled();groups.append('empty-data-is-explicit')
 await p.locator('#ai-context-mode').select_option('none');p.picker_fault='fail';await p.locator('#ai-context-mode').select_option('selected');await expect(p.locator('#ai-context-reload')).to_be_visible()
 p.picker_fault='ok';p.picker_entries=ENTRIES;await p.locator('#ai-context-reload').click();await expect(boxes.first).to_be_visible();groups.append('load-failure-and-explicit-recovery')
 await p.set_viewport_size({'width':width,'height':430});await boxes.first.click();await p.locator('#ai-context-preview-btn').click();await expect(p.locator('#ai-context-readable')).to_be_focused();await p.locator('#ai-context-review').scroll_into_view_if_needed();await expect(p.locator('#ai-context-review')).to_be_in_viewport()
 await expect(p.locator('#ai-input')).to_be_in_viewport();groups.append('short-window-preview-permission-input-reachable')
 await p.wait_for_function("!document.querySelector('.screen--enter,.screen--exit,.screen--enter-back,.screen--exit-back')");assert not await p.evaluate('document.documentElement.scrollWidth>innerWidth')
 assert not p.fixture_errors and not p.fixture_dialogs and not p.ai_sends,(p.fixture_errors,p.fixture_dialogs,p.ai_sends)
 RESULTS.append({'engine':engine,'width':width,'passed':True,'groups':groups,'pageErrors':[],'realSends':0});print(engine,width,'PASS',len(groups),'groups',flush=True);await p.close()
async def main():
 async with async_playwright()as pw:
  for engine,widths in [('chromium',[320,390,1440]),('webkit',[320,390])]:
   b=await getattr(pw,engine).launch()
   try:
    for width in widths:await run(b,engine,width)
   finally:await b.close()
 (H/'ui-results.json').write_text(json.dumps(RESULTS,ensure_ascii=False,indent=2),encoding='utf-8')
asyncio.run(main())
