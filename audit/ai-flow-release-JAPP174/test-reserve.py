from pathlib import Path
import importlib.util,asyncio,json
from playwright.async_api import async_playwright
H=Path(__file__).parent
spec=importlib.util.spec_from_file_location('routes',H/'tests.py');t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t);t.ORIGIN='https://app.telo-pomnit.ru/'
async def main():
 async with async_playwright()as pw:
  b=await pw.chromium.launch(args=['--disable-http2'])
  for width in [320,390,1440]:await t.check(b,'reserve-chromium-http1',width)
  await t.keyboards(b,'reserve-chromium-http1');await b.close()
 (H/'reserve-checks.json').write_text(json.dumps(t.RESULTS,ensure_ascii=False,indent=2),encoding='utf-8')
asyncio.run(main())
