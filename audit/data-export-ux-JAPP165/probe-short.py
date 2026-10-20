from fixture import boot
from playwright.async_api import async_playwright,expect
from pathlib import Path
import asyncio,json
H=Path(__file__).parent
async def main():
 async with async_playwright()as pw:
  b=await pw.chromium.launch();p=await boot(b,'http://127.0.0.1:15365/');await p.set_viewport_size({'width':390,'height':430});await p.locator('#data-export-pdf').click();await p.wait_for_function("!document.querySelector('#data-export-pdf').disabled");await expect(p.locator('#pdf-download-file')).to_be_focused();print(await p.evaluate("({box:document.querySelector('#pdf-download-file').getBoundingClientRect().toJSON(),body:document.querySelector('#screen-data-rights .screen-scroll').getBoundingClientRect().toJSON(),height:innerHeight,scroll:document.querySelector('#screen-data-rights .screen-scroll').scrollTop,status:document.querySelector('#data-rights-status').textContent})"));await p.screenshot(path=str(H/'short-window.png'));await b.close()
asyncio.run(main())
