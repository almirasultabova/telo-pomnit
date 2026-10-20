from pathlib import Path
from playwright.async_api import async_playwright,expect
import asyncio,json
H=Path(__file__).parent
async def main():
 async with async_playwright()as pw:
  b=await pw.chromium.launch();p=await b.new_page(viewport={'width':1100,'height':1000});await p.goto('http://127.0.0.1:15367/review?mode=reading');frames={}
  for name in['before','after']:
   f=p.frame_locator('#'+name);await expect(f.locator('#ai-input')).to_contain_text('')
   await expect(f.locator('#ai-input')).to_have_value(__import__('re').compile('Учебный длинный черновик'))
   await expect(f.locator('.ai-msg--assistant')).to_have_count(1)
   frames[name]=await f.locator('.ai-msg--assistant .ai-msg-text').bounding_box()
  assert frames['after']['width']>frames['before']['width']+40;assert await p.frame_locator('#after').locator('#ai-message-limit').count()==0
  assert '\n'in await p.frame_locator('#after').locator('#ai-input').input_value();await p.screenshot(path=str(H/'comparison-reading.png'),full_page=True);await b.close()
 (H/'reading-preview-results.json').write_text(json.dumps({'passed':True,'httpOnly':True,'beforeWidth':frames['before']['width'],'afterWidth':frames['after']['width'],'draftContainsLineBreaks':True},indent=2),encoding='utf-8');print('PASS HTTP-only comparison: wide assistant, long draft, no ceiling counter')
asyncio.run(main())
