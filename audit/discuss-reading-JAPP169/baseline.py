from fixture import boot
from playwright.async_api import async_playwright
from pathlib import Path
import asyncio,json
H=Path(__file__).parent
async def main():
 rows=[]
 async with async_playwright()as pw:
  for engine in ['chromium','webkit']:
   b=await getattr(pw,engine).launch();p=await boot(b,'http://127.0.0.1:15367/',390);open=p.locator('.dq-record .dq-link').nth(12);await open.scroll_into_view_if_needed();before=await p.locator('.dq-scroll').evaluate('x=>x.scrollTop');await open.click();detailFocus=await p.evaluate('document.activeElement.tagName');await p.locator('.dq-back').click();after=await p.locator('.dq-scroll').evaluate('x=>x.scrollTop');await p.screenshot(path=str(H/f'{engine}-before-return.png'))
   await p.locator('.dq-record .dq-link').nth(12).click();await p.get_by_role('button',name='Редактировать',exact=True).click();await p.locator('#dq-text').fill('Учебный текст, который нужно сохранить');p.save_code=503;await p.locator('#dq-save').click();await p.wait_for_function("document.querySelector('#dq-status')?.textContent.includes('Не удалось')");errorFocus=await p.evaluate('document.activeElement.tagName');await p.screenshot(path=str(H/f'{engine}-before-error.png'))
   rows.append({'engine':engine,'width':390,'listScrollBefore':before,'listScrollAfterBack':after,'detailFocus':detailFocus,'saveErrorFocus':errorFocus,'draftRetained':await p.locator('#dq-text').input_value(),'pageErrors':p.fixture_errors});print(engine,'baseline',before,after,detailFocus,errorFocus,flush=True);await b.close()
 (H/'baseline.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
asyncio.run(main())
