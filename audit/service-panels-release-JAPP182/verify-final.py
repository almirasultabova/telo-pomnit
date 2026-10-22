from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import json,hashlib,urllib.request,ssl,certifi
H=Path(__file__).resolve().parent;m=json.loads((H/'manifest.json').read_text(encoding='utf-8'));tls=ssl.create_default_context(cafile=certifi.where())
names=[f for f,h in m['publicAfter'].items()if h!=m['publicBefore'].get(f)]
origins=['https://tg-app-telo-pomnit.vercel.app/','https://app.telo-pomnit.ru/','https://app.telo-pomnit.ru/recovery/j293/']
def check(task):
 base,f=task
 with urllib.request.urlopen(base+f+'?verify=JAPP182-final',context=tls,timeout=30)as r:data=r.read();status=r.status
 if Path(f).suffix in['.html','.css','.js']:data=data.replace(b'\r\n',b'\n')
 return {'origin':base,'file':f,'ok':status==200 and hashlib.sha256(data).hexdigest()==m['publicAfter'][f]}
with ThreadPoolExecutor(max_workers=6)as pool:results=list(pool.map(check,[(base,f)for base in origins for f in names]))
(H/'final-https.json').write_text(json.dumps(results,indent=2),encoding='utf-8');assert all(x['ok']for x in results);print(f'PASS final {len(results)} HTTPS hashes; approved service panels J181 live as release J182')
