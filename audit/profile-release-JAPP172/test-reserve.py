import asyncio,importlib.util,json
from pathlib import Path
from playwright.async_api import async_playwright,expect
H=Path(__file__).parent
spec=importlib.util.spec_from_file_location('live',H/'test-live.py');t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t);t.ORIGIN='https://app.telo-pomnit.ru/'
async def main():
 async with async_playwright()as pw:
  b=await pw.chromium.launch(args=['--disable-http2'])
  await t.check_routes(b,'reserve-chromium');await t.check_submit(b,'reserve-chromium')
  p=await t.boot(b,width=1440);await p.wait_for_function('qStatusVerified');await p.evaluate('document.fonts.ready');await p.wait_for_function("!document.querySelector('.screen--exit-forward,.screen--exit-back')");assert not await p.evaluate('document.documentElement.scrollWidth>innerWidth');assert not p.failures;pname=H/'reserve-desktop.png';await p.screenshot(path=str(pname),full_page=True);await b.close()
 (H/'reserve-ui.json').write_text(json.dumps(t.RESULTS+[{'width':1440,'ok':True}],ensure_ascii=False,indent=2),encoding='utf-8');print('PASS reserve routes/submit/desktop')
asyncio.run(main())
