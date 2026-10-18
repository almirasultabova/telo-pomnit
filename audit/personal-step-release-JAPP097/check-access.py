from pathlib import Path
import urllib.request,urllib.error,ssl,certifi,json
H=Path(__file__).parent;tls=ssl.create_default_context(cafile=certifi.where());rows=[]
for base in ['https://tg-app-telo-pomnit.vercel.app/','https://app.telo-pomnit.ru/']:
 try:urllib.request.urlopen(base+'api/after-meeting-notes/00000000-0000-4000-8000-000000000000',context=tls,timeout=20);raise AssertionError('Identity required')
 except urllib.error.HTTPError as e:assert e.code==401;rows.append({'origin':base,'newOwnerReadRoute':401})
(H/'new-route-access.json').write_text(json.dumps(rows,indent=2),encoding='utf-8');print('PASS new native read route requires identity on main and reserve; no private data requested')
