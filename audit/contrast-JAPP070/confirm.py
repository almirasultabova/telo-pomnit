from pathlib import Path
from playwright.sync_api import sync_playwright,expect
import json,re,sys
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'output/contrast-JAPP070';URL='http://127.0.0.1:8917';JS=(ROOT/'audit/contrast-JAPP070/measure.js').read_text(encoding='utf-8')
engines=sys.argv[1:]or['chromium','webkit']
records=[];checks=[]
if sys.argv[1:]:
 records=[x for x in json.loads((OUT/'final-measurements.json').read_text(encoding='utf-8'))if x['engine']not in engines]
 checks=[x for x in json.loads((OUT/'control-checks.json').read_text(encoding='utf-8'))if x['engine']not in engines]
with sync_playwright() as p:
 for engine in engines:
  browser=getattr(p,engine).launch(args=['--disable-features=BackForwardCache'] if engine=='chromium'else[])
  for width in [390,1024]:
   c=browser.new_context(viewport={'width':width,'height':844},reduced_motion='reduce');blocked=[];errors=[]
   c.route('**/*',lambda r:r.continue_()if r.request.url.startswith(URL+'/')else(blocked.append(r.request.url),r.abort()))
   page=None
   def load(view):
    global page
    if page:page.close()
    page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(f'{URL}/after/?view={view}');page.wait_for_function('typeof qStatusVerified!=="undefined" && qStatusVerified');page.evaluate('document.fonts.ready')
    screen='questionnaire' if view=='pre'else'post-questionnaire'if view=='post'else'home'
    expect(page.locator('#screen-'+screen)).to_have_class(re.compile(r'\bscreen--active\b'))
    if view=='home-pending':expect(page.locator('#home-stream .home-status')).to_have_count(1)
    if view=='path-example':expect(page.locator('#path-stream-select')).to_have_count(1)
   def take(name):
    page.evaluate('Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect.getTiming().iterations)).map(a=>a.finished.catch(()=>{})))')
    s=page.evaluate(JS);s.update(engine=engine,width=width,state=name);records.append(s)
    (OUT/'final-measurements.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
    assert not [t for t in s['texts']if not t['pass']and not t['disabled']and not t['images']],(name,[t for t in s['texts']if not t['pass']and not t['disabled']and not t['images']])
    assert not s['overflow'],name
    if width==390:page.screenshot(path=str(OUT/f'after-{engine}-{name}.png'),animations='disabled')
    return s
   def field(s,selector):
    items=[x for x in s['controls']if x['selector']==selector];assert items,(s['state'],selector)
    assert items[0]['borderRatio']>=3,(selector,items[0]);checks.append({'engine':engine,'width':width,'state':s['state'],'selector':selector,'ratio':items[0]['borderRatio']})
   load('home-pending');s=take('home');assert next(t['ratio']for t in s['texts']if t['selector']=='span.home-status')>=4.5
   expect(page.locator('#main-body-btn')).to_be_enabled();page.keyboard.press('Tab');page.locator('#main-body-btn').focus()
   focus=page.locator('#main-body-btn').evaluate('(el)=>({focus:el.matches(":focus-visible"),style:getComputedStyle(el).outlineStyle,width:getComputedStyle(el).outlineWidth,shadow:getComputedStyle(el).boxShadow})');assert focus['focus']and focus['style']=='solid'and focus['width']=='2px'and 'rgb(252, 250, 246)'in focus['shadow'];take('home-focus')
   load('pre');s=take('pre');field(s,'#qf-name');field(s,'#qf-city')
   page.locator('#q-next-btn').click();s=take('pre-error');expect(page.locator('#q-validation-error')).to_contain_text('Ответьте на вопрос')
   page.locator('#qf-name').fill('Учебный пример');page.locator('.q-option').first.click();take('pre-selected')
   page.evaluate('qStep=3;renderQBlock()');page.locator('.q-scale-btn[data-val="7"]').first.click();s=take('pre-scales');field(s,'button.q-scale-btn');assert page.locator('.q-scale-btn--active').get_attribute('aria-pressed')=='true'
   load('post');page.locator('[data-scale="bodyContactScale"][data-value="6"]').click();s=take('post-scales');field(s,'button.q-scale-btn')
   page.locator('#post-next').click();s=take('post-input');field(s,'#post-currentSituation')
   load('home-pending');page.evaluate('openFeedback()');s=take('feedback')
   for selector in ['#fb-stream','#fb-kind','#fb-reply','#fb-text']:field(s,selector)
   page.locator('[data-star="3"]').click();page.locator('#fb-text').focus();page.keyboard.press('Tab');page.keyboard.press('Shift+Tab');take('feedback-selected');assert page.locator('#fb-text').evaluate('(el)=>getComputedStyle(el).outlineStyle==="solid" && getComputedStyle(el).outlineWidth==="2px"')
   load('home-pending');page.locator('#main-state-btn').click();s=take('checkin');field(s,'#checkin-note')
   load('path-example');s=take('path-example');field(s,'#path-stream-select')
   load('stream-current');page.locator('[data-assistant]').click();s=take('ai');field(s,'#ai-history-select');field(s,'#ai-context-mode');field(s,'#ai-input')
   assert not blocked and not errors,(blocked,errors)
   page.close();c.close();print(engine,width,'targeted checks PASS',flush=True)
   (OUT/'final-measurements.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8');(OUT/'control-checks.json').write_text(json.dumps(checks,indent=2),encoding='utf-8')
  browser.close()
