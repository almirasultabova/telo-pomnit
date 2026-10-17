"""Native candidate tests. Only public fixture/media; all API responses stay inside the fixture."""
from pathlib import Path
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from urllib.parse import urlparse,parse_qs
import mimetypes,json
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1];PUBLIC=ROOT/'output/silk-launch-release/output/app'
class Handler(BaseHTTPRequestHandler):
 def do_GET(self):
  url=urlparse(self.path);name=url.path
  if name in ['/','/screen-review.html']:
   case=parse_qs(url.query).get('case',['normal'])[0];html=(PUBLIC/'screen-review.html').read_text(encoding='utf-8')
   config={
    'expired':"stream.canReadRecordings=false;stream.chatLink=null;",
    'revoked':"stream.canReadRecordings=false;stream.chatLink=null;stream.accessExpired=true;",
    'missing':"stream.chatLink=null;",
    'badurl':"stream.chatLink='javascript:alert(1)';",
    'long':"stream.name="+json.dumps('Длинное название <img src=x onerror=alert(1)> «Своё пространство и бережное внимание к себе»',ensure_ascii=False)+';',
    'upcoming':"stream.phase='upcoming';stream.canAttend=false;stream.canReadRecordings=false;stream.canUseAi=false;stream.zoomLink=null;stream.chatLink=null;",
   }.get(case,'')
   html=html.replace('  window.fetch=',config+'\n  window.fetch=')
   if case in ['host','staff']:
    html=html.replace("role:'PARTICIPANT'","role:'HOST'").replace("ai:{canWrite:!ended,reason:ended?'ended':'active'","ai:{canWrite:true,reason:'host'")
   if case=='staff':
    html=html.replace("frame-src 'none'","frame-src 'self'")
    html=html.replace('</body>','<script>'+(ROOT/'app/js/screen-review.js').read_text(encoding='utf-8')+'</script></body>')
   if case=='multi':html=html.replace('streams:[stream],',"streams:[stream,{...stream,id:'fictional-second',name:'Другой поток'}],")
   if case=='none':html=html.replace('streams:[stream],','streams:[],')
   if case=='pre':
    html=html.replace("let pre=['pre'","let pre=['stream-current','pre'")
    html=html.replace("ai:{canWrite:!ended,reason:ended?'ended':'active'","ai:{canWrite:false,questionnaireStreamId:stream.id,reason:'questionnaire_required'")
   if case=='network':
    html=html.replace('let reviewCheckins=[];','let accessCalls=0;let reviewCheckins=[];')
    needle="else if(pathname==='/api/me/enrollment/access' && method==='GET')"
    html=html.replace(needle,"else if(pathname==='/api/me/enrollment/access' && method==='GET' && ++accessCalls>1){status=503;body={error:'Учебный сбой'};}\n    "+needle)
   if case=='multi':html=html.replace("body={pre,post};","body={pre:pre?{...pre,streamId:pathname.split('/').pop()}:null,post};")
   self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(html.encode());return
  if name.startswith(('/media/app/','/media/shared/')):
   target=(PUBLIC/name.lstrip('/')).resolve()
   if not target.is_relative_to(PUBLIC.resolve()):self.send_error(403);return
  else:self.send_error(404);return
  if not target.is_file():self.send_error(404);return
  self.send_response(200);self.send_header('Content-Type',mimetypes.guess_type(target.name)[0]or'application/octet-stream');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(target.read_bytes())
 def do_POST(self):self.send_error(403)
 def log_message(self,*args):pass
if __name__=='__main__':
 print('Native stream release candidate http://127.0.0.1:8912/',flush=True);ThreadingHTTPServer(('127.0.0.1',8912),Handler).serve_forever()
