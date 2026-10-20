from fixture import boot
from playwright.async_api import async_playwright,expect
from pathlib import Path
import asyncio,json,os
H=Path(__file__).parent;ORIGIN=os.environ.get('RIGHTS_ORIGIN','http://127.0.0.1:15676/');RESULTS=[]
async def deletion_form(p):
 await p.locator('#data-delete-start').click();await p.locator('#data-delete-phrase').fill('УДАЛИТЬ МОИ ДАННЫЕ')
async def check(browser,engine,width):
 p=await boot(browser,ORIGIN,width);groups=[]
 await p.locator('#data-delete-start').click();await expect(p.locator('#data-delete-phrase')).to_be_focused();await expect(p.locator('#data-delete-submit')).to_be_disabled();await p.locator('#data-delete-phrase').fill('Удалить');await expect(p.locator('#data-delete-submit')).to_be_disabled();assert not p.delete_calls;groups.append('opening and incomplete phrase cannot delete')
 await p.locator('#data-delete-cancel').click();await expect(p.locator('#data-delete-confirm')).not_to_be_visible();await expect(p.locator('#data-delete-start')).to_be_focused();await expect(p.locator('#data-delete-start')).to_be_in_viewport();assert not p.delete_calls;groups.append('cancel clears confirmation and restores the visible start action')
 await p.evaluate("Storage.saveAiDraft(null,'Учебный черновик, который нельзя потерять при сбое')")
 await deletion_form(p);p.delete_gate=asyncio.Event();await p.locator('#data-delete-submit').click();await asyncio.wait_for(p.delete_started.wait(),10);await expect(p.locator('#data-delete-submit')).to_have_text('Удаляем данные…');await expect(p.locator('#data-delete-submit')).to_have_attribute('aria-busy','true');await expect(p.locator('#data-delete-cancel')).to_be_disabled();await expect(p.locator('#data-rights-close')).to_be_disabled();assert len(p.delete_calls)==1
 await p.evaluate('closeDataRights()');assert await p.evaluate('currentScreen')=='data-rights';groups.append('pending is visible and blocks duplicate action and leaving')
 p.delete_gate.set();await expect(p.locator('#data-rights-status')).to_contain_text('Данные не удалены');await expect(p.locator('#data-rights-status')).to_be_focused();await expect(p.locator('#data-rights-status')).to_be_in_viewport();await expect(p.locator('#data-delete-submit')).to_be_enabled();assert await p.evaluate("Storage.getAiDraft(null)")=='Учебный черновик, который нельзя потерять при сбое';groups.append('error is visible and focused; saved draft remains intact')
 before=len(p.delete_calls);await p.locator('#data-rights-retry').click();await expect(p.locator('#data-rights-actions')).to_be_visible();await expect(p.locator('#data-delete-confirm')).not_to_be_visible();assert len(p.delete_calls)==before;groups.append('retry re-verifies identity without repeating deletion')
 await p.locator('#data-export-local').evaluate("el=>{const d=el.closest('details');if(d)d.open=true}");await p.locator('#data-export-local').click();await expect(p.locator('#screen-data-export-preview')).to_be_visible();await expect(p.locator('#screen-data-export-preview .screen-title')).to_have_text('Неотправленные записи')
 await p.locator('#private-preview-close').click();await expect(p.locator('#data-export-local')).to_be_focused();groups.append('local copy and back retain previous behavior')
 await p.locator('#data-export-json').click();await expect(p.locator('#screen-data-export-preview')).to_be_visible();await p.locator('#private-preview-close').click();await expect(p.locator('#data-export-json')).to_be_focused();groups.append('server copy and back retain previous behavior')
 await p.locator('#data-export-pdf').click();await expect(p.locator('.pdf-ready-panel')).to_be_visible();groups.append('PDF preparation remains available')
 await p.wait_for_function("!document.querySelector('.screen--exit,.screen--enter,.screen--exit-back,.screen--enter-back')");assert not await p.evaluate('document.documentElement.scrollWidth>innerWidth');assert not p.fixture_errors,p.fixture_errors;groups.append('no JS errors or horizontal overflow')
 RESULTS.append({'engine':engine,'width':width,'groups':groups});print(engine,width,'PASS',len(groups),flush=True);await p.close()
async def edges(browser,engine):
 p=await boot(browser,ORIGIN);await deletion_form(p);p.delete_mode='ok';await p.locator('#data-delete-submit').click();await p.wait_for_function('DataRightsApi.accountDeleted');await expect(p.locator('#data-rights-status')).to_contain_text('удалены');assert await p.evaluate('Api.clubBlocked');await expect(p.locator('#data-delete-start')).to_be_hidden();assert len(p.delete_calls)==1;assert not p.fixture_errors;await p.close();RESULTS.append({'engine':engine,'edge':'synthetic success closes account and hides destructive entry','ok':True})
 p=await boot(browser,ORIGIN);await deletion_form(p);p.rights_fault='/auth/data-rights';await p.locator('#data-delete-submit').click();await expect(p.locator('#data-rights-status')).to_be_focused();assert not p.delete_calls;await expect(p.locator('#data-rights-close')).to_be_enabled();await p.close();RESULTS.append({'engine':engine,'edge':'failed identity verification never sends DELETE','ok':True})
 p=await boot(browser,ORIGIN);await p.locator('#data-delete-start').click();await p.locator('#data-delete-phrase').fill('УДАЛИТЬ МОИ ДАННЫЕ');await p.locator('#data-delete-cancel').click();await p.locator('#data-delete-start').click();await expect(p.locator('#data-delete-phrase')).to_have_value('');await expect(p.locator('#data-delete-submit')).to_be_disabled();await p.set_viewport_size({'width':390,'height':430});await p.locator('#data-delete-phrase').focus();await expect(p.locator('#data-delete-phrase')).to_be_in_viewport();assert not p.delete_calls;await p.close();RESULTS.append({'engine':engine,'edge':'cancel requires a new confirmation; short window input visible','ok':True})
async def main():
 async with async_playwright()as pw:
  for engine,widths in [('chromium',[320,390,1440]),('webkit',[390])]:
   b=await getattr(pw,engine).launch()
   for width in widths:await check(b,engine,width)
   await edges(b,engine);await b.close()
 (H/os.environ.get('RIGHTS_RESULT','checks.json')).write_text(json.dumps(RESULTS,ensure_ascii=False,indent=2),encoding='utf-8')
if __name__=='__main__':asyncio.run(main())
