from pathlib import Path
import importlib.util,json
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent
spec=importlib.util.spec_from_file_location('status',H/'test-ui.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
results=[]
for width in [390,1440]:
 f,server=m.serve()
 try:
  with sync_playwright()as p:
   browser=p.chromium.launch();page=browser.new_page(viewport={'width':width,'height':844});page.add_init_script(m.m.m.m.CLOCK+m.CLIPBOARD);page.route('https://**/*',lambda r:r.abort());m.boot(page,f'http://127.0.0.1:{server.server_port}/app/index.html?owner=preview');page.evaluate(m.SEED,{'rows':True,'drafts':True,'blocked':False});m.settle(page);page.screenshot(path=str(H/f'home-{width}.png'));page.locator('#home-save-status').scroll_into_view_if_needed();page.screenshot(path=str(H/f'home-notice-{width}.png'));m.open_list(page)
   page.screenshot(path=str(H/('review-mobile.png'if width==390 else'review-desktop.png')))
   metrics=page.evaluate('''()=>[...document.querySelectorAll('#screen-save-status .ss-summary,#screen-save-status .ss-copy,#screen-save-status .ss-date,#screen-save-status .ss-link')].map(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return{class:el.className,color:s.color,background:s.backgroundColor,fontSize:s.fontSize,lineHeight:s.lineHeight,height:r.height,width:r.width}})''');results.append({'width':width,'styles':metrics});browser.close()
 finally:f.checkinGate.set();f.postGate.set();f.gate.set();server.shutdown();server.server_close()
(H/'visual-metrics.json').write_text(json.dumps(results,indent=2),encoding='utf-8');print('Captured incumbent Home + new notice at mobile/desktop; recorded actual type, colors and controls')
