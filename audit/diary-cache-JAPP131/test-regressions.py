from pathlib import Path
import subprocess,json,importlib.util
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent;results=[]
for script,receipt in [('audit/path-period-JAPP129/test-storage.cjs','audit/path-period-JAPP129/storage-results.json'),('audit/diary-entry-JAPP127/test-storage.cjs','audit/diary-entry-JAPP127/storage-results.json'),('audit/recent-checkins-JAPP117/test-storage.cjs',None),('scripts/test-observation-queue.cjs',None)]:
 p=R/receipt if receipt else None;old=p.read_bytes()if p and p.exists()else None
 try:
  r=subprocess.run(['node',script],cwd=R,check=True,capture_output=True,text=True,encoding='utf-8');results.append({'script':script,'passed':True,'output':r.stdout.strip()});print('PASS',script,flush=True)
 finally:
  if p and old is not None:p.write_bytes(old)
(H/'regression-storage.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
spec=importlib.util.spec_from_file_location('period',R/'audit/path-period-JAPP129/test-ui.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);m.OUT=H/'regression-path';m.OUT.mkdir(exist_ok=True);runs=[]
for engine in ['chromium','webkit']:
 for mode in ['normal','current','switch']:
  runs.append(m.run(engine,390,mode));print('PASS previous Path',engine,mode,flush=True)
(H/'regression-ui.json').write_text(json.dumps(runs,ensure_ascii=False,indent=2),encoding='utf-8');print('PASS',sum(len(r['cases'])for r in runs),'previous Path UI checks')
