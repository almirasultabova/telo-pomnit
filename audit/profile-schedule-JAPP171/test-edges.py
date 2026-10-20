from fixture import boot
from playwright.async_api import async_playwright,expect
from pathlib import Path
import asyncio,json
H=Path(__file__).parent
async def main():
 rows=[]
 async with async_playwright()as pw:
  for engine in ['chromium','webkit']:
   b=await getattr(pw,engine).launch();p=await boot(b,'http://127.0.0.1:15371/',390);groups=[]
   p.profile_gate=asyncio.Event();await p.evaluate("window.refreshCheckDone=false;void refreshProfileSchedule().then(()=>window.refreshCheckDone=true)");await expect(p.locator('#profile-schedule-refresh')).to_be_disabled();await p.evaluate("switchTab('main')");focus=await p.evaluate('document.activeElement.id');p.profile_gate.set();await p.wait_for_function('window.refreshCheckDone');assert await p.evaluate("currentScreen==='home'&&activeTab==='main'");assert await p.evaluate('document.activeElement.id')==focus;await p.evaluate("switchTab('profile')");await expect(p.locator('#profile-schedule-refresh')).to_be_enabled();groups.append('late response neither changes tab nor steals focus and return is usable')
   p.profile_gate=asyncio.Event();await p.evaluate("window.refreshCheckDone=false;void refreshProfileSchedule().then(()=>window.refreshCheckDone=true)");await expect(p.locator('#profile-schedule-refresh')).to_be_disabled();await p.evaluate("clearPrivateConversationState();Api._authGeneration++;applyProgramAccess({serverTime:new Date().toISOString(),ai:{canWrite:false},streams:[]});renderProfileTab()");p.profile_gate.set();await p.wait_for_function('window.refreshCheckDone');assert await p.evaluate('programAccess.streams.length')==0;await expect(p.locator('#profile-schedule-status')).to_be_hidden();await expect(p.locator('#profile-schedule-refresh')).to_be_enabled();groups.append('old identity response cannot restore schedule or feedback')
   p.profile_gate=None;p.profile_access['streams']=[];await p.locator('#profile-schedule-refresh').click();await expect(p.locator('#profile-schedule-status')).to_have_text('Расписание обновлено.');await expect(p.locator('#next-meeting-card')).to_contain_text('Сейчас вам не открыт поток');groups.append('empty access is distinct from refresh failure')
   p.profile_fault=True;await p.locator('#profile-schedule-refresh').click();await expect(p.locator('#profile-schedule-status')).to_contain_text('Не удалось');await expect(p.locator('#owned-stream-select')).to_have_count(0);assert not await p.locator('#zoom-btn-wrap a').count();groups.append('failed refresh preserves empty access without granting links')
   assert not p.fixture_errors,p.fixture_errors;rows.append({'engine':engine,'groups':groups,'realWrites':0});print(engine,'PASS',len(groups),'edges',flush=True);await b.close()
 (H/'edge-results.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
asyncio.run(main())
