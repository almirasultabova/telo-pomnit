from fixture import boot
from playwright.async_api import async_playwright
from pathlib import Path
import asyncio,json
H=Path(__file__).parent
async def main():
 results=[]
 async with async_playwright()as pw:
  for engine in['chromium','webkit']:
   b=await getattr(pw,engine).launch();p=await boot(b,'http://127.0.0.1:15365/',390);await p.locator('#ai-history-select').select_option('history-a');await p.wait_for_function("aiSessionId==='history-a'");await p.locator('#ai-input').fill('Учебный черновик для первого разговора');p.history_gate=asyncio.Event();p.history_fault='detail';await p.locator('#ai-history-select').select_option('history-b');await p.wait_for_function("document.querySelector('#ai-history-select').disabled")
   pending=await p.evaluate("({select:document.querySelector('#ai-history-select').value,shown:aiSessionId,sendDisabled:document.querySelector('#ai-send-btn').disabled})");assert not pending['sendDisabled'];p.history_gate.set();await p.wait_for_function("!document.querySelector('#ai-history-select').disabled");after=await p.evaluate("({select:document.querySelector('#ai-history-select').value,shown:aiSessionId})");assert after['select']!=after['shown'];results.append({'engine':engine,'pending':pending,'afterError':after,'providerCalls':len(p.history_sends)});await b.close()
 (H/'before-results.json').write_text(json.dumps(results,indent=2),encoding='utf-8');print(results)
asyncio.run(main())
