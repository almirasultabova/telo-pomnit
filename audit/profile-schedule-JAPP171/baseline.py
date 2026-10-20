from fixture import boot
from playwright.async_api import async_playwright,expect
from pathlib import Path
import asyncio,json
H=Path(__file__).parent
async def main():
 results=[]
 async with async_playwright()as pw:
  for engine in ['chromium','webkit']:
   b=await getattr(pw,engine).launch();p=await boot(b,'http://127.0.0.1:15369/',390);await p.locator('#owned-stream-select').select_option(index=1);focusAfterSelect=await p.evaluate('document.activeElement.tagName');p.profile_gate=asyncio.Event();await p.locator('.program-refresh').click();await expect(p.locator('.program-refresh')).to_be_disabled();loadingText=await p.locator('.program-refresh').inner_text();await p.screenshot(path=str(H/f'{engine}-before-loading.png'));p.profile_gate.set();await expect(p.locator('.program-refresh')).to_be_enabled();focusAfterRefresh=await p.evaluate('document.activeElement.tagName');successText=await p.locator('#next-meeting-card').inner_text();results.append({'engine':engine,'focusAfterSelect':focusAfterSelect,'loadingButtonText':loadingText,'focusAfterRefresh':focusAfterRefresh,'successVisible':'обновлено'in successText.lower(),'selectedStreamRetained':await p.locator('#owned-stream-select').input_value(),'pageErrors':p.fixture_errors});print(engine,focusAfterSelect,loadingText,focusAfterRefresh,flush=True);await b.close()
 (H/'baseline.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
asyncio.run(main())
