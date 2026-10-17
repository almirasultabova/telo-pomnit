from pathlib import Path
from playwright.sync_api import sync_playwright,expect
import json,re,sys
HERE=Path(__file__).resolve().parent;published='--published'in sys.argv
origins=['https://tg-app-telo-pomnit.vercel.app/','https://app.telo-pomnit.ru/','https://app.telo-pomnit.ru/recovery/j293/']if published else['http://127.0.0.1:8918/']
records=[]
with sync_playwright()as p:
 for name in ['chromium','webkit']:
  b=getattr(p,name).launch(args=['--disable-features=BackForwardCache']if name=='chromium'else[])
  for base in origins if name=='chromium'else origins[:1]:
   c=b.new_context(viewport={'width':390,'height':844},reduced_motion='reduce');errors=[];requests=[]
   c.on('page',lambda pg:pg.on('pageerror',lambda e:errors.append(str(e))))
   c.route('**/api/**',lambda r:r.abort())
   def load(view):
    page=c.new_page();page.on('request',lambda r:requests.append(r.url));page.goto(base+'screen-review.html?view='+view+'&verify=JAPP071',wait_until='domcontentloaded');page.wait_for_function('typeof qStatusVerified!=="undefined" && qStatusVerified');page.evaluate('document.fonts.ready');return page
   page=load('home-pending');expect(page.locator('#screen-home')).to_have_class(re.compile('screen--active'));expect(page.locator('#home-stream .home-status')).to_have_css('color','rgb(41, 69, 52)');expect(page.locator('#main-body-btn')).to_be_enabled();page.keyboard.press('Tab');page.locator('#main-body-btn').focus();assert page.locator('#main-body-btn').evaluate('(e)=>e.matches(":focus-visible")&&getComputedStyle(e).outlineWidth==="2px"&&getComputedStyle(e).outlineStyle==="solid"');page.close()
   page=load('pre');expect(page.locator('#screen-questionnaire')).to_have_class(re.compile('screen--active'));expect(page.locator('#qf-name')).to_have_css('border-top-color','rgb(123, 130, 115)');page.evaluate('qStep=3;renderQBlock()');button=page.locator('.q-scale-btn[data-val="7"]').first;button.click();assert button.get_attribute('aria-pressed')=='true';expect(page.locator('.q-scale-btn:not(.q-scale-btn--active)').first).to_have_css('border-top-color','rgb(123, 130, 115)');page.close()
   page=load('home-pending');expect(page.locator('#screen-home')).to_have_class(re.compile('screen--active'));page.evaluate('openFeedback()');expect(page.locator('#screen-feedback')).to_have_class(re.compile('screen--active'));expect(page.locator('#fb-kind')).to_have_css('border-top-color','rgb(123, 130, 115)');page.locator('#fb-text').focus();assert page.locator('#fb-text').evaluate('(e)=>getComputedStyle(e).outlineWidth==="2px"&&getComputedStyle(e).outlineStyle==="solid"');page.close()
   page=load('stream-current');expect(page.locator('[data-assistant]')).to_have_count(1);expect(page.locator('#tab-profile .app-footer')).to_have_css('opacity','1');page.locator('[data-assistant]').click();expect(page.locator('#screen-ai-chat')).to_have_class(re.compile('screen--active'));assert page.locator('#ai-input').evaluate('(e)=>getComputedStyle(e,"::placeholder").color==="rgb(114, 106, 96)"');assert page.locator('#screen-ai-chat').evaluate('(e)=>e.scrollWidth<=e.clientWidth');page.screenshot(path=str(HERE/f'{"published"if published else"local"}-{name}-{len(records)}.png'));page.close()
   assert not errors,errors;assert not any('/api/'in url for url in requests),requests
   records.append({'engine':name,'origin':base,'states':4,'statusAndFocus':True,'preScaleSelection':True,'feedback':True,'aiPlaceholder':True,'pageErrors':errors,'realApiRequests':0});c.close();print(name,base,'PASS',flush=True)
  b.close()
(HERE/('published-ui.json'if published else'local-ui.json')).write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
