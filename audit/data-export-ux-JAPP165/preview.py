from pathlib import Path
from urllib.parse import urlsplit
import importlib.util
from fixture import base,PDF,SERVER
H=Path(__file__).resolve().parent;R=H.parents[1]
spec=importlib.util.spec_from_file_location('habitual_preview163',R/'audit/habitual-ux-JAPP163/preview.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.AFTER=R/'output/data-export-ux-JAPP165/source/output/app';m.BEFORE=R/'output/silk-launch-release/output/app';m.H=H
m.SCRIPT='''<script>window.TelegramWebviewProxy={postEvent(){}};localStorage.setItem('tp_user:ui-consistency-preview:tp_offer_seen','true');localStorage.setItem('tp_user:ui-consistency-preview:launch_seen_v3','1');document.addEventListener('DOMContentLoaded',()=>{let busy=false;const timer=setInterval(async()=>{if(busy||typeof qStatusVerified==='undefined'||!qStatusVerified||typeof currentScreen==='undefined'||currentScreen!=='home'||!Api.isAuthed())return;busy=true;LaunchSplash.cancel();Storage.setQSheetShown();clearTimeout(qInviteTimer);switchTab('profile');await openDataRights();if(new URLSearchParams(location.search).get('mode')==='copy'){document.querySelector('.data-additional').open=true;document.getElementById('data-export-local').click()}else document.getElementById('data-export-pdf').click();clearInterval(timer)},50)});</script>'''
class Handler(m.Handler):
 def do_GET(self):
  path=urlsplit(self.path).path
  if path=='/api/gdpr/diary.pdf':return self.reply(PDF,'application/pdf')
  if path=='/api/gdpr/my-data':return self.reply(SERVER)
  return super().do_GET()
 def do_POST(self):
  path=urlsplit(self.path).path
  if path=='/api/auth/data-rights':
   size=int(self.headers.get('Content-Length','0'));self.rfile.read(size);return self.reply({'token':'synthetic-limited-purpose-token','user':base.USER,'expiresIn':600})
  return super().do_POST()
if __name__=='__main__':
 print('Synthetic export preview: http://127.0.0.1:15365/review',flush=True);m.ThreadingHTTPServer(('127.0.0.1',15365),Handler).serve_forever()
