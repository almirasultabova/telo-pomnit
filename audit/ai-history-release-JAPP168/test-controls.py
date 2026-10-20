from fixture import boot
from playwright.async_api import async_playwright,expect
from pathlib import Path
import asyncio,json
H=Path(__file__).parent
async def main():
 rows=[]
 async with async_playwright()as pw:
  for engine in['chromium','webkit']:
   b=await getattr(pw,engine).launch()
   for width in[320,390]:
    p=await boot(b,'https://tg-app-telo-pomnit.vercel.app/',width);await expect(p.locator('#ai-access-refresh')).to_have_count(0);await expect(p.locator('#ai-history-retry')).to_be_hidden();await p.locator('#ai-history-select').select_option('history-a');await p.wait_for_function("aiSessionId==='history-a'&&!aiHistoryLoading");p.history_fault='detail';await p.locator('#ai-history-select').select_option('history-b');await p.wait_for_function('!aiHistoryLoading');retry=p.locator('#ai-history-retry');await expect(retry).to_have_text('Попробовать ещё раз');await expect(retry).to_be_focused()
    await p.keyboard.press('Tab');await p.keyboard.press('Shift+Tab');await expect(retry).to_be_focused();metrics=await retry.evaluate("x=>({border:getComputedStyle(x).borderTopWidth,outlineOffset:getComputedStyle(x).outlineOffset,scroll:x.scrollWidth,client:x.clientWidth})");assert metrics['border']=='0px'and metrics['outlineOffset']=='-3px'and metrics['scroll']<=metrics['client'],metrics
    await p.screenshot(path=str(H/f'{engine}-{width}-single-retry.png'))
    await retry.evaluate("x=>x.style.fontSize='26px'");await retry.focus();await retry.scroll_into_view_if_needed();assert await retry.evaluate('x=>x.scrollWidth<=x.clientWidth');box=await retry.bounding_box();assert box['x']>=0 and box['x']+box['width']<=width+1;p.history_fault=None;await retry.click();await p.wait_for_function("aiSessionId==='history-b'&&!aiHistoryLoading");await expect(retry).to_be_hidden();assert not p.fixture_errors and not p.history_sends;rows.append({'engine':engine,'width':width,'singleErrorOnlyAction':True,'textFitsAt26px':True,'singleFocusContour':True});await p.close()
   await b.close()
 (H/'control-results.json').write_text(json.dumps(rows,indent=2),encoding='utf-8');print('PASS four browser/width cases: one error-only action, inset focus and enlarged text')
asyncio.run(main())
