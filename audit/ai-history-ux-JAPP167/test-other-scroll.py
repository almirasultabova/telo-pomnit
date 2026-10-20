from fixture import boot
from playwright.async_api import async_playwright
from pathlib import Path
import asyncio,json
H=Path(__file__).parent
async def main():
 rows=[]
 async with async_playwright()as pw:
  for engine in['chromium','webkit']:
   b=await getattr(pw,engine).launch();p=await boot(b,'http://127.0.0.1:15367/');await p.evaluate("goTo('feedback')");field=p.locator('#fb-text');text='Учебная строка.\n'*80;await field.fill(text);await field.focus();await p.keyboard.press('PageDown');await p.wait_for_function("document.getElementById('fb-text').scrollTop>0");assert await field.input_value()==text;assert await field.evaluate("x=>getComputedStyle(x).scrollbarWidth==='none'||getComputedStyle(x,'::-webkit-scrollbar').display==='none'")
   value='Учебное содержимое.\n'*200
   await p.evaluate("text=>{ensureDataRightsScreen();DataRightsApi.userId=Storage._userId;goTo('data-rights');downloadPrivateFile(text,'application/json','synthetic.json')}",value);await p.locator('#screen-data-export-preview summary').click();pre=p.locator('#screen-data-export-preview pre');await pre.focus();await p.keyboard.press('PageDown');await p.wait_for_function("document.querySelector('#screen-data-export-preview pre').scrollTop>0");assert await pre.text_content()==value;assert await pre.evaluate("x=>getComputedStyle(x).scrollbarWidth==='none'||getComputedStyle(x,'::-webkit-scrollbar').display==='none'");assert not p.fixture_errors,p.fixture_errors;rows.append({'engine':engine,'feedbackTextareaScrollPreserved':True,'copyPreviewKeyboardScrollPreserved':True,'textUnchanged':True});await b.close()
 (H/'other-scroll-results.json').write_text(json.dumps(rows,indent=2),encoding='utf-8');print('PASS hidden scrollbars preserve feedback field and copy preview reading in Chromium/WebKit')
asyncio.run(main())
