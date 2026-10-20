from pathlib import Path
from playwright.async_api import async_playwright
import asyncio,json
H=Path(__file__).parent
async def main():
 async with async_playwright()as pw:
  b=await pw.chromium.launch();p=await b.new_page(viewport={'width':1280,'height':1100});errors=[];failed=[]
  p.on('pageerror',lambda e:errors.append(str(e)));p.on('requestfailed',lambda r:failed.append(r.url))
  await p.add_init_script("window.previewClicks=[];document.addEventListener('click',e=>previewClicks.push(e.target.closest('button')?.textContent),true)")
  await p.goto('http://127.0.0.1:15369/review',wait_until='domcontentloaded')
  for f in p.frames[1:]:await f.wait_for_function("window.previewClicks?.length>=3&&document.querySelectorAll('.dq-record').length===20",timeout=15000)
  states=[]
  for f in p.frames[1:]:
   states.append(await f.evaluate("({scroll:document.querySelector('.dq-scroll').scrollTop,heading:document.querySelector('#screen-discuss h1').textContent,clicks:previewClicks})"))
  await p.screenshot(path=str(H/'comparison-return.png'),full_page=True)
  (H/'preview-results.json').write_text(json.dumps({'states':states,'errors':errors,'requestFailures':failed},ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'states':states,'errors':errors,'requestFailures':failed},ensure_ascii=False));assert states[0]['scroll']==0 and states[1]['scroll']>0;assert not errors and not failed
  await b.close()
asyncio.run(main())
