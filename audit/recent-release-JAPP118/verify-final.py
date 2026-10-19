from pathlib import Path
import json,hashlib,ssl,certifi,urllib.request
H=Path(__file__).parent;m=json.loads((H/'manifest.json').read_text(encoding='utf-8'))
tls=ssl.create_default_context(cafile=certifi.where());results=[]
for name in m['changed']+['access-admin.html']:
 with urllib.request.urlopen('https://tg-app-telo-pomnit.vercel.app/'+name+'?verify=JAPP118-final',context=tls,timeout=30) as response:
  assert response.status==200
  assert hashlib.sha256(response.read().replace(b'\r\n',b'\n')).hexdigest()==m['publicAfter'][name]
  results.append({'file':name,'matches':True})
(H/'final-https.json').write_text(json.dumps(results,indent=2),encoding='utf-8');print('PASS final alias: five release files and cash panel match approved hashes')
