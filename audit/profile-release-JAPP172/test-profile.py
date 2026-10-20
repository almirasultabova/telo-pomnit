"""Regressions for the concrete Profile faults; local synthetic server only."""
import asyncio,json,re,uuid
from pathlib import Path
from playwright.async_api import async_playwright,expect
HERE=Path(__file__).resolve().parent
ORIGIN='http://127.0.0.1:15374'
RESULTS=[]

async def boot(browser,state='current',width=390,side='after'):
 page=await browser.new_page(viewport={'width':width,'height':844})
 page.failures=[];page.writes=[]
 page.on('pageerror',lambda e:page.failures.append(str(e)))
 page.on('request',lambda r:page.writes.append(r.url)if r.method=='POST'else None)
 await page.add_init_script("Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{window.syntheticClipboard=value}}})")
 await page.goto(f'{ORIGIN}/{side}/index.html?owner=preview&state={state}&run={uuid.uuid4().hex}&marks=0#tgWebAppPlatform=ios&tgWebAppVersion=8.0',wait_until='domcontentloaded')
 await page.wait_for_function("typeof activeTab!=='undefined'&&activeTab==='profile'&&currentScreen==='home'&&Api.isAuthed()")
 return page

async def telegram_back(page):
 await page.evaluate('Telegram.WebView.receiveEvent("back_button_pressed",{})')

async def check_states(browser,engine):
 for state in ['current','filled','single','completed','completed-filled','upcoming','none','multiple','expired','no-recording','host']:
  page=await boot(browser,state)
  if state!='host' and state!='none':await page.wait_for_function('qStatusVerified')
  await page.evaluate('document.fonts.ready')
  if state in ['current','single','upcoming','multiple','no-recording']:
   await expect(page.locator('#q-banner-wrap .q-banner')).to_be_visible()
   assert await page.evaluate("()=>document.querySelector('.ss-hero').getBoundingClientRect().bottom<=document.querySelector('#q-banner-wrap').getBoundingClientRect().top&&document.querySelector('#q-banner-wrap').getBoundingClientRect().bottom<=document.querySelector('.pc-meeting-entry').getBoundingClientRect().top")
  if state in ['filled','completed','completed-filled','expired']:await expect(page.locator('#q-banner-wrap')).to_be_hidden()
  if state=='host':await expect(page.locator('#q-banner-wrap')).to_be_hidden();assert await page.locator('[data-reflection]').count()==0
  await expect(page.locator('#profile-stats')).to_contain_text('12')
  await expect(page.locator('#hosts-list .host-card-mini')).to_have_count(2)
  if state=='upcoming':await expect(page.locator('.ss-status')).to_have_text('Начнётся скоро');await expect(page.locator('.ss-personal-row[data-personal=diary]')).to_be_visible()
  if state=='completed-filled':await expect(page.locator('[data-reflection]')).to_contain_text('Посмотреть мой путь')
  if state=='single':
   await page.locator('[data-profile-action=meetings]').click();await expect(page.locator('#screen-profile-meetings [data-profile-action=streams]')).to_have_count(0);await telegram_back(page)
   await page.wait_for_function("!document.querySelector('.screen--exit-back')")
  assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth'),state
  assert not page.failures,(state,page.failures)
  RESULTS.append({'engine':engine,'state':state,'ok':True});await page.close()

async def check_routes(browser,engine):
 page=await boot(browser,'multiple');await page.wait_for_function('qStatusVerified')
 await page.locator('[data-profile-action=meetings]').click();await page.wait_for_function("currentScreen==='profile-meetings'")
 assert await page.evaluate('tg.BackButton.isVisible')
 await page.keyboard.press('Shift+Tab');assert await page.evaluate("document.getElementById('screen-profile-meetings').contains(document.activeElement)")
 for _ in range(18):
  await page.keyboard.press('Tab');assert await page.evaluate("document.getElementById('screen-profile-meetings').contains(document.activeElement)")
 await page.locator('#screen-profile-meetings [data-profile-action=streams]').click();await page.wait_for_function("currentScreen==='profile-streams'")
 await expect(page.locator('#screen-profile-streams')).to_contain_text('Второй действующий поток')
 await page.locator('#screen-profile-streams [data-profile-action=second-current]').click();await page.wait_for_function("currentScreen==='profile-meetings'&&selectedProgramId==='second-current'")
 await page.locator('#screen-profile-meetings [data-profile-action=streams]').click();await page.locator('#screen-profile-streams [data-profile-action=past-example]').click()
 await expect(page.locator('#screen-profile-meetings .pc-stream-name')).to_have_text('Сентябрьский поток')
 await page.locator('#screen-profile-meetings [data-program-meeting=past-meeting]').click();await expect(page.locator('#program-meeting-dialog')).to_be_visible()
 await expect(page.locator('.meeting-recording')).to_contain_text('Запись эфира');await expect(page.locator('#meeting-recording-passcode')).to_have_value('ПРИМЕР-123')
 assert await page.locator('.meeting-panel-body a').filter(has_text='Присоединиться').count()==0
 await page.locator('.meeting-code-copy').click();assert await page.evaluate('window.syntheticClipboard')=='ПРИМЕР-123'
 await telegram_back(page);await expect(page.locator('#program-meeting-dialog')).not_to_be_visible();await page.wait_for_function("currentScreen==='profile-meetings'")
 await telegram_back(page);await page.wait_for_function("currentScreen==='home'&&selectedProgramId==='ui-preview-stream'")
 await expect(page.locator('[data-profile-action=meetings]')).to_be_focused()
 await page.locator('[data-personal=diary]').click();await expect(page.locator('#tab-diary')).to_have_class(re.compile('active'))
 await page.evaluate('switchTab("profile")');await page.locator('[data-personal=diag]').click();await expect(page.locator('#tab-diag')).to_have_class(re.compile('active'))
 assert not page.failures,page.failures;RESULTS.append({'engine':engine,'routes':'flows/back/focus/recording/code/personal','ok':True});await page.close()

async def check_errors(browser,engine):
 page=await boot(browser);await page.wait_for_function('qStatusVerified')
 failed=True;gate=None
 async def status(route):
  if gate:await gate.wait()
  if failed:return await route.fulfill(status=503,json={'error':'Synthetic error'})
  return await route.fulfill(json={'pre':None,'post':None})
 await page.route('**/api/questionnaires/**',status)
 await page.evaluate('()=>{void checkAndShowQuestionnaire(selectedProgramId)}');await page.wait_for_function("qStatusState==='error'")
 await expect(page.locator('#q-status-retry')).to_be_visible();await expect(page.locator('#q-banner-wrap')).to_contain_text('Не удалось проверить')
 failed=False;await page.locator('#q-status-retry').click();await page.wait_for_function('qStatusVerified');await expect(page.locator('#q-banner-wrap .q-banner')).to_be_visible()
 gate=asyncio.Event();await page.evaluate('()=>{void checkAndShowQuestionnaire(selectedProgramId)}');await page.wait_for_function("qStatusState==='loading'")
 await expect(page.locator('#q-banner-wrap')).to_be_visible();await expect(page.locator('#q-banner-wrap')).to_contain_text('Проверяем анкету')
 gate.set();await page.wait_for_function('qStatusVerified')
 async def bad_access(route):await route.fulfill(status=503,json={'error':'Synthetic access error'})
 await page.route('**/api/me/enrollment/access',bad_access);await page.evaluate('async()=>{await refreshProgramAccess();renderProfileTab()}')
 await expect(page.locator('.pc-recovery')).to_contain_text('последние загруженные даты');await expect(page.locator('.pc-recovery button')).to_be_visible()
 await page.unroute('**/api/me/enrollment/access',bad_access);await page.locator('.pc-recovery button').click();await expect(page.locator('.pc-recovery')).to_have_count(0)
 assert not page.failures,page.failures;RESULTS.append({'engine':engine,'errors':'503/retry/pending/access-retry','ok':True});await page.close()

async def check_expiry(browser,engine):
 page=await boot(browser,'no-recording');await page.locator('[data-profile-action=meetings]').click();await page.locator('[data-focus-key=past]').click()
 await expect(page.locator('#screen-profile-meetings .pc-meeting-list')).to_contain_text('Запись пока не добавлена');await page.close()
 page=await boot(browser);await page.locator('[data-profile-action=meetings]').click();await page.locator('[data-focus-key=past]').click();await page.locator('#screen-profile-meetings [data-program-meeting=meeting-1]').click()
 await expect(page.locator('.meeting-recording')).to_be_visible()
 await page.evaluate("()=>{const access=structuredClone(programAccess);access.streams[0].canReadRecordings=false;access.streams[0].recordingsExpiresAt='2026-10-01T00:00:00Z';applyProgramAccess(access);MeetingPanel.sync()}")
 await expect(page.locator('.meeting-recording')).to_have_count(0);await expect(page.locator('.pc-recording-state')).to_contain_text('завершён')
 assert not page.failures,page.failures;RESULTS.append({'engine':engine,'recordings':'missing/expiry-while-open','ok':True});await page.close()

async def check_submit(browser,engine):
 page=await boot(browser);await page.wait_for_function('qStatusVerified');await page.locator('#q-banner-wrap .q-banner').click()
 await page.evaluate("()=>{qAnswers={};for(const block of Q_BLOCKS)for(const f of block.fields)if(f.required)qAnswers[f.id]=f.type==='radio'?f.options[0]:f.type==='checkbox'?[f.options[0]]:f.type==='scale'?5:'Учебный ответ';qStep=Q_BLOCKS.length-1;renderQBlock()}")
 async def reject(route):await route.fulfill(status=503,json={'error':'Synthetic submit error'})
 await page.route('**/api/questionnaires/pre',reject);await page.locator('#q-next-btn').click();await expect(page.locator('#q-send-error')).to_be_visible();assert not await page.evaluate('qStatusDone')
 assert await page.evaluate('Object.keys(qAnswers).length')>0
 await page.unroute('**/api/questionnaires/pre',reject);await page.locator('#q-next-btn').click();await page.wait_for_function('qStatusVerified&&qStatusDone')
 await page.evaluate('closeQuestionnaire()');await expect(page.locator('#q-banner-wrap')).to_be_hidden();await expect(page.locator('.pc-meeting-entry')).to_be_visible()
 assert not page.failures,page.failures;RESULTS.append({'engine':engine,'submit':'failure-keeps-input/success-hides-card','ok':True});await page.close()

async def main():
 async with async_playwright()as pw:
  for engine in ['chromium','webkit']:
   browser=await getattr(pw,engine).launch()
   await check_states(browser,engine);await check_routes(browser,engine);await check_errors(browser,engine);await check_expiry(browser,engine);await check_submit(browser,engine)
   await browser.close();print(engine,'passed',flush=True)
  browser=await pw.chromium.launch()
  for width in [320,430]:
   page=await boot(browser,width=width);await page.locator('#q-banner-wrap .q-banner').wait_for();await page.evaluate('document.fonts.ready');assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth');RESULTS.append({'width':width,'ok':True});await page.close()
  await browser.close()
 (HERE/'checks.json').write_text(json.dumps(RESULTS,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'groups':len(RESULTS),'all':True}),flush=True)

if __name__=='__main__':asyncio.run(main())
