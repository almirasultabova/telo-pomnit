from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import json,hashlib,urllib.request,urllib.error,ssl,certifi,sys
HERE=Path(__file__).resolve().parent
manifest=json.loads((HERE/'manifest.json').read_text(encoding='utf-8'))['publicAfter']
tls=ssl.create_default_context(cafile=certifi.where())
origins={'main':'https://tg-app-telo-pomnit.vercel.app/','reserve':'https://app.telo-pomnit.ru/','recovery':'https://app.telo-pomnit.ru/recovery/j293/'}
def check(task):
 name,p=task
 try:
  with urllib.request.urlopen(origins[name]+p+'?verify=JAPP097',timeout=30,context=tls)as response:data=response.read();status=response.status
  if Path(p).suffix in ['.html','.css','.js','.txt','.svg','.json']:data=data.replace(b'\r\n',b'\n')
  return {'origin':name,'file':p,'ok':status==200 and hashlib.sha256(data).hexdigest()==manifest[p]}
 except Exception as e:return {'origin':name,'file':p,'ok':False,'error':type(e).__name__}
if '--retry'in sys.argv:
 results=json.loads((HERE/'https.json').read_text(encoding='utf-8'))
 for i,row in enumerate(results):
  if not row['ok']:results[i]=check((row['origin'],row['file']))
else:
 with ThreadPoolExecutor(max_workers=8)as pool:results=list(pool.map(check,[(name,p)for name in origins for p in manifest]))
(HERE/'https.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
assert not[r for r in results if not r['ok']],[r for r in results if not r['ok']]
for base in list(origins.values())[:2]:
 try:urllib.request.urlopen(base+'api/diary-history/body/00000000-0000-4000-8000-000000000000',context=tls,timeout=20);raise AssertionError('access without identity')
 except urllib.error.HTTPError as e:assert e.code==401
with urllib.request.urlopen('https://api.telo-pomnit.ru/health',context=tls,timeout=20)as r:assert r.status==200
print('PASS 84/84 hashes on main/reserve/recovery via TLS; health200, access401; no auth, participant writes or sends')
