import sys,asyncio,json,re
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'ui-consistency-JAPP147'))
from fixture import boot
from playwright.async_api import async_playwright
HERE=Path(__file__).parent
async def main():
 async with async_playwright() as pw:
  browser=await pw.chromium.launch()
  p=await boot(browser,'http://127.0.0.1:14949/',390)
  result={}
  for view,action in [('home',"switchTab('main')"),('diary',"switchTab('diary')"),('path',"switchTab('diag')"),('profile',"switchTab('profile')"),('reaction',"goTo('trigger')"),('checkin',"document.getElementById('checkin-btn').click()"),('feedback',"openFeedback()"),('body',"goTo('body-map')"),('note',"goTo('note')")]:
   await p.evaluate(action)
   await p.locator('.screen--active').wait_for()
   await p.screenshot(path=str(HERE/('before-'+view+'.png')),animations='disabled')
   result[view]=await p.evaluate("""()=>[...document.querySelectorAll('.screen--active .screen-title,.screen--active .screen-header-btn,.screen--active .btn,.screen--active textarea,.screen--active .section-label,.screen--active select')].filter(e=>e.checkVisibility()).map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {id:e.id,cls:e.className,text:e.textContent.trim().slice(0,75),font:s.fontSize,line:s.lineHeight,radius:s.borderRadius,color:s.color,bg:s.backgroundColor,height:r.height,padding:s.padding,margin:s.margin,border:s.borderColor}})""")
  (HERE/'before-computed.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
  print(json.dumps(result,ensure_ascii=False))
  await browser.close()
asyncio.run(main())
