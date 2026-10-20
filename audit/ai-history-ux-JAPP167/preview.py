from pathlib import Path
from urllib.parse import urlsplit
import importlib.util,copy,time
from fixture import base,SESSIONS,detail
H=Path(__file__).resolve().parent;R=H.parents[1]
spec=importlib.util.spec_from_file_location('base_preview163',R/'audit/habitual-ux-JAPP163/preview.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.AFTER=R/'output/ai-history-ux-JAPP167/source/output/app';m.BEFORE=R/'output/silk-launch-release/output/app';m.H=H
m.SCRIPT='''<script>window.TelegramWebviewProxy={postEvent(){}};localStorage.setItem('tp_user:ui-consistency-preview:tp_offer_seen','true');localStorage.setItem('tp_user:ui-consistency-preview:launch_seen_v3','1');document.addEventListener('DOMContentLoaded',()=>{let busy=false;const timer=setInterval(async()=>{if(busy||typeof qStatusVerified==='undefined'||!qStatusVerified||typeof currentScreen==='undefined'||currentScreen!=='home'||!Api.isAuthed())return;busy=true;LaunchSplash.cancel();Storage.setQSheetShown();clearTimeout(qInviteTimer);goTo('ai-chat');await refreshAiScreen();document.querySelector('.ai-history-disclosure').open=true;const select=document.getElementById('ai-history-select');select.value='history-a';select.dispatchEvent(new Event('change'));const loaded=setInterval(()=>{if(aiSessionId!=='history-a')return;clearInterval(loaded);const input=document.getElementById('ai-input');input.value='Учебный черновик первого разговора';input.dispatchEvent(new Event('input'));if(new URLSearchParams(location.search).get('mode')==='error'){select.value='history-b';select.dispatchEvent(new Event('change'))}},40);clearInterval(timer)},50)});</script>'''
class Handler(m.Handler):
 def do_GET(self):
  path=urlsplit(self.path).path
  if path=='/api/me/enrollment/access':
   access=copy.deepcopy(base.ACCESS);access['ai']={'canWrite':True,'reason':'program','message':'Учебный просмотр истории AI.'};return self.reply(access)
  if path=='/api/ai/sessions':return self.reply(SESSIONS)
  if path.startswith('/api/ai/sessions/'):
   id=path.rsplit('/',1)[1];time.sleep(.5)
   if id=='history-b'and'mode=error'in self.headers.get('Referer',''):
    self.send_response(503);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{"error":"Synthetic unavailable conversation"}');return
   return self.reply(detail(id))
  return super().do_GET()
 def do_POST(self):
  if urlsplit(self.path).path.startswith('/api/ai/'):
   self.send_response(503);self.end_headers();return
  return super().do_POST()
if __name__=='__main__':
 print('Synthetic history preview: http://127.0.0.1:15367/review',flush=True);m.ThreadingHTTPServer(('127.0.0.1',15367),Handler).serve_forever()
