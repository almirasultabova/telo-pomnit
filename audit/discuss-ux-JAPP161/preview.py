from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from urllib.parse import urlsplit
from http.cookies import SimpleCookie
from pathlib import Path
import json,uuid,copy
from fixture import base,SOURCES
H=Path(__file__).resolve().parent;R=H.parents[1];ROOT=R/'output/discuss-ux-JAPP161/source/output/app';BASE=R/'output/silk-launch-release/output/app';SESSIONS={}
SCRIPT="""<script>
window.TelegramWebviewProxy={postEvent(){}};localStorage.setItem('tp_user:ui-consistency-preview:tp_offer_seen','true');localStorage.setItem('tp_user:ui-consistency-preview:launch_seen_v3','1');
document.addEventListener('DOMContentLoaded',()=>{let stage=0,tries=0;const t=setInterval(()=>{
 if(++tries>300){clearInterval(t);return}if(typeof Api==='undefined'||!Api.isAuthed()||typeof qStatusVerified==='undefined'||!qStatusVerified)return;
 if(stage===0){stage=1;LaunchSplash.cancel();Storage.setQSheetShown();clearTimeout(qInviteTimer);switchTab('diary');DiscussionNotes.refresh();document.getElementById('discuss-entry').click();}
 else if(stage===1&&document.querySelector('#screen-discuss .dq-start-actions')){const b=[...document.querySelectorAll('#screen-discuss button')].find(b=>b.textContent==='Из заметки');if(b&&!b.disabled){stage=2;b.click();}}
 else if(stage===2&&document.querySelector('.dq-source-record button')){const b=document.querySelector('.dq-source-record button');if(!b.disabled){stage=3;b.click();}}
 else if(stage===3&&document.getElementById('dq-source-text')){stage=4;const field=document.getElementById('dq-source-text');field.focus({preventScroll:true});field.setSelectionRange(0,2000);field.dispatchEvent(new Event('select'));clearInterval(t);}
},30)});
</script>"""
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT),**kw)
 def log_message(self,*a):pass
 def reply(self,status,data,mime='application/json; charset=utf-8',cookie=None):
  body=data if isinstance(data,bytes)else json.dumps(data,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store')
  if cookie:self.send_header('Set-Cookie','discuss_preview='+cookie+'; Path=/; SameSite=Lax')
  self.end_headers();self.wfile.write(body)
 def api(self,method='GET'):
  path=urlsplit(self.path).path.removeprefix('/api');data={}
  if method!='GET':
   try:data=json.loads(self.rfile.read(int(self.headers.get('Content-Length','0'))))
   except ValueError:pass
  cookie=SimpleCookie(self.headers.get('Cookie',''));key=(cookie['discuss_preview'].value if 'discuss_preview'in cookie else 'local')+('-before'if '/before/'in self.headers.get('Referer','')else '-after');rows=SESSIONS.setdefault(key,[])
  if path=='/diary-history/search':
   offset=data.get('offset',0);limit=data.get('limit',10);return self.reply(200,{'entries':SOURCES[offset:offset+limit],'total':len(SOURCES),'hasMore':offset+limit<len(SOURCES)})
  if path.startswith('/diary-history/'):return self.reply(200,next((r for r in SOURCES if r['id']==path.split('/')[-1]),None))
  if path.startswith('/discussion-notes'):
   rowid=path.removeprefix('/discussion-notes').strip('/');row=next((r for r in rows if r['id']==rowid),None)
   if method=='GET':return self.reply(200,row if rowid else rows)
   if row is None:
    row={'id':str(uuid.uuid4()),'clientId':data['clientId'],'text':'','source':None,'done':False,'revision':0,'createdAt':'2026-10-20T10:00:00Z'};rows.append(row)
   if 'text'in data:row['text']=data['text']
   if 'source'in data:
    source=data['source'];original=next((r for r in SOURCES if source and r['id']==source['id']),None);row['source']={**source,'label':original['title'],'day':original['day']}if source and original else None
   if 'done'in data:row['done']=data['done']
   row['revision']+=1;return self.reply(200,row)
  if method!='GET'and path.startswith('/ai/'):return self.reply(503,{'error':'AI не вызывается в просмотре'})
  return self.reply(200,base.payload(path))
 def do_GET(self):
  path=urlsplit(self.path).path
  if path.startswith('/api/'):return self.api()
  if path=='/favicon.ico':return self.reply(200,b'','image/x-icon')
  if path=='/review':return self.reply(200,(H/'compare.html').read_bytes(),'text/html; charset=utf-8')
  if path in['/','/index.html','/before/index.html']:
   html=((BASE if path.startswith('/before/')else ROOT)/'index.html').read_text(encoding='utf-8')
   if 'automation='not in self.path:html=html.replace('<head>','<head>'+SCRIPT,1)
   return self.reply(200,html.encode(),'text/html; charset=utf-8',str(uuid.uuid4()))
  return super().do_GET()
 def do_POST(self):
  if self.path.startswith('/api/'):return self.api('POST')
  self.send_error(405)
 def do_PUT(self):
  if self.path.startswith('/api/'):return self.api('PUT')
  self.send_error(405)
if __name__=='__main__':
 print('Local synthetic preview: http://127.0.0.1:15361/review',flush=True);ThreadingHTTPServer(('127.0.0.1',15361),Handler).serve_forever()
