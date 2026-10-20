from pathlib import Path
import json,ssl,certifi,urllib.request,urllib.error,uuid
H=Path(__file__).parent;tls=ssl.create_default_context(cafile=certifi.where());rows=[]
# No identity; no participant data, operation or provider request can be created.
# Valid long messages reaching 401 prove live schema no longer rejects >1000.
for base in ['https://api.telo-pomnit.ru','https://tg-app-telo-pomnit.vercel.app/api','https://app.telo-pomnit.ru/api']:
 for text,expected in [('Длинное сообщение. '*100,401),('😀'*1001,401),('x'*(2*1024*1024),413)]:
  data=json.dumps({'message':text,'operationId':str(uuid.uuid4()),'contextMode':'none'}).encode()
  req=urllib.request.Request(base+'/ai/chat',data=data,headers={'Content-Type':'application/json'},method='POST')
  try:urllib.request.urlopen(req,context=tls,timeout=30);raise AssertionError('Anonymous AI request accepted')
  except urllib.error.HTTPError as e:
   allowed=[expected]if expected!=413 or base=='https://api.telo-pomnit.ru'else[413,502]
   assert e.code in allowed,(base,e.code,allowed);rows.append({'origin':base,'characters':len(text),'status':e.code,'expected':expected,'proxyMayRejectLargeBody':expected==413 and e.code==502})
(H/'long-live.json').write_text(json.dumps({'checks':rows,'authNotBypassed':True,'realProviderRequests':0,'participantWrites':0},indent=2),encoding='utf-8');print('PASS 9 live long-message schema/auth/body-size checks; no authenticated requests')
