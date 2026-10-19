from pathlib import Path
import importlib.util,json
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent;O=H/'regression-day';O.mkdir(exist_ok=True)
spec=importlib.util.spec_from_file_location('day',R/'audit/diary-entry-JAPP127/test-ui.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);m.OUT=O
results=[]
for engine in ['chromium','webkit']:
 for mode in ['today','save','search']:
  results.append(m.run(engine,390,mode));print('PASS previous Diary',engine,mode,flush=True)
(H/'regression-ui.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print('PASS',sum(len(r['cases'])for r in results),'previous UI checks')
