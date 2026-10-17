from pathlib import Path
from playwright.sync_api import sync_playwright,expect
import json
HERE=Path(__file__).resolve().parent;checks=[]
with sync_playwright() as p:
 for engine,width,height in [('chromium',390,844),('webkit',320,740),('chromium',375,812)]:
  browser=getattr(p,engine).launch(headless=True)
  for view in ['stream-current','stream-completed']:
   page=browser.new_page(viewport={'width':width,'height':height});errors=[];requests=[]
   page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
   page.goto('http://127.0.0.1:8912/screen-review.html?view='+view,wait_until='domcontentloaded');expect(page.locator('.stream-state-panel')).to_be_visible();page.evaluate('document.fonts.ready')
   ended=view=='stream-completed';expect(page.locator('.ss-status')).to_have_text('Поток завершён'if ended else'Поток идёт')
   expect(page.locator('.ss-recordings')).to_contain_text('после окончания потока');expect(page.locator('.ss-recordings')).to_contain_text('5 февраля 2027')
   assert page.locator('#tab-profile').evaluate('e=>e.scrollWidth<=e.clientWidth')
   assert page.locator('.ss-live a').count()==(0 if ended else 1)
   page.screenshot(path=str(HERE/f'{engine}-{width}-{view}.png'))
   page.locator('[data-personal="diary"]').click();expect(page.locator('#tab-diary')).to_be_visible();page.locator('.nav-btn[data-tab="profile"]').click();expect(page.locator('.stream-state-panel')).to_be_visible()
   if ended:
    expect(page.locator('[data-reflection]')).to_be_visible();page.locator('[data-reflection]').click();expect(page.locator('#screen-post-questionnaire')).to_be_visible()
    page.evaluate("goTo('home',true);switchTab('profile')")
   else:assert page.locator('[data-reflection]').count()==0
   page.locator('#program-calendar>summary').click();expect(page.locator('#schedule-section')).to_be_visible()
   page.evaluate('renderProfileTab()');expect(page.locator('#program-calendar')).to_have_attribute('open','')
   page.evaluate("window.groupCalls=[];Telegram.WebApp.openTelegramLink=u=>groupCalls.push(u);0")
   page.locator('.ss-group-btn').click();assert page.evaluate('groupCalls.length')==1
   # Reaching the expiry while the app stays open must prevent navigation.
   page.evaluate("groupCalls=[];programClock={server:Date.parse(currentProgram().recordingsExpiresAt),received:Date.now()}")
   page.locator('.ss-group-btn').click();assert page.evaluate('groupCalls.length')==0
   assert not errors,errors;assert not any('/api/'in u for u in requests),requests
   checks.append({'engine':engine,'width':width,'view':view,'overflow':False,'forms':True,'zoomPreserved':not ended,'groupMocked':True,'expiryClickBlocked':True,'errors':errors})
   page.close()
  browser.close()
 browser=p.chromium.launch(headless=True)
 for case in ['expired','revoked','missing','badurl','long','host','multi','pre','network','upcoming','none']:
  print('Checking',case,flush=True)
  page=browser.new_page(viewport={'width':320,'height':800});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  view='stream-current'if case in ['pre','network','upcoming']else'stream-completed'
  page.goto(f'http://127.0.0.1:8912/screen-review.html?view={view}&case={case}',wait_until='domcontentloaded')
  if case in ['host','upcoming','none']:
   expect(page.locator('#screen-home')).to_have_class('screen screen--active');page.locator('.nav-btn[data-tab="profile"]').click()
  expect(page.locator('#tab-profile')).to_be_visible()
  if case=='none':expect(page.locator('#next-meeting-card')).to_contain_text('Сейчас вам не открыт поток')
  elif case=='upcoming':assert page.locator('.stream-state-panel').count()==0;expect(page.locator('#next-meeting-card')).to_contain_text('Начнётся скоро')
  else:expect(page.locator('.stream-state-panel')).to_be_visible()
  if case in ['expired','revoked','missing','badurl']:assert page.locator('.ss-group-btn').count()==0
  if case=='expired':expect(page.locator('.ss-recordings')).to_contain_text('Срок хранения записей')
  if case=='revoked':expect(page.locator('.ss-recordings')).to_contain_text('Доступ к материалам')
  if case in ['missing','badurl']:expect(page.locator('.ss-missing')).to_be_visible()
  if case=='host':expect(page.locator('.ss-assistant')).to_be_visible();expect(page.locator('.ss-ended')).to_contain_text('Служебный доступ');assert page.locator('[data-reflection]').count()==0
  if case=='long':assert page.locator('#ss-stream-title img').count()==0;assert '<img'in page.locator('#ss-stream-title').inner_text()
  if case=='pre':expect(page.locator('.ss-pre .q-banner')).to_be_visible();assert page.locator('.ss-assistant').count()==0;page.locator('.ss-pre .q-banner').click();expect(page.locator('#screen-questionnaire')).to_be_visible()
  if case=='network':expect(page.locator('.program-status')).to_contain_text('Показаны последние загруженные данные')
  if case=='multi':
   page.locator('.ss-group-btn').evaluate('e=>window.oldGroup=e');page.locator('#owned-stream-select').select_option('fictional-second');expect(page.locator('#ss-stream-title')).to_have_text('Другой поток')
   page.evaluate("window.groupCalls=[];Telegram.WebApp.openTelegramLink=u=>groupCalls.push(u);oldGroup.click()");assert page.evaluate('groupCalls.length')==0
   page.evaluate("document.querySelector('.ss-group-btn').scrollIntoView();Api._authGeneration++;document.querySelector('.ss-group-btn').click()");assert page.evaluate('groupCalls.length')==0
  if case!='pre':assert page.locator('#tab-profile').evaluate('e=>e.scrollWidth<=e.clientWidth')
  assert not errors,errors;checks.append({'case':case,'passed':True,'errors':errors});page.close()
 browser.close()
(HERE/'ui-checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
print('PASS native 320/375/390 Chromium/WebKit; real module/forms/Zoom/schedule/group expiry; 11 scope/error/access cases; no real API/sends')
