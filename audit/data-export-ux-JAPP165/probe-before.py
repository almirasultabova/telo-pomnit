from fixture import boot
from playwright.async_api import async_playwright
from pathlib import Path
import asyncio,json
H=Path(__file__).parent
async def main():
 out=[]
 async with async_playwright()as pw:
  for engine in['chromium','webkit']:
   b=await getattr(pw,engine).launch();p=await boot(b,'http://127.0.0.1:15363/',390);p.rights_gate=asyncio.Event()
   await p.locator('#data-export-pdf').click();await p.wait_for_function("document.querySelector('#data-export-pdf').disabled")
   pending=await p.evaluate("({label:document.querySelector('#data-export-pdf').textContent,busy:document.querySelector('#data-export-pdf').getAttribute('aria-busy'),status:document.querySelector('#data-rights-status').textContent})");assert pending['label']=='Скачать дневник'and pending['busy']is None
   p.rights_gate.set();await p.locator('.pdf-ready-panel').wait_for();await p.wait_for_function("!document.querySelector('#data-export-pdf').disabled")
   readyFocus=await p.evaluate('document.activeElement.id');assert readyFocus!='pdf-download-file'
   await p.locator('.data-additional summary').click();await p.locator('#data-export-local').click();await p.locator('#private-preview-save').wait_for();title=await p.locator('#screen-data-export-preview .screen-title').inner_text();assert title=='Копия данных';await p.locator('#private-preview-close').click();focus=await p.evaluate('document.activeElement.id');assert focus!='data-export-local'
   await p.screenshot(path=str(H/f'{engine}-before.png'));out.append({'engine':engine,'pending':pending,'readyFocus':readyFocus,'localCopyTitle':title,'focusAfterReturn':focus});await b.close()
 (H/'before-results.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8');print(out)
asyncio.run(main())
