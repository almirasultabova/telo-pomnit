from pathlib import Path
import urllib.request,urllib.error,ssl,certifi,json,hashlib
HERE=Path(__file__).resolve().parent;m=json.loads((HERE/'manifest.json').read_text(encoding='utf-8'))
tls=ssl.create_default_context(cafile=certifi.where());rows=[]
apis=['https://api.telo-pomnit.ru/','https://tg-app-telo-pomnit.vercel.app/api/','https://app.telo-pomnit.ru/api/']
for base in apis:
 for headers in [{},{'Authorization':'Bearer fictional-invalid-not-a-real-account'}]:
  url=base+'admin/participants/00000000-0000-4000-8000-000000000000'
  try:urllib.request.urlopen(urllib.request.Request(url,headers=headers),context=tls,timeout=20);raise AssertionError('Unauthenticated card must be denied')
  except urllib.error.HTTPError as e:assert e.code==401;rows.append({'url':url,'credential':'none'if not headers else'invalid synthetic','status':e.code})
 for endpoint in ['access-admin/users','me/enrollment/access']:
  try:urllib.request.urlopen(base+endpoint,context=tls,timeout=20);raise AssertionError('Unauthorized endpoint')
  except urllib.error.HTTPError as e:assert e.code==401;rows.append({'url':base+endpoint,'status':e.code})
with urllib.request.urlopen('https://api.telo-pomnit.ru/health',context=tls,timeout=20)as r:assert r.status==200;rows.append({'health':r.status})
for base in ['https://tg-app-telo-pomnit.vercel.app/','https://app.telo-pomnit.ru/','https://app.telo-pomnit.ru/recovery/j293/']:
 for p in ['index.html','js/app.js']:
  with urllib.request.urlopen(base+p,context=tls,timeout=20)as r:data=r.read();assert r.status==200
  assert hashlib.sha256(data.replace(b'\r\n',b'\n')).hexdigest()==m['publicUnchanged'][p]
  rows.append({'url':base+p,'publicHashUnchanged':True})
(HERE/'https.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
print('PASS TLS: health200, card no/invalid identity401, management/access401, unchanged main/reserve/recovery HTML and JS; no valid identity or real participant read')
