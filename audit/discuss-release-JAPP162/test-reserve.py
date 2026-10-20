from pathlib import Path
import asyncio,os,importlib.util,json
H=Path(__file__).resolve().parent;os.environ['ORIGIN']='https://app.telo-pomnit.ru/'
def read(name):
 spec=importlib.util.spec_from_file_location(name,H/(name+'.py'));m=importlib.util.module_from_spec(spec);code=(H/(name+'.py')).read_text(encoding='utf-8').replace('asyncio.run(main())','');exec(compile(code,str(spec.origin),'exec'),m.__dict__);return m
async def main():
 ui=read('test-ui');edges=read('test-edges')
 async with ui.async_playwright()as pw:
  b=await pw.chromium.launch(args=['--disable-http2'])
  try:await ui.run(b,'chromium',390);await edges.run(b,'chromium')
  finally:await b.close()
 (H/'reserve-ui.json').write_text(json.dumps({'ui':ui.RESULTS,'edges':edges.RESULTS},ensure_ascii=False,indent=2),encoding='utf-8')
asyncio.run(main())
