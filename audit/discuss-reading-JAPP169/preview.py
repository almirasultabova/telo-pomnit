from pathlib import Path
from urllib.parse import urlsplit
from http.cookies import SimpleCookie
from http.server import ThreadingHTTPServer
import importlib.util,copy
from fixture import ROWS
H=Path(__file__).resolve().parent;R=H.parents[1]
spec=importlib.util.spec_from_file_location('discussion_preview161',R/'audit/discuss-ux-JAPP161/preview.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.ROOT=R/'output/discuss-reading-JAPP169/source/output/app';m.BASE=R/'output/silk-launch-release/output/app';m.H=H
m.SCRIPT="""<script>window.TelegramWebviewProxy={postEvent(){}};localStorage.setItem('tp_user:ui-consistency-preview:tp_offer_seen','true');localStorage.setItem('tp_user:ui-consistency-preview:launch_seen_v3','1');document.addEventListener('DOMContentLoaded',()=>{let step=0;const timer=setInterval(()=>{if(typeof qStatusVerified==='undefined'||!qStatusVerified||!Api.isAuthed())return;if(step===0){step=1;LaunchSplash.cancel();Storage.setQSheetShown();clearTimeout(qInviteTimer);switchTab('diary');DiscussionNotes.refresh();document.getElementById('discuss-entry').click()}else if(step===1&&document.querySelectorAll('.dq-record .dq-link').length>12){step=2;const link=document.querySelectorAll('.dq-record .dq-link')[12];link.scrollIntoView({block:'center'});link.click()}else if(step===2&&document.querySelector('.dq-detail-actions')){step=3;document.querySelector('.dq-back').click();clearInterval(timer)}},60)});</script>"""
class Handler(m.Handler):
 def api(self,method='GET'):
  if urlsplit(self.path).path.startswith('/api/discussion-notes'):
   cookie=SimpleCookie(self.headers.get('Cookie',''));key=(cookie['discuss_preview'].value if 'discuss_preview'in cookie else 'local')+('-before'if '/before/'in self.headers.get('Referer','')else '-after')
   if not m.SESSIONS.get(key):m.SESSIONS[key]=copy.deepcopy(ROWS)
  return super().api(method)
if __name__=='__main__':
 print('Local J169: http://127.0.0.1:15369/review',flush=True);ThreadingHTTPServer(('127.0.0.1',15369),Handler).serve_forever()
