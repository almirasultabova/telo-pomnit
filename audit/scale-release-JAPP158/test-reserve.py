from pathlib import Path
import os,asyncio,importlib.util,json
H=Path(__file__).resolve().parent;os.environ['ORIGIN']='https://app.telo-pomnit.ru/'
spec=importlib.util.spec_from_file_location('scale_ui158',H/'test-ui.py');m=importlib.util.module_from_spec(spec);code=(H/'test-ui.py').read_text(encoding='utf-8').replace('asyncio.run(main())','');exec(compile(code,str(spec.origin),'exec'),m.__dict__)
async def main():
 async with m.async_playwright()as pw:
  b=await pw.chromium.launch(args=['--disable-http2'])
  try:await m.run(b,'chromium',390)
  finally:await b.close()
 (H/'reserve-ui.json').write_text(json.dumps(m.RESULTS,ensure_ascii=False,indent=2),encoding='utf-8')
asyncio.run(main())
