from pathlib import Path
import json,ssl,certifi,urllib.request,urllib.error,subprocess
H=Path(__file__).parent;tls=ssl.create_default_context(cafile=certifi.where());results=[]
for url in ['https://api.telo-pomnit.ru/diary/days','https://tg-app-telo-pomnit.vercel.app/api/diary/days','https://app.telo-pomnit.ru/api/diary/days']:
 try:urllib.request.urlopen(url,context=tls,timeout=20);raise AssertionError('unauthenticated access')
 except urllib.error.HTTPError as e:assert e.code==401;results.append({'url':url,'unauthenticatedStatus':e.code})
m=json.loads((H/'manifest.json').read_text(encoding='utf-8'));live=subprocess.check_output(['ssh','-i','c:/tmp/beget_key','-o','BatchMode=yes','root@45.11.93.236','sha256sum /var/www/telo-pomnit/backend/src/routes/diary.js'],text=True).split()[0]
assert live==m['backend'][0]['after'];results.append({'installedBackendHashMatchesApprovedJ119':True,'nextCandidateNotInstalled':True})
(H/'api.json').write_text(json.dumps(results,indent=2),encoding='utf-8');print('PASS new route direct/main/reserve401; installed source is approved J119, next candidate excluded')
