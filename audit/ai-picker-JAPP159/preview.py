from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from urllib.parse import urlsplit,parse_qs
from pathlib import Path
import json
from fixture import base,ENTRIES,preview
H=Path(__file__).resolve().parent;R=H.parents[1];ROOT=R/'output/ai-picker-JAPP159/source/output/app';BASE=R/'output/silk-launch-release/output/app'
SCRIPT="""<script>
window.TelegramWebviewProxy={postEvent(){}};localStorage.setItem('tp_user:ui-consistency-preview:tp_offer_seen','true');localStorage.setItem('tp_user:ui-consistency-preview:launch_seen_v3','1');
document.addEventListener('DOMContentLoaded',()=>{let stage=0,tries=0;const t=setInterval(()=>{
 if(++tries>300){clearInterval(t);return}if(typeof Api==='undefined'||!Api.isAuthed()||typeof qStatusVerified==='undefined'||!qStatusVerified)return;
 if(stage===0){stage=1;LaunchSplash.cancel();Storage.setQSheetShown();clearTimeout(qInviteTimer);aiAccessGranted=true;programAccess.ai={canWrite:true,reason:'program',message:'Учебный просмотр. Отправка в AI отключена.'};goTo('ai-chat');renderAiChat();const select=document.getElementById('ai-context-mode');select.value='selected';select.dispatchEvent(new Event('change'));}
 else if(stage===1&&aiContextLoadState==='loaded'){stage=2;document.querySelectorAll('#ai-context-choices input')[0]?.click();document.querySelectorAll('#ai-context-choices input')[1]?.click();const input=document.getElementById('ai-input');input.value='Учебный вопрос о моих наблюдениях.';input.dispatchEvent(new Event('input',{bubbles:true}));window.AiDelivery?.render();clearInterval(t);}
},30)});
</script>"""
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT),**kw)
 def log_message(self,*a):pass
 def reply(self,status,data,mime='application/json; charset=utf-8'):
  body=data if isinstance(data,bytes)else json.dumps(data,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body)
 def api(self,post=False):
  path=urlsplit(self.path).path.removeprefix('/api');body={}
  if post:
   try:body=json.loads(self.rfile.read(int(self.headers.get('Content-Length','0'))))
   except ValueError:pass
  if path=='/diary':return self.reply(200,ENTRIES)
  if path=='/ai/context-preview':return self.reply(200,preview(body.get('diaryEntryIds',[])))
  if path.startswith('/ai/'):
   return self.reply(503,{'error':'Отправка AI отключена в учебном просмотре'})if post else self.reply(200,[])
  data=base.payload(path)
  if path=='/me/enrollment/access':data['ai']={'canWrite':True,'reason':'program'}
  return self.reply(200,data)
 def do_GET(self):
  path=urlsplit(self.path).path
  if path.startswith('/api/'):return self.api()
  if path=='/favicon.ico':return self.reply(200,b'','image/x-icon')
  if path=='/review':return self.reply(200,(H/'compare.html').read_bytes(),'text/html; charset=utf-8')
  if path in['/','/index.html','/before/index.html']:
   html=((BASE if path.startswith('/before/')else ROOT)/'index.html').read_text(encoding='utf-8')
   if 'automation'not in parse_qs(urlsplit(self.path).query):html=html.replace('<head>','<head>'+SCRIPT,1)
   return self.reply(200,html.encode(),'text/html; charset=utf-8')
  return super().do_GET()
 def do_POST(self):
  if self.path.startswith('/api/'):return self.api(True)
  self.send_error(405)
if __name__=='__main__':
 print('Local synthetic preview: http://127.0.0.1:15359/review',flush=True);ThreadingHTTPServer(('127.0.0.1',15359),Handler).serve_forever()
