from fixture import boot,TEXT
from pathlib import Path
from playwright.async_api import async_playwright,expect
import asyncio,json
H=Path(__file__).parent;RESULTS=[]
async def choose(p,index=-1):
 s=p.locator('#screen-discuss');await s.get_by_role('button',name='Из заметки',exact=True).click();await s.get_by_role('button',name='Показать ещё',exact=True).click();await expect(s.locator('.dq-source-record')).to_have_count(13)
 await s.locator('.dq-source-record').nth(index).get_by_role('button').click();return s
async def select(s,start=0,end=2000):await s.locator('#dq-source-text').evaluate('(e,range)=>{e.setSelectionRange(...range);e.dispatchEvent(new Event("select"));}',[start,end])
async def run(b,engine,width):
 p=await boot(b,'http://127.0.0.1:15361/',width);groups=[];s=p.locator('#screen-discuss')
 await s.get_by_role('button',name='Из заметки',exact=True).click();await s.get_by_role('button',name='Показать ещё',exact=True).click();await expect(s.locator('.dq-source-record')).to_have_count(13)
 button=s.locator('.dq-source-record').last.get_by_role('button');await button.scroll_into_view_if_needed();position=await s.locator('.dq-scroll').evaluate('e=>e.scrollTop');await button.click()
 original=await s.locator('#dq-source-text').input_value();await select(s);await expect(s.locator('.dq-selection-status')).to_have_text('Выделено: 2000 симв.');assert len(await s.locator('.dq-selection-status').inner_text())<50
 await expect(s.locator('.dq-fragment-preview')).to_be_visible();assert not await s.locator('.dq-fragment-preview').get_attribute('open');groups.append('long-selection-has-compact-status-and-explicit-preview')
 await s.locator('.dq-fragment-preview summary').focus();await p.keyboard.press('Enter');await expect(s.locator('.dq-fragment-preview blockquote')).to_have_text(original[:2000]);assert await s.locator('.dq-fragment-preview blockquote').evaluate('e=>e.clientHeight')<=160
 await p.keyboard.press('Tab');await expect(s.locator('.dq-fragment-preview blockquote')).to_be_focused();await p.keyboard.press('PageDown');await p.wait_for_function("document.querySelector('.dq-fragment-preview blockquote').scrollTop>0")
 await s.locator('.dq-fragment-preview summary').focus();await p.keyboard.press('Enter');await expect(s.locator('#dq-use-selection')).to_be_enabled();await expect(s.locator('#dq-use-selection')).to_be_in_viewport();groups.append('full-fragment-accessible-with-bounded-reading-area')
 if width==390:await p.screenshot(path=str(H/f'{engine}-fragment.png'),animations='disabled')
 requests=[];p.on('request',lambda r:requests.append(r.url)if'/api/diary-history/search'in r.url else None)
 await s.get_by_role('button',name='Назад',exact=True).click();await expect(s.locator('.dq-source-record')).to_have_count(13);await expect(s.locator('.dq-source-record').last.get_by_role('button')).to_be_focused();assert abs((await s.locator('.dq-scroll').evaluate('e=>e.scrollTop'))-position)<2;assert not requests;groups.append('back-keeps-loaded-pages-scroll-focus-without-refetch')
 await s.locator('.dq-source-record').last.get_by_role('button').click();await select(s,40,140);excerpt=(await s.locator('#dq-source-text').input_value())[40:140].strip();await s.locator('#dq-use-selection').click();await expect(s.locator('#dq-excerpt')).to_have_value(excerpt)
 await s.locator('#dq-text').fill('Учебный вопрос к встрече.');await s.locator('#dq-excerpt').fill('Моя сокращённая копия фрагмента.');groups.append('exact-selection-copied-and-editable-separately')
 await s.get_by_role('button',name='Назад',exact=True).click();await s.get_by_role('button',name='Написать',exact=True).click();await expect(s.locator('#dq-text')).to_have_value('Учебный вопрос к встрече.');await expect(s.locator('#dq-excerpt')).to_have_value('Моя сокращённая копия фрагмента.');groups.append('editor-return-keeps-question-and-excerpt-draft')
 await p.reload();await p.wait_for_function("currentScreen==='home'&&qStatusVerified");await p.evaluate('LaunchSplash.cancel();Storage.setQSheetShown();clearTimeout(qInviteTimer);switchTab("diary");DiscussionNotes.refresh()');await p.locator('#discuss-entry').click();await s.get_by_role('button',name='Написать',exact=True).click();await expect(s.locator('#dq-excerpt')).to_have_value('Моя сокращённая копия фрагмента.');groups.append('reload-restores-own-copy-draft')
 p.discuss_fault='save-fail';await s.locator('#dq-save').click();await expect(s.locator('#dq-status')).to_contain_text('Не удалось подтвердить');await expect(s.locator('#dq-excerpt')).to_have_value('Моя сокращённая копия фрагмента.')
 first=p.discuss_writes[-1];p.discuss_fault='ok';await s.locator('#dq-save').click();await expect(s.locator('#dq-status')).to_have_text('Запись сохранена для вас.');assert p.discuss_writes[-1]==first;await expect(s.locator('.dq-detail-source blockquote')).to_have_text('Моя сокращённая копия фрагмента.');assert p.sources[-1]['text']==original;groups.append('failure-retry-same-payload-and-original-unchanged')
 await s.get_by_role('button',name='Отметить: обсудили',exact=True).click();await expect(s.locator('#dq-status')).to_contain_text('Обсудили');await s.get_by_role('button',name='Назад',exact=True).click();await s.get_by_role('button',name='Обсудили',exact=True).click();await expect(s.locator('.dq-record')).to_have_count(1);groups.append('saved-note-moves-to-discussed')
 s=await choose(p,0);whole=await s.locator('#dq-source-text').input_value();await s.get_by_role('button',name='Взять всю запись',exact=True).click();await expect(s.locator('#dq-excerpt')).to_have_value(whole)
 await s.get_by_role('button',name='Убрать',exact=True).click();await expect(s.locator('#dq-excerpt')).to_have_count(0);groups.append('whole-note-fallback-and-remove-source')
 await p.set_viewport_size({'width':width,'height':430});await s.get_by_role('button',name='Добавить фрагмент заметки',exact=True).click();await s.locator('.dq-source-record').first.get_by_role('button').click();await select(s);await s.locator('#dq-use-selection').scroll_into_view_if_needed();await expect(s.locator('#dq-use-selection')).to_be_in_viewport();await s.locator('#dq-use-selection').click();await expect(s.locator('#dq-excerpt')).to_be_visible();groups.append('short-window-selection-action-reachable')
 await p.add_style_tag(content='.dq-selection-status,.dq-fragment-preview summary{font-size:26px!important}');await p.wait_for_function("!document.querySelector('.screen--enter,.screen--exit,.screen--enter-back,.screen--exit-back')")
 assert not await p.evaluate('document.documentElement.scrollWidth>innerWidth');assert not p.fixture_errors and not p.fixture_dialogs,(p.fixture_errors,p.fixture_dialogs);groups.append('larger-text-no-overflow-or-js-errors')
 RESULTS.append({'engine':engine,'width':width,'passed':True,'groups':groups,'originalUnchanged':True,'realWrites':0});print(engine,width,'PASS',len(groups),'groups',flush=True);await p.close()
async def main():
 async with async_playwright()as pw:
  for engine,widths in[('chromium',[320,390,1440]),('webkit',[320,390])]:
   b=await getattr(pw,engine).launch()
   try:
    for width in widths:await run(b,engine,width)
   finally:await b.close()
 (H/'ui-results.json').write_text(json.dumps(RESULTS,ensure_ascii=False,indent=2),encoding='utf-8')
asyncio.run(main())
