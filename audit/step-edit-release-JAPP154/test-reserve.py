from pathlib import Path
import asyncio,os,sys,importlib.util,json
H=Path(__file__).parent;os.environ['ORIGIN']='https://app.telo-pomnit.ru/'
def read(name):
 spec=importlib.util.spec_from_file_location(name,H/(name+'.py'));m=importlib.util.module_from_spec(spec)
 code=(H/(name+'.py')).read_text(encoding='utf-8').replace('asyncio.run(main())','')
 exec(compile(code,str(H/(name+'.py')),'exec'),m.__dict__);return m
async def main():
 d=read('test-drafts');r=read('test-route')
 async with d.async_playwright()as pw:
  b=await pw.chromium.launch(args=['--disable-http2']if '--http1'in sys.argv else [])
  try:
   if '--route-only'not in sys.argv:await d.run(b,'chromium',390);await d.edges(b,'chromium')
   await r.run(b,'chromium',390)
  finally:await b.close()
 (H/'reserve-ui.json').write_text(json.dumps({'drafts':d.RESULTS,'route':r.RESULTS},ensure_ascii=False,indent=2),encoding='utf-8')
asyncio.run(main())
