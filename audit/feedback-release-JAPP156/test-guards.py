from pathlib import Path
import asyncio,os,sys,importlib.util,json
H=Path(__file__).parent;R=H.resolve().parents[1]
spec=importlib.util.spec_from_file_location('parity155',R/'audit/feedback-module-JAPP155/test-parity.py');m=importlib.util.module_from_spec(spec)
code=(R/'audit/feedback-module-JAPP155/test-parity.py').read_text(encoding='utf-8').replace('asyncio.run(main())','').replace("'http://127.0.0.1:15355/'","os.environ.get('ORIGIN','https://tg-app-telo-pomnit.vercel.app/')")
m.__dict__['os']=os;exec(compile(code,str(spec.origin),'exec'),m.__dict__);m.H=H
async def main():
 results=[];reserve='--reserve'in sys.argv
 if reserve:os.environ['ORIGIN']='https://app.telo-pomnit.ru/'
 async with m.async_playwright()as pw:
  for engine in (['chromium']if reserve else['chromium','webkit']):
   b=await getattr(pw,engine).launch(args=['--disable-http2']if reserve else[])
   try:
    row=await m.run(b,engine,390,'after');results.append({'engine':engine,'passed':True,'groups':row['groups'],'origin':os.environ.get('ORIGIN','main')});print(engine,'PASS seven feedback preservation/identity groups',flush=True)
   finally:await b.close()
 (H/('reserve-guards.json'if reserve else'guards.json')).write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
asyncio.run(main())
