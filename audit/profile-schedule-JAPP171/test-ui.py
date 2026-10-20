from fixture import boot,ACCESS
from playwright.async_api import async_playwright,expect
from pathlib import Path
import asyncio,json
H=Path(__file__).parent;ORIGIN='http://127.0.0.1:15371/'
async def main():
 rows=[]
 async with async_playwright()as pw:
  for engine,width in [('chromium',320),('chromium',390),('chromium',1440),('webkit',320),('webkit',390)]:
   b=await getattr(pw,engine).launch();p=await boot(b,ORIGIN,width);groups=[];select=p.locator('#owned-stream-select');refresh=p.locator('#profile-schedule-refresh');status=p.locator('#profile-schedule-status')
   await select.select_option(index=1);await expect(p.locator('#owned-stream-select')).to_be_focused();await expect(select).to_have_value(ACCESS['streams'][1]['id']);groups.append('stream choice and keyboard focus retained')
   p.profile_gate=asyncio.Event();await refresh.click();await expect(refresh).to_have_text('Обновляем…');await expect(refresh).to_be_disabled();await expect(refresh).to_have_attribute('aria-busy','true');count=p.profile_reads;await p.evaluate('refreshProfileSchedule();renderProfileTab()');await expect(refresh).to_be_disabled();assert p.profile_reads==count;await p.screenshot(path=str(H/f'{engine}-{width}-loading.png'));groups.append('loading label and disabled state survive redraw without duplicate request')
   p.profile_fault=True;p.profile_gate.set();await expect(status).to_contain_text('последние загруженные данные');await expect(refresh).to_have_text('Попробовать ещё раз');await expect(refresh).to_be_enabled();await expect(refresh).to_be_focused();await expect(select).to_have_value(ACCESS['streams'][1]['id']);assert await p.locator('#next-meeting-card').get_by_text('Не удалось обновить расписание. Показаны последние загруженные данные.',exact=True).count()==1;groups.append('single nearby error and explicit retry preserve prior stream');await p.screenshot(path=str(H/f'{engine}-{width}-error.png'))
   p.profile_fault=False;p.profile_gate=None;await refresh.click();await expect(status).to_have_text('Расписание обновлено.');await expect(refresh).to_have_text('Обновить расписание');await expect(refresh).to_be_focused();await expect(refresh).to_have_attribute('aria-busy','false');await expect(select).to_have_value(ACCESS['streams'][1]['id']);groups.append('success visibly confirmed with restored action focus');await p.screenshot(path=str(H/f'{engine}-{width}-ready.png'))
   await select.select_option(index=0);p.profile_gate=asyncio.Event();await refresh.click();await select.select_option(index=1);await expect(select).to_be_focused();p.profile_gate.set();await expect(refresh).to_be_enabled();await expect(select).to_be_focused();await expect(select).to_have_value(ACCESS['streams'][1]['id']);groups.append('changing stream during refresh retains chosen stream and focus')
   assert not p.fixture_errors,p.fixture_errors;assert not await p.evaluate('document.documentElement.scrollWidth>innerWidth');assert not p.fixture_posts;groups.append('no page errors horizontal overflow or participant writes');rows.append({'engine':engine,'width':width,'groups':groups,'realWrites':0});print(engine,width,'PASS',len(groups),flush=True);await b.close()
 (H/'ui-results.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
asyncio.run(main())
