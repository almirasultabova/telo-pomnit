from pathlib import Path
from fixture import boot
from playwright.async_api import async_playwright,expect
import asyncio,json
H=Path(__file__).parent
async def main():
 results={}
 async with async_playwright()as pw:
  b=await pw.chromium.launch();p,f=await boot(b,side='before');p.gates['stats']=asyncio.Event();await f.locator('[data-view="stats"]').click();await p.started['stats'].wait();results['pendingStats']={'activeTab':await f.locator('[data-view="stats"]').get_attribute('aria-current'),'previousPeopleStillVisible':await f.locator('[data-person]').count(),'notice':await f.locator('#notice').text_content()};p.gates['stats'].set();await expect(f.locator('.metrics')).to_be_visible();await p.close()
  p,f=await boot(b,side='before');await f.locator('[data-view="streams"]').click();await expect(f.locator('[data-stream]')).to_have_count(1);p.model.streams.append({'id':'demo-new','name':'Новый учебный поток','startDate':'2026-11-15','endDate':'2026-12-15','isActive':True});await f.locator('#refresh').click();results['refreshStreams']={'rendered':await f.locator('[data-stream]').count(),'apiCount':len([r for r in p.model.calls if r['path']=='/access-admin/streams']),'actualAvailable':len(p.model.streams)};await p.close()
  p,f=await boot(b,side='before',streams=[]);await f.locator('[data-view="streams"]').click();results['emptyStreams']={'text':await f.locator('#content').text_content(),'rows':await f.locator('[data-stream]').count()};await p.close();await b.close()
 (H/'probe.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8');print('Recorded three actual baseline problems; synthetic API only')
asyncio.run(main())
