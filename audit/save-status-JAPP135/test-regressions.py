from pathlib import Path
import subprocess,json,importlib.util
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent
def module(name,path):
 spec=importlib.util.spec_from_file_location(name,R/path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
results=[]
for script,receipt in [('audit/checkin-cache-JAPP133/test-storage.cjs','audit/checkin-cache-JAPP133/storage-results.json'),('audit/diary-cache-JAPP131/test-storage.cjs','audit/diary-cache-JAPP131/storage-results.json'),('audit/path-period-JAPP129/test-storage.cjs','audit/path-period-JAPP129/storage-results.json'),('scripts/test-observation-queue.cjs',None)]:
 p=R/receipt if receipt else None;old=p.read_bytes()if p and p.exists()else None
 try:
  r=subprocess.run(['node',script],cwd=R,check=True,capture_output=True,text=True,encoding='utf-8');results.append({'script':script,'passed':True,'output':r.stdout.strip()});print('PASS',script,flush=True)
 finally:
  if p and old is not None:p.write_bytes(old)
(H/'regression-storage.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
m=module('drafts','scripts/test-observation-drafts.py');m.OUT=H/'regression-drafts';m.OUT.mkdir(exist_ok=True);runs=[]
for engine in ['chromium','webkit']:
 runs.append(m.run(engine,390));print('PASS previous drafts',engine,flush=True)
(H/'regression-drafts.json').write_text(json.dumps(runs,ensure_ascii=False,indent=2),encoding='utf-8')
m=module('checkin','audit/checkin-cache-JAPP133/test-ui.py');m.H=H/'regression-checkin';m.H.mkdir(exist_ok=True);runs=[]
for engine in ['chromium','webkit']:
 for mode in ['quota','late-ack']:
  runs.append(m.run(engine,390,mode));print('PASS previous checkin',engine,mode,flush=True)
(H/'regression-checkin.json').write_text(json.dumps(runs,ensure_ascii=False,indent=2),encoding='utf-8')
m=module('status','audit/save-status-JAPP135/test-ui.py');runs=[]
for engine in ['chromium','webkit']:
 for mode in ['late-retry','blocked']:
  runs.append(m.run(engine,390,mode));print('PASS extra status',engine,mode,flush=True)
(H/'extra-ui.json').write_text(json.dumps(runs,ensure_ascii=False,indent=2),encoding='utf-8');print('PASS all previous contracts and held retry/storage denial')
