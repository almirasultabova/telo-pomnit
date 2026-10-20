"""Isolated visual proposal. Published sources are only read; APIs are synthetic."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlsplit, parse_qs
import importlib.util, json, copy, time

HERE = Path(__file__).resolve().parent
PROPOSAL = HERE.parent / 'profile-whole-JAPP171'
ROOT = HERE.parents[1]
PUBLIC = ROOT / 'output/silk-launch-release/output'
if not PUBLIC.is_dir(): PUBLIC = ROOT / 'output'
spec = importlib.util.spec_from_file_location('whole_fixture', ROOT / 'audit/ui-consistency-JAPP147/fixture.py')
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
fixture.USER['name'] = 'Анна'
ACCESS = copy.deepcopy(fixture.ACCESS)
ACCESS['serverTime'] = '2026-10-20T12:00:00Z'
ACCESS['ai'] = {'canWrite': False, 'reason': 'questionnaire_required', 'questionnaireStreamId': fixture.STREAM}
stream = ACCESS['streams'][0]
stream.update(name='Октябрьский поток', chatLink='https://t.me/example', zoomLink='https://example.invalid/live')
stream['meetings'] = [dict(id=f'meeting-{i}', number=i, date=date, topic=topic,
    description='Разберём вопросы участниц и наблюдения за время потока.' if i % 2 else 'Мягкая телесная практика в удобном для себя темпе.',
    prepare='Приготовьте удобное место и воду.', **({'recordingUrl': 'https://example.invalid/recording', 'recordingPasscode': 'ПРИМЕР-123'} if i < 3 else {}))
    for i, (date, topic) in enumerate([
        ('2026-10-15T15:00:00Z','Психосоматический разбор'), ('2026-10-18T08:00:00Z','Телесная практика'),
        ('2026-10-22T15:00:00Z','Психосоматический разбор'), ('2026-10-25T08:00:00Z','Телесная практика'),
        ('2026-10-29T15:00:00Z','Психосоматический разбор'), ('2026-11-01T08:00:00Z','Телесная практика'),
        ('2026-11-05T15:00:00Z','Психосоматический разбор'), ('2026-11-08T08:00:00Z','Телесная практика')], 1)]
ACCESS['streams'].append({**copy.deepcopy(stream), 'id':'past-example', 'name':'Сентябрьский поток',
    'phase':'completed', 'status':'completed', 'startDate':'2026-09-01T15:00:00Z', 'endDate':'2026-10-01T15:00:00Z',
    'canAttend':False, 'recordingsExpiresAt':'2027-01-02T00:00:00Z', 'meetings':[{**stream['meetings'][0], 'id':'past-meeting', 'date':'2026-09-03T15:00:00Z'}]})
BOOT = '''<script>window.TelegramWebviewProxy={postEvent(){}};
localStorage.setItem('tp_user:ui-consistency-preview:tp_offer_seen','true');
localStorage.setItem('tp_user:ui-consistency-preview:launch_seen_v3','1');
document.addEventListener('DOMContentLoaded',()=>{const t=setInterval(()=>{
if(typeof qStatusVerified==='undefined'||!Api.isAuthed()||!programAccess)return;
const demo=new URLSearchParams(location.search).get('state');
if(programAccess?.streams.length&&!qStatusVerified&&!['error','loaded'].includes(qStatusState)&&!['q-loading','host'].includes(demo))return;
clearInterval(t);LaunchSplash.cancel();Storage.setQSheetShown();clearTimeout(qInviteTimer);
switchTab('profile');document.querySelector('#tab-profile .screen-scroll').scrollTop=0;
window.parent.postMessage({type:'profile-ready',side:location.pathname.startsWith('/after/')?'after':'before'},location.origin);
},60)});</script>'''

class Handler(SimpleHTTPRequestHandler):
 calls={}
 pre={}
 post={}
 def __init__(self,*a,**kw):super().__init__(*a,directory=str(PUBLIC/'app'),**kw)
 def log_message(self,*a):pass
 def send(self,body,mime='application/json; charset=utf-8',status=200):
  if not isinstance(body,bytes):body=json.dumps(body,ensure_ascii=False).encode()
  self.send_response(status);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(body)))
  self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body)
 def do_GET(self):
  path=urlsplit(self.path).path
  referer=urlsplit(self.headers.get('Referer',''));query=parse_qs(referer.query);mode=query.get('state',['current'])[0]
  key=(referer.path,query.get('run',['default'])[0],mode,path)
  if path.startswith('/api/'):
   api=path[4:]
   if api=='/me/enrollment/access':
    data=copy.deepcopy(ACCESS)
    self.calls[key]=self.calls.get(key,0)+1
    if mode=='access-error' and self.calls[key]==2:return self.send({'error':'Synthetic access error'},status=503)
    if mode=='single':data['streams']=data['streams'][:1]
    if mode in ['completed','completed-filled']:data['streams']=data['streams'][1:]
    if mode=='upcoming':
     data['streams']=data['streams'][:1];data['streams'][0]['phase']='upcoming';data['streams'][0]['startDate']='2026-10-21T15:00:00Z'
     data['streams'][0]['meetings']=data['streams'][0]['meetings'][2:]
    if mode=='none':data['streams']=[]
    if mode=='multiple':data['streams'].append({**copy.deepcopy(data['streams'][0]),'id':'second-current','name':'Второй действующий поток'})
    if mode=='expired':
     data['streams']=data['streams'][1:];data['streams'][0].update(canReadRecordings=False,recordingsExpiresAt='2026-10-01T00:00:00Z')
    if mode=='no-recording':
     for item in data['streams'][0]['meetings']:item.pop('recordingUrl',None);item.pop('recordingPasscode',None)
    return self.send(data)
   if api.startswith('/questionnaires/'):
    self.calls[key]=self.calls.get(key,0)+1
    if mode=='q-error' and self.calls[key]<=2:return self.send({'error':'Synthetic questionnaire error'},status=503)
    if mode=='q-loading':time.sleep(2)
    filled=mode in ['filled','completed-filled']
    saved_key=(referer.path,query.get('run',['default'])[0],mode,api.split('/')[-1])
    return self.send({'pre':self.pre.get(saved_key,{'id':'example-filled','answers':{},'formVersion':1}if filled else None),'post':self.post.get(saved_key,{'id':'example-post','answers':{},'formVersion':2}if mode=='completed-filled'else None)})
   if api=='/me/profile-stats':return self.send({'visitStreak':12,'savedObservations':8})
   if mode=='host' and api in ['/auth/telegram','/me']:
    data=fixture.payload(api);data['user']={**fixture.USER,'role':'HOST'};return self.send(data)
   return self.send(fixture.payload(api))
  if path in ['/','/review']:return self.send((PROPOSAL/'review.html').read_bytes(),'text/html; charset=utf-8')
  if path=='/favicon.ico':return self.send(b'','image/x-icon')
  if path in ['/concept.js','/concept.css']:
   return self.send((PROPOSAL/path[1:]).read_bytes(),self.guess_type(path))
  if path.startswith(('/before/','/after/')):
   side,relative=path.strip('/').split('/',1)
   base = HERE/'before' if side=='before' else PUBLIC/'app'
   target=(base/relative).resolve()
   if not target.is_relative_to(base.resolve()):return self.send({},status=403)
   if relative=='index.html':
    html=target.read_text(encoding='utf-8').replace('<head>',f'<head><base href="/{side}/">'+BOOT,1)
    return self.send(html.encode(),'text/html; charset=utf-8')
   if target.is_file():return self.send(target.read_bytes(),self.guess_type(str(target)))
   return self.send({},status=404)
  return super().do_GET()
 def do_POST(self):
  size=int(self.headers.get('Content-Length','0'));data=json.loads(self.rfile.read(size))if size else{}
  api=urlsplit(self.path).path.removeprefix('/api')
  if api=='/auth/telegram' and parse_qs(urlsplit(self.headers.get('Referer','')).query).get('state',[''])[0]=='host':
   response=fixture.payload(api);response['user']={**fixture.USER,'role':'HOST'};return self.send(response)
  if api in ['/questionnaires/pre','/questionnaires/post']:
   referer=urlsplit(self.headers.get('Referer',''));query=parse_qs(referer.query)
   key=(referer.path,query.get('run',['default'])[0],query.get('state',['current'])[0],data.get('streamId'))
   record={'id':'synthetic-'+api.rsplit('/',1)[-1],**data,'submittedAt':'2026-10-20T12:00:00Z'}
   (self.pre if api.endswith('/pre')else self.post)[key]=record
   return self.send(record)
  return self.send(fixture.payload(api))

if __name__=='__main__':
 print('Profile comparison: http://127.0.0.1:15374/review',flush=True)
 ThreadingHTTPServer(('127.0.0.1',15374),Handler).serve_forever()
