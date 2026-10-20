from pathlib import Path
from http.server import ThreadingHTTPServer
from urllib.parse import urlsplit
import importlib.util
from fixture import ACCESS,base
H=Path(__file__).resolve().parent;R=H.parents[1]
spec=importlib.util.spec_from_file_location('profile_preview163',R/'audit/habitual-ux-JAPP163/preview.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.AFTER=R/'output/profile-schedule-JAPP171/source/output/app';m.BEFORE=R/'output/silk-launch-release/output/app';m.H=H
m.SCRIPT='''<script>window.TelegramWebviewProxy={postEvent(){}};localStorage.setItem('tp_user:ui-consistency-preview:tp_offer_seen','true');localStorage.setItem('tp_user:ui-consistency-preview:launch_seen_v3','1');document.addEventListener('DOMContentLoaded',()=>{const timer=setInterval(()=>{if(typeof qStatusVerified==='undefined'||!qStatusVerified||!Api.isAuthed())return;clearInterval(timer);LaunchSplash.cancel();Storage.setQSheetShown();clearTimeout(qInviteTimer);switchTab('profile');document.querySelector('.program-refresh').scrollIntoView({block:'center'});const original=Api.getAccess.bind(Api);Api.getAccess=()=>new Promise((resolve,reject)=>setTimeout(()=>new URLSearchParams(location.search).get('mode')==='error'?reject(new Error('Учебная ошибка связи')):original().then(resolve,reject),1200));},60)});</script>'''
class Handler(m.Handler):
 def do_GET(self):
  if urlsplit(self.path).path=='/api/me/enrollment/access':return self.reply(ACCESS)
  if urlsplit(self.path).path.startswith('/api/questionnaires/'):return self.reply({'pre':None,'post':None})
  return super().do_GET()
if __name__=='__main__':
 print('Local J171: http://127.0.0.1:15371/review',flush=True);ThreadingHTTPServer(('127.0.0.1',15371),Handler).serve_forever()
