from pathlib import Path
import importlib.util,json
H=Path(__file__).resolve().parent;R=H.parents[1];S=R/'output/ai-picker-JAPP159/source'
spec=importlib.util.spec_from_file_location('delivery103',R/'scripts/test-ai-delivery-ui.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.ROOT=S;m.base_fixture.ROOT=S;m.OUT=H/'delivery';m.OUT.mkdir(exist_ok=True)
results=[m.run(engine,width)for engine,width in[('chromium',390),('webkit',390)]]
(H/'delivery-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8');print('PASS previous AI delivery',sum(len(x['cases'])for x in results),'cases, no provider requests')
