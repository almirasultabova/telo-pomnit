from pathlib import Path
import sys,asyncio,json
from playwright.async_api import async_playwright
H=Path(__file__).resolve().parent;sys.path.insert(0,str(H.parents[1]/'audit/ui-consistency-JAPP147'))
from fixture import boot
async def main():
 async with async_playwright()as pw:
  b=await pw.chromium.launch();p=await boot(b,'http://127.0.0.1:15355/before/',320)
  await p.evaluate("openQuestionnaire();qStep=Q_BLOCKS.findIndex(b=>b.fields.some(f=>f.type==='scale'));renderQBlock()")
  box=await p.locator('.q-scale-btn').first.bounding_box();grid=await p.locator('.q-scale').first.evaluate('e=>getComputedStyle(e).gridTemplateColumns')
  result={'width':320,'button':box,'columns':grid};(H/'before-measurement.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(result);await b.close()
asyncio.run(main())
