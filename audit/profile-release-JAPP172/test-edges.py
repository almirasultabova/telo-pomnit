import asyncio,importlib.util,json
from pathlib import Path
from playwright.async_api import async_playwright,expect
H=Path(__file__).parent
spec=importlib.util.spec_from_file_location('checks',H/'test-profile.py');checks=importlib.util.module_from_spec(spec);spec.loader.exec_module(checks)
async def main():
 results=[]
 async with async_playwright()as pw:
  browser=await pw.chromium.launch()
  before=await checks.boot(browser,side='before');after=await checks.boot(browser)
  for page in [before,after]:await page.evaluate('document.fonts.ready');await page.locator('.ss-hero').wait_for();await page.locator('#q-banner-wrap .q-banner').wait_for()
  for selector in ['.ss-hero','.ss-hero .ss-title','#q-banner-wrap .q-banner']:
   if not await before.locator(selector).count():continue
   expr="el=>{const s=getComputedStyle(el);return Object.fromEntries(['fontFamily','fontSize','color','backgroundColor','backgroundImage','borderRadius','padding','width'].map(k=>[k,s[k]]))}"
   a=await before.locator(selector).evaluate(expr);b=await after.locator(selector).evaluate(expr);assert a==b,(selector,a,b)
  results.append('original hero and first-week card appearance retained')
  assert not await after.locator('.prototype-marks,[data-pc-mark]').count()
  await after.evaluate("tg.openTelegramLink=u=>{window.testTelegramLink=u}")
  await after.locator('.pc-meeting-entry [data-profile-action=chat]').click();assert await after.evaluate('window.testTelegramLink')=='https://t.me/example'
  results.append('real chat action runs through Telegram without preview interception')
  await after.locator('[data-profile-action=meetings]').click();await after.locator('[data-focus-key=past]').click();await after.locator('#screen-profile-meetings [data-program-meeting=meeting-1]').click();await after.locator('.meeting-attendance-btn').count()
  await checks.telegram_back(after);await checks.telegram_back(after)
  await after.reload();await after.wait_for_function("Api.isAuthed()&&programAccess");await after.evaluate("()=>{LaunchSplash.cancel();switchTab('profile')}");await expect(after.locator('.pc-meeting-entry')).to_be_visible()
  assert not after.failures,after.failures
  await after.wait_for_function("!document.querySelector('.screen--exit-forward,.screen--exit-back')");await after.wait_for_timeout(250)
  await after.screenshot(path=str(H/'profile-390.png'),full_page=True)
  results.append('page reload retains Profile and working entries')
  await before.close();await after.close();await browser.close()
 (H/'edges.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8');print('PASS',len(results),'release-specific checks')
asyncio.run(main())
