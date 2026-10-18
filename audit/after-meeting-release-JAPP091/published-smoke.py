from pathlib import Path
from playwright.sync_api import sync_playwright,expect
import json
H=Path(__file__).parent;result=[]
with sync_playwright()as p:
 for engine in ['chromium','webkit']:
  browser=getattr(p,engine).launch();context=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce')
  calls=[];errors=[];context.route('**/api/**',lambda r:(calls.append(r.request.url),r.abort())[-1])
  page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  page.goto('https://tg-app-telo-pomnit.vercel.app/screen-review.html?view=home-pending&verify=JAPP091-final',wait_until='domcontentloaded',timeout=40000)
  page.wait_for_function("()=>typeof qStatusVerified!=='undefined' && qStatusVerified && currentScreen==='home'")
  page.get_by_role('button',name='Дневник',exact=True).click();page.locator('#after-meeting-entry').click()
  page.get_by_text('После разбора',exact=True).click();page.locator('#am-date').fill('2026-10-17');page.locator('#am-note').fill('Учебная заметка: хочу сохранить то, что стало понятнее после встречи.')
  page.locator('#am-save').click();expect(page.locator('.am-record')).to_have_count(1)
  page.get_by_role('button',name='Открыть заметку',exact=True).click();expect(page.locator('#am-note')).to_have_value('Учебная заметка: хочу сохранить то, что стало понятнее после встречи.')
  assert page.locator('#app').evaluate('e=>e.scrollTop')==0
  assert page.locator('.am-header').bounding_box()['y']>=0
  page.screenshot(path=str(H/f'final-{engine}-390.png'),full_page=True)
  assert not calls,calls;assert not errors,errors
  result.append({'engine':engine,'publishedFinal':True,'syntheticSaveAndOpen':True,'headerVisible':True,'outerAppScrollZero':True,'realApiCalls':0,'pageErrors':errors})
  context.close();browser.close();print(engine,'published final PASS',flush=True)
(H/'published-final.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
