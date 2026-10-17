from playwright.sync_api import sync_playwright,expect
from pathlib import Path
import json
HERE=Path(__file__).resolve().parent
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True);page=browser.new_page(viewport={'width':390,'height':844});errors=[];requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
 page.goto('http://127.0.0.1:8912/screen-review.html?view=stream-current&case=staff',wait_until='domcontentloaded')
 expect(page.locator('#screen-home')).to_have_class('screen screen--active');page.locator('.nav-btn[data-tab="profile"]').click()
 page.locator('#screen-review-entry').click();expect(page.locator('#screen-screen-review')).to_be_visible()
 for state in ['stream-current','stream-completed']:
  page.locator('#screen-review-choice').select_option(state)
  expect(page.locator('#screen-review-frame')).to_be_visible()
  frame=page.frame_locator('#screen-review-frame');expect(frame.locator('.stream-state-panel')).to_be_visible()
  expect(frame.locator('.ss-status')).to_have_text('Поток завершён'if state.endswith('completed')else'Поток идёт')
  assert page.locator('#screen-review-frame').get_attribute('sandbox')=='allow-scripts'
  assert 'token='not in page.locator('#screen-review-frame').get_attribute('src')
  assert frame.locator('.ss-recordings').inner_text().find('после окончания потока')>=0
  page.screenshot(path=str(HERE/f'staff-{state}.png'))
 assert not errors,errors;assert not any('/api/'in u for u in requests),requests
 browser.close()
(HERE/'staff-checks.json').write_text(json.dumps({'states':['stream-current','stream-completed'],'hostEntry':True,'opaqueSandbox':True,'credentialsTransferred':False,'actualApiRequests':0,'pageErrors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
print('PASS HOST opens both new cases through real ScreenReview controller; opaque sandbox, no token transfer/API/sends')
