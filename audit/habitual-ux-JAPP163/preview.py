from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from urllib.parse import urlsplit
from pathlib import Path
import json
from fixture import base
H=Path(__file__).resolve().parent;R=H.parents[1];AFTER=R/'output/habitual-ux-JAPP163/source/output/app';BEFORE=R/'output/silk-launch-release/output/app'
SCRIPT='''<script>window.TelegramWebviewProxy={postEvent(){}};localStorage.setItem('tp_user:ui-consistency-preview:tp_offer_seen','true');localStorage.setItem('tp_user:ui-consistency-preview:launch_seen_v3','1');document.addEventListener('DOMContentLoaded',()=>{let busy=false;const timer=setInterval(async()=>{if(busy||typeof qStatusVerified==='undefined'||!qStatusVerified||!Api.isAuthed())return;busy=true;LaunchSplash.cancel();Storage.setQSheetShown();clearTimeout(qInviteTimer);switchTab('diag');await Storage.ensurePathPeriod(pathPeriodScope());renderMyPathTab();if(new URLSearchParams(location.search).get('mode')==='answers'){Storage._set('habitual_result_v2',JSON.stringify({...Habitual.calculate(Array(16).fill(2)),syncStatus:'synced'}));renderMyPathTab();document.querySelector('.habitual-result-disclosure').open=true;showHabitualAnswers()}else startDiag(false,true);clearInterval(timer)},50)});</script>'''
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw):super().__init__(*a,directory=str(AFTER),**kw)
 def log_message(self,*a):pass
 def reply(self,data,mime='application/json; charset=utf-8'):
  body=data if isinstance(data,bytes)else json.dumps(data,ensure_ascii=False).encode();self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body)
 def do_GET(self):
  path=urlsplit(self.path).path
  if path.startswith('/api/'):
   api=path.removeprefix('/api');return self.reply(None if api=='/habitual/result'else base.payload(api))
  if path=='/review':return self.reply((H/'compare.html').read_bytes(),'text/html; charset=utf-8')
  if path=='/favicon.ico':return self.reply(b'','image/x-icon')
  before=path.startswith('/before/');source=BEFORE if before else AFTER
  target=source/path.removeprefix('/before/').lstrip('/')if before else source/path.lstrip('/')
  if path in['/','/index.html','/before/index.html']:
   html=(source/'index.html').read_text(encoding='utf-8')
   if before:html=html.replace('<head>','<head><base href="/before/">',1)
   if 'automation='not in self.path:html=html.replace('<head>','<head>'+SCRIPT,1)
   return self.reply(html.encode(),'text/html; charset=utf-8')
  if before and target.is_file():return self.reply(target.read_bytes(),self.guess_type(str(target)))
  return super().do_GET()
 def do_POST(self):
  path=urlsplit(self.path).path.removeprefix('/api');size=int(self.headers.get('Content-Length','0'));data=json.loads(self.rfile.read(size))if size else{}
  if path=='/habitual/result':return self.reply({**data,'date':'2026-10-20T12:00:00Z'})
  return self.reply(base.payload(path))
if __name__=='__main__':
 print('Synthetic local preview: http://127.0.0.1:15363/review',flush=True);ThreadingHTTPServer(('127.0.0.1',15363),Handler).serve_forever()
