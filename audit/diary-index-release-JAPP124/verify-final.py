from pathlib import Path
import hashlib,json,ssl,certifi,urllib.request
H=Path(__file__).parent;m=json.loads((H/'manifest.json').read_text(encoding='utf-8'));tls=ssl.create_default_context(cafile=certifi.where());results=[]
for f in ['index.html','screen-review.html','js/api.js','js/app.js','js/storage.js','access-admin.html']:
 with urllib.request.urlopen('https://tg-app-telo-pomnit.vercel.app/'+f+'?verify=JAPP124-final',context=tls,timeout=30) as response:
  assert response.status==200;assert hashlib.sha256(response.read().replace(b'\r\n',b'\n')).hexdigest()==m['publicAfter'][f]
  results.append({'file':f,'matches':True})
(H/'final-https.json').write_text(json.dumps(results,indent=2),encoding='utf-8');print('PASS final main alias: unchanged UI/API client and cash panel hashes match')
