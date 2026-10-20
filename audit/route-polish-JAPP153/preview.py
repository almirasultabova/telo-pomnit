"""Local review with synthetic API. Never proxies to production or calls external services."""
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from urllib.parse import urlsplit,parse_qs
from pathlib import Path
from http.cookies import SimpleCookie
import sys

from fixture import base,ROW
payload=base.payload;STREAM=base.STREAM;ACCESS=base.ACCESS
import json,copy,uuid
ROOT=Path(__file__).resolve().parents[2]/'output/route-polish-JAPP153/source/output/app'
BASE=Path(__file__).resolve().parents[2]/'output/silk-launch-release/output/app'
SESSIONS={};PREVIEW_ROW=copy.deepcopy(ROW)
SCRIPT="""<script>
window.TelegramWebviewProxy={postEvent(){}};
localStorage.setItem('tp_user:ui-consistency-preview:tp_offer_seen','true');
localStorage.setItem('tp_user:ui-consistency-preview:launch_seen_v3','1');
document.addEventListener('DOMContentLoaded',()=>{
  let tries=0;const timer=setInterval(()=>{
    if(++tries>150){clearInterval(timer);return}
    if(typeof Api==='undefined'||!Api.isAuthed()||typeof qStatusVerified==='undefined'||!qStatusVerified||currentScreen!=='home')return;
    clearInterval(timer);LaunchSplash.cancel();Storage.setQSheetShown();clearTimeout(qInviteTimer);
    const view=new URLSearchParams(location.search).get('view');
    if(view==='feedback')openFeedback();
    else if(view==='questionnaire'){openQuestionnaire();qAnswers={};for(const block of Q_BLOCKS)for(const f of block.fields)if(f.required)qAnswers[f.id]=f.type==='radio'?f.options[0]:f.type==='checkbox'?[f.options[0]]:f.type==='scale'?5:'Учебный ответ';qStep=Q_BLOCKS.length-1;renderQBlock();focusQuestionnaireBlock();}
    else if(view==='step')AfterMeeting.openStepById('15300000-0000-4000-8000-000000000001');
    else if(view==='reaction')document.getElementById('stop-reaction-btn').click();
    else if(view==='body')document.getElementById('start-entry-btn').click();
    else if(view==='checkin')document.getElementById('checkin-btn').click();
    else if(view==='diary')switchTab('diary');else if(view==='path')switchTab('diag');else if(view==='profile')switchTab('profile');
  },80);
});</script>"""
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
    def log_message(self,*args):pass
    def reply(self,status,data,content_type='application/json; charset=utf-8'):
        body=json.dumps(data,ensure_ascii=False).encode()if isinstance(data,(dict,list))else data
        self.send_response(status);self.send_header('Content-Type',content_type);self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body)
    def api(self,post=False):
        path=urlsplit(self.path).path[4:];body={}
        if post:
            raw=self.rfile.read(int(self.headers.get('Content-Length','0')))
            try:body=json.loads(raw)
            except ValueError:pass
        cookie=SimpleCookie(self.headers.get('Cookie',''));key=cookie['ui_preview'].value if'ui_preview'in cookie else'local'
        state=SESSIONS.setdefault(key,{'attempts':{},'pre':None})
        if post and path in ['/feedback','/questionnaires/pre']:
            n=state['attempts'].get(path,0)+1;state['attempts'][path]=n
            if n==1:return self.reply(503,{'error':'Учебный отказ отправки'})
            if path.endswith('/pre'):state['pre']={'id':'synthetic-pre','answers':body.get('answers',{}),'formVersion':1}
            return self.reply(200,state['pre']or{'ok':True})
        if path.startswith('/after-meeting-notes'):
            if post:
                if body.get('revision')!=PREVIEW_ROW['revision']:return self.reply(409,{'error':'Шаг изменился в другом окне.'})
                if 'stepText'in body:PREVIEW_ROW['stepText']=body['stepText']
                PREVIEW_ROW['revision']+=1
            return self.reply(200,[PREVIEW_ROW]if path=='/after-meeting-notes'else PREVIEW_ROW)
        data=payload(path)
        if path=='/questionnaires/'+STREAM:data={'pre':state['pre'],'post':None}
        if path=='/me/enrollment/access'and state['pre']:
            data['ai']={'canWrite':True,'reason':'program','message':'Учебный просмотр'};data['streams'][0]['canUseAi']=True
        if post and path.startswith('/ai/'):return self.reply(503,{'error':'В просмотре ответы AI не вызываются'})
        return self.reply(200,data)
    def do_POST(self):
        if self.path.startswith('/api/'):return self.api(True)
        self.send_error(405)
    def do_PUT(self):
        if self.path.startswith('/api/'):return self.api(True)
        self.send_error(405)
    def do_GET(self):
        path=urlsplit(self.path).path
        if path=='/favicon.ico':
            self.send_response(204);self.end_headers();return
        if path.startswith('/api/'):return self.api()
        if path=='/review':return self.reply(200,(Path(__file__).parent/'compare.html').read_bytes(),'text/html; charset=utf-8')
        if path in ['/','/index.html','/before/index.html']:
            html=((BASE if path.startswith('/before/')else ROOT)/'index.html').read_text(encoding='utf-8');body=(html if 'automation' in parse_qs(urlsplit(self.path).query) else html.replace('<head>','<head>'+SCRIPT,1)).encode();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(body)));self.send_header('Set-Cookie','ui_preview='+str(uuid.uuid4())+'; Path=/; SameSite=Lax');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body);return
        return super().do_GET()
if __name__=='__main__':
    print('Local synthetic preview: http://127.0.0.1:15353/review',flush=True)
    ThreadingHTTPServer(('127.0.0.1',15353),Handler).serve_forever()
