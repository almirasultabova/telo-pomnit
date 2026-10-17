from pathlib import Path
from playwright.sync_api import sync_playwright,expect
import json,re,sys,os
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'output/contrast-JAPP070';URL='http://127.0.0.1:8917'
MEASURE=(ROOT/'audit/contrast-JAPP070/measure.js').read_text(encoding='utf-8')
variant=sys.argv[1] if len(sys.argv)>1 else 'before'
engines=sys.argv[2:] or ['chromium']
results=[]
with sync_playwright() as p:
 for engine in engines:
  browser=getattr(p,engine).launch(args=['--disable-features=BackForwardCache'] if engine=='chromium' else [])
  for width in map(int,os.environ.get('JAPP_WIDTHS','390,1024').split(',')):
   context=browser.new_context(viewport={'width':width,'height':844},reduced_motion='reduce')
   blocked=[];errors=[]
   def route(r):
    if r.request.url.startswith(URL+'/'):r.continue_()
    else:blocked.append(r.request.url);r.abort()
   context.route('**/*',route);page=context.new_page();page.set_default_timeout(10000)
   page.on('pageerror',lambda e:errors.append(str(e)))
   def load(view):
    global page
    page.close();page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(f'{URL}/{variant}/?view={view}')
    page.wait_for_function('typeof qStatusVerified!=="undefined" && qStatusVerified')
    page.evaluate('document.fonts.ready')
   def active(screen):expect(page.locator('#screen-'+screen)).to_have_class(re.compile(r'\bscreen--active\b'))
   def take(name,focus=None):
    page.evaluate('Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect.getTiming().iterations)).map(a=>a.finished.catch(()=>{})))')
    if focus:
     page.locator(focus).first.focus();page.keyboard.press('Tab');page.keyboard.press('Shift+Tab')
    snapshot=page.evaluate(MEASURE);snapshot.update({'state':name,'variant':variant,'engine':engine,'width':width})
    if focus:snapshot['focus']=page.locator(focus).first.evaluate('(el)=>({visible:el.matches(":focus-visible"),outline:getComputedStyle(el).outline,color:getComputedStyle(el).outlineColor,offset:getComputedStyle(el).outlineOffset,bg:getComputedStyle(el).backgroundColor})')
    results.append(snapshot)
    (OUT/f'{variant}-measurements.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
    if width==390:page.screenshot(path=str(OUT/f'{variant}-{engine}-{name}.png'),animations='disabled')
   load('home-pending');active('home');take('home')
   for tab in ['diary','diag','profile']:
    page.locator(f'.nav-btn[data-tab="{tab}"]').click();take(tab)
   page.evaluate('openFeedback()');active('feedback');take('feedback')
   page.locator('[data-star="3"]').click();take('feedback-selected','#fb-text')
   load('home-pending');active('home');page.locator('#main-state-btn').click();active('checkin');take('checkin','#checkin-note')
   page.evaluate('goTo("trigger")');take('trigger')
   page.evaluate('goTo("note")');take('note','#note-textarea')
   load('pre');active('questionnaire');take('pre')
   page.locator('#q-next-btn').click();take('pre-error')
   page.locator('#qf-name').fill('Учебный пример')
   page.locator('.q-option').first.click();take('pre-selected','#qf-name')
   page.evaluate('qStep=3;renderQBlock()');page.locator('.q-scale-btn[data-val="7"]').first.click();take('pre-scales','.q-scale-btn[data-val="7"]')
   load('post');active('post-questionnaire');page.locator('[data-scale="bodyContactScale"][data-value="6"]').click();take('post-scales')
   page.locator('#post-next').click();take('post-input','#post-currentSituation')
   load('path-example');active('home');take('path-example')
   load('compared');active('comparison');take('comparison')
   load('stream-current');active('home');take('stream-current')
   load('stream-completed');active('home');take('stream-completed')
   page.locator('[data-personal="history"]').click();active('ai-chat');take('ai')
   load('q-invite');active('home');expect(page.locator('#q-invite-sheet')).to_have_class(re.compile(r'\bactive\b'));take('invite')
   assert not blocked,blocked
   assert not errors,errors
   context.close();print(engine,width,'measured',flush=True)
   (OUT/f'{variant}-measurements.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
  browser.close()
for s in results:
 if s['width']!=390:continue
 failures=[t for t in s['texts'] if not t['pass'] and not t['disabled']]
 low=[c for c in s['controls'] if c['borderRatio']<3 and not c['disabled'] and not c['type']=='range']
 print(s['state'],'text failures',[(x['selector'],round(x['ratio'],2),x['text'][:30])for x in failures], 'faint controls',len(low),flush=True)
