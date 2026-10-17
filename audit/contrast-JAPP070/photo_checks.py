from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from PIL import Image
from io import BytesIO
from functools import lru_cache
import json,re
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'output/contrast-JAPP070';URL='http://127.0.0.1:8917'
JS="""() => {const result=[];for(const el of document.querySelectorAll('.screen--active *,#q-invite-sheet.active *')){if(el.closest('svg,script,style,[hidden],[inert]'))continue;const s=getComputedStyle(el);let image=false,opacity=1;for(let n=el;n;n=n.parentElement){const cs=getComputedStyle(n);opacity*=+cs.opacity;for(const p of [null,'::before','::after'])if(getComputedStyle(n,p).backgroundImage!=='none')image=true;}if(!image)continue;for(const node of el.childNodes){if(node.nodeType!==3||!node.textContent.trim())continue;const r=document.createRange();r.selectNode(node);const boxes=[...r.getClientRects()].filter(b=>b.width>0&&b.height>0&&b.top>=0&&b.bottom<=innerHeight&&b.left>=0&&b.right<=innerWidth).filter(b=>{const top=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);return top&&(top===el||el.contains(top));}).map(b=>({x:b.x,y:b.y,w:b.width,h:b.height}));if(boxes.length)result.push({text:node.textContent.trim().slice(0,80),selector:el.id?'#'+el.id:el.tagName+'.'+el.className,color:s.color,opacity,required:parseFloat(s.fontSize)>=24||(parseFloat(s.fontSize)>=18.6667&&+s.fontWeight>=700)?3:4.5,boxes});}}return result;}"""
def luminance(rgb):
 return sum((v/255/12.92 if v/255<=.04045 else ((v/255+.055)/1.055)**2.4)*w for v,w in zip(rgb,[.2126,.7152,.0722]))
@lru_cache(maxsize=40000)
def contrast(rgb,foreground,alpha):
 fg=tuple(f*alpha+b*(1-alpha)for f,b in zip(foreground,rgb));a,b=luminance(rgb),luminance(fg)
 return(max(a,b)+.05)/(min(a,b)+.05)
records=[]
with sync_playwright() as p:
 browser=p.chromium.launch(args=['--disable-features=BackForwardCache'])
 for width in [390,1024]:
  ctx=browser.new_context(viewport={'width':width,'height':844},reduced_motion='reduce')
  ctx.route('**/*',lambda r:r.continue_() if r.request.url.startswith(URL+'/')else r.abort())
  for view in ['home-pending','pre','compared','stream-current','q-invite']:
   page=ctx.new_page();page.goto(f'{URL}/after/?view={view}');page.wait_for_function('typeof qStatusVerified!=="undefined" && qStatusVerified');page.evaluate('document.fonts.ready')
   expected='questionnaire' if view=='pre' else 'comparison' if view=='compared' else 'home'
   expect(page.locator('#screen-'+expected)).to_have_class(re.compile('screen--active'))
   if view=='q-invite':expect(page.locator('#q-invite-sheet')).to_have_class(re.compile(r'\bactive\b'))
   page.evaluate('Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect.getTiming().iterations)).map(a=>a.finished.catch(()=>{})))')
   items=page.evaluate(JS)
   tag=page.add_style_tag(content='*{-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important}svg text{fill:transparent!important}')
   pixels=Image.open(BytesIO(page.screenshot(animations='disabled'))).convert('RGB');tag.evaluate('(el)=>el.remove()')
   for item in items:
    numbers=list(map(float,re.findall(r'[\d.]+',item['color'])));fg=tuple(numbers[:3]);alpha=(numbers[3]if len(numbers)>3 else 1)*item['opacity'];values=[]
    for b in item['boxes']:
     for x in range(max(0,int(b['x'])),min(width,int(b['x']+b['w'])+1),2):
      for y in range(max(0,int(b['y'])),min(844,int(b['y']+b['h'])+1),2):values.append(contrast(pixels.getpixel((x,y)),fg,alpha))
    if values:records.append({**item,'view':view,'width':width,'minSampleContrast':min(values),'pass':min(values)>=item['required']})
   page.close()
  ctx.close()
 browser.close()
(OUT/'photo-measurements.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
print('Photo/gradient text',len(records),'failures',[(x['width'],x['view'],x['selector'],round(x['minSampleContrast'],2),x['text'])for x in records if not x['pass']])
