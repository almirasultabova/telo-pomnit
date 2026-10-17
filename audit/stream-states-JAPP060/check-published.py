from pathlib import Path
from playwright.sync_api import sync_playwright,expect
import json
HERE=Path(__file__).resolve().parent;results=[]
with sync_playwright()as p:
 browser=p.chromium.launch(headless=True)
 for state in ['stream-current','stream-completed']:
  page=browser.new_page(viewport={'width':375,'height':812});errors=[];requests=[]
  page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
  page.route('**/api/**',lambda route:route.abort())
  page.goto('https://tg-app-telo-pomnit.vercel.app/screen-review.html?view='+state,wait_until='domcontentloaded')
  expect(page.locator('.stream-state-panel')).to_be_visible();expect(page.locator('.ss-recordings')).to_contain_text('после окончания потока')
  assert page.locator('#tab-profile').evaluate('e=>e.scrollWidth<=e.clientWidth')
  if state=='stream-completed':page.locator('[data-reflection]').click();expect(page.locator('#screen-post-questionnaire')).to_be_visible()
  assert not errors,errors;assert not any('/api/'in u for u in requests),requests
  results.append({'state':state,'realProviderCalls':0,'apiRequests':0,'overflow':False,'postForm':state=='stream-completed','pageErrors':errors});page.close()
 browser.close()
(HERE/'published-ui-checks.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print('PASS published native states at375, post opens, no overflow/pageerror/real API or sends')
