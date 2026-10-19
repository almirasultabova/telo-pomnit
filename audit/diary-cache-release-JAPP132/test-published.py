from pathlib import Path
import importlib.util,json,sys
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent
spec=importlib.util.spec_from_file_location('cache',R/'audit/diary-cache-JAPP131/test-ui.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
out=H/'published-ui.json';runs=json.loads(out.read_text(encoding='utf-8'))if'--retry'in sys.argv and out.exists()else[]
for engine,width,base in [('chromium',390,'https://tg-app-telo-pomnit.vercel.app/'),('chromium',1440,'https://tg-app-telo-pomnit.vercel.app/'),('webkit',390,'https://tg-app-telo-pomnit.vercel.app/'),('chromium',390,'https://app.telo-pomnit.ru/')]:
 for mode in['bounded','quota','recovery','blocked']:
  if any(r['engine']==engine and r['width']==width and r['base']==base and r['mode']==mode for r in runs):continue
  print('Checking published',engine,width,mode,base,flush=True);runs.append(m.run(engine,width,mode,base));out.write_text(json.dumps(runs,ensure_ascii=False,indent=2),encoding='utf-8')
assert len(runs)==16;print('PASS16 published runs',sum(len(r['cases'])for r in runs),'checks')
