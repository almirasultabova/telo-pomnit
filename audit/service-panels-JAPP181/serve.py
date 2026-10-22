from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
from model import Model
import json,time,copy
H=Path(__file__).parent.resolve();R=H.parents[1];AFTER=R/'output/service-panels-JAPP181/source/output/app';STATES={}
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw):super().__init__(*a,directory=str(AFTER),**kw)
 def log_message(self,*a):pass
 def send(self,data,mime='application/json; charset=utf-8',status=200):
  if not isinstance(data,bytes):data=json.dumps(data,ensure_ascii=False).encode()
  self.send_response(status);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.end_headers()
  try:self.wfile.write(data)
  except ConnectionError:pass
 def api(self,method):
  ref=urlsplit(self.headers.get('Referer',''));q=parse_qs(ref.query);scenario=q.get('scenario',['error'])[0];key=(ref.path,q.get('run',['default'])[0]);m=STATES.setdefault(key,Model(31 if scenario=='last'else 65));m.confirm_error=503 if scenario=='error'else 0
  if scenario=='empty':m.streams=[]
  if scenario=='refresh'and self.path=='/api/access-admin/streams':
   m.streamReads=getattr(m,'streamReads',0)+1
   if m.streamReads==1:
    initial=copy.deepcopy(m.streams);m.streams.append({'id':'demo-new','name':'Новый учебный поток','startDate':'2026-11-15','endDate':'2026-12-15','isActive':True});return self.send(initial)
  body=json.loads(self.rfile.read(int(self.headers.get('Content-Length','0')))or b'{}')if method!='GET'else None
  if self.path.startswith('/api/access-admin/actions')and method=='POST'and not self.path.endswith('/confirm')and scenario=='late':time.sleep(.7)
  status,data=m.respond(self.path,method,body);return self.send(data,status=status)
 def do_GET(self):
  path=urlsplit(self.path).path
  if path.startswith('/api/'):return self.api('GET')
  if path=='/harness':
   side=parse_qs(urlsplit(self.path).query).get('side',['after'])[0];side='before'if side=='before'else'after'
   return self.send(f'<html><script>window.getAccessManagementToken=()=>"synthetic-memory-token"</script><style>body{{margin:0}}iframe{{border:0;width:100%;height:100vh}}</style><iframe src="/{side}/access-admin.html"></iframe></html>'.encode(),'text/html; charset=utf-8')
  if path in ['/','/review']:return self.send((H/'review.html').read_bytes(),'text/html; charset=utf-8')
  if path=='/favicon.ico':return self.send(b'','image/x-icon')
  if path.startswith(('/before/','/after/')):
   side,rel=path.strip('/').split('/',1);base=H/'before'if side=='before'else AFTER;target=(base/rel).resolve()
   if not target.is_relative_to(base.resolve()):return self.send({},status=403)
   if target.is_file():return self.send(target.read_bytes(),self.guess_type(str(target)))
   return self.send({},status=404)
  return super().do_GET()
 def do_POST(self):return self.api('POST')
 def do_PATCH(self):return self.api('PATCH')
class Server(ThreadingHTTPServer):request_queue_size=128
if __name__=='__main__':print('J181 http://127.0.0.1:16181/',flush=True);Server(('127.0.0.1',16181),Handler).serve_forever()
