from pathlib import Path
from playwright.sync_api import sync_playwright,expect
import json,sys
HERE=Path(__file__).resolve().parent;published='--published'in sys.argv
origins=['https://tg-app-telo-pomnit.vercel.app/','https://app.telo-pomnit.ru/','https://app.telo-pomnit.ru/recovery/j293/']if published else ['http://127.0.0.1:8912/']
results=[]
with sync_playwright()as p:
 for engine in ['chromium','msedge','webkit']:
  browser=p.webkit.launch()if engine=='webkit'else p.chromium.launch(**({'channel':'msedge'}if engine=='msedge'else{}))
  for base in (origins if engine=='chromium'else origins[:1]):
   page=browser.new_page(viewport={'width':390,'height':844});errors=[];requests=[]
   page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
   page.route('**/api/**',lambda r:r.abort())
   page.goto(base+'screen-review.html?view=path-empty&verify=JAPP063',wait_until='domcontentloaded')
   expect(page.locator('#screen-home')).to_be_visible();page.evaluate('startDiaryEntry()');expect(page.locator('#screen-body-map')).to_be_visible()
   ids=[]
   for side in ['front','back']:
    page.locator('#view-'+side+'-btn').click()
    expect(page.locator('#body-figure-svg image')).to_have_attribute('href','/media/app/redesign/body-'+side+'-owner-lossless.webp')
    page.evaluate("async()=>{const i=new Image();i.src=document.querySelector('#body-figure-svg image').getAttribute('href');await i.decode();if(i.naturalWidth!==1024||i.naturalHeight!==1536)throw Error('dimensions')}")
    ids+=page.locator('#body-zone-list [data-zone]').evaluate_all('(es)=>es.map(e=>e.dataset.zone)')
   assert len(set(ids))==35
   page.locator('.body-zone-disclosure summary').click();page.locator('#body-zone-list [data-zone]').first.click();expect(page.locator('#zone-continue-btn')).to_be_enabled()
   page.locator('#zone-continue-btn').click();expect(page.locator('#screen-sensations')).to_be_visible()
   assert page.locator('#screen-sensations').evaluate('e=>e.scrollWidth<=e.clientWidth')
   assert not errors,errors;assert not any('/api/'in u for u in requests),requests
   results.append(dict(engine=engine,origin=base,zones=35,decodedBothSides=True,continuesToSensations=True,pageErrors=errors,realApiRequests=0))
   page.screenshot(path=str(HERE/f'{"published"if published else"local"}-{engine}-{len(results)}.png'));page.close()
  browser.close()
(HERE/('published-ui.json'if published else'local-ui.json')).write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print('PASS',len(results),'actual-build map checks; Chromium/Edge/WebKit; 35 zones, images, next step; no real API')
