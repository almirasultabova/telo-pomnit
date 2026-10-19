from pathlib import Path
import json,ssl,certifi,urllib.request,urllib.error,subprocess
H=Path(__file__).parent;tls=ssl.create_default_context(cafile=certifi.where());results=[]
paths=['/diary/days','/checkins?limit=201','/checkins?from=2025-06-09T21%3A00%3A00.000Z&to=2025-07-14T20%3A59%3A59.999Z&limit=200']
for base in ['https://api.telo-pomnit.ru','https://tg-app-telo-pomnit.vercel.app/api','https://app.telo-pomnit.ru/api']:
 for path in paths:
  url=base+path
  try:urllib.request.urlopen(url,context=tls,timeout=20);raise AssertionError('unauthenticated access')
  except urllib.error.HTTPError as e:assert e.code==401;results.append({'url':url,'unauthenticatedStatus':e.code})
m=json.loads((H/'manifest.json').read_text(encoding='utf-8'))
for f in ['backend/src/routes/diary.js','backend/src/routes/checkins.js']:
 live=subprocess.check_output(['ssh','-i','c:/tmp/beget_key','-o','BatchMode=yes','root@45.11.93.236','sha256sum /var/www/telo-pomnit/'+f],text=True).split()[0];assert live==m['sourceAfter'][f];results.append({'source':f,'installedHashMatches':True})
(H/'api.json').write_text(json.dumps(results,indent=2),encoding='utf-8');print('PASS nine direct/main/reserve API401 checks and both installed route hashes')
