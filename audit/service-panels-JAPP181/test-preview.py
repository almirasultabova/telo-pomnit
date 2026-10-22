from playwright.async_api import async_playwright,expect
from pathlib import Path
import asyncio,json
H=Path(__file__).parent
async def main():
 results=[]
 async with async_playwright()as pw:
  b=await pw.chromium.launch();p=await b.new_page(viewport={'width':1110,'height':1100});errors=[];p.on('pageerror',lambda e:errors.append(str(e)));await p.goto('http://127.0.0.1:16181/')
  for case in ['loading','refresh','empty']:
   if case!='loading':await p.locator('[data-case="'+case+'"]').click()
   await expect(p.locator('body')).to_have_attribute('data-ready','true',timeout=20000);rows=[]
   for side in ['before','after']:
    f=p.frame_locator('#'+side);state=await f.locator('body').evaluate('()=>({content:document.getElementById("content").textContent,people:document.querySelectorAll("[data-person]").length,streams:document.querySelectorAll("[data-stream]").length,notice:document.getElementById("notice").textContent,busy:document.getElementById("content").getAttribute("aria-busy")})')
    if case=='loading':assert state['people']==(30 if side=='before'else 0);assert state['notice']=='Загружаем…'
    if case=='refresh':assert state['streams']==(1 if side=='before'else 2)
    if case=='empty':assert state['content']==(''if side=='before'else'Потоков пока нет.')
    rows.append({'side':side,'state':state})
   await p.screenshot(path=str(H/(case+'.png')),full_page=True);results.append({'case':case,'frames':rows})
  await p.locator('#marks').uncheck()
  for side in ['before','after']:assert not await p.frame_locator('#'+side).locator('html').evaluate('el=>el.classList.contains("review-marks")')
  await p.set_viewport_size({'width':390,'height':844});assert await p.locator('html').evaluate('el=>el.scrollWidth<=innerWidth');assert not errors,errors
  (H/'preview-checks.json').write_text(json.dumps({'cases':results,'marksToggle':True,'mobileNoOverflow':True,'pageErrors':errors},ensure_ascii=False,indent=2),encoding='utf-8');await b.close()
asyncio.run(main())
