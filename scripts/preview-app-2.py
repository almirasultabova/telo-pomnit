"""Isolated stage1 browser preview. Loopback only, synthetic API, no proxy/backend.
Run: python scripts/preview-app-2.py
Build first with node scripts/build-static.mjs if sources changed.
"""
import json, mimetypes, uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, unquote
ROOT=Path(__file__).resolve().parents[1]/'output/app'
USER={'id':'local-preview-stage1','name':'Учебная участница','consentGivenAt':'2026-10-10T00:00:00Z'}
ROWS={'diary':[],'triggers':[],'checkins':[]}
RESULTS={'habitual':None,'diagnostic':None}
CSP="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
class Handler(BaseHTTPRequestHandler):
 def setup(self):
  super().setup()
  # Browser preconnections must not block requests from other sockets.
  self.connection.settimeout(10)
 def reply(self,status,value,content_type='application/json; charset=utf-8'):
  if not isinstance(value,bytes):value=json.dumps(value,ensure_ascii=False).encode('utf-8')
  self.send_response(status);self.send_header('Content-Type',content_type);self.send_header('Content-Length',str(len(value)));self.send_header('Cache-Control','no-store');self.send_header('Content-Security-Policy',CSP);self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(value)
 def handle_api(self):
  path=urlsplit(self.path).path.removeprefix('/api');method=self.command
  try:body=json.loads(self.rfile.read(int(self.headers.get('Content-Length','0'))) or b'{}')
  except (ValueError,TypeError):self.reply(400,{'error':'Неверный учебный запрос'});return
  if path=='/auth/telegram':self.reply(200,{'token':'local-preview-only','user':USER});return
  if path=='/me':self.reply(200,USER);return
  if path=='/me/enrollment/access':self.reply(200,{'ai':{'canWrite':False,'message':'Учебный просмотр: AI не подключён'},'streams':[]});return
  for kind,rows in ROWS.items():
   if path=='/'+kind:
    if method=='GET':self.reply(200,rows);return
    if method=='POST':
     key=body.get('clientId') or body.get('dayKey')
     row=next((r for r in rows if key and key in [r.get('clientId'),r.get('dayKey')]),None)
     if row is None:row={'id':'preview-'+str(uuid.uuid4()),'createdAt':datetime.now(timezone.utc).isoformat()};rows.append(row)
     row.update(body);self.reply(200,row);return
  for kind in RESULTS:
   if path=='/'+kind+'/result':
    if method=='POST':RESULTS[kind]={**body,'date':datetime.now(timezone.utc).isoformat()}
    self.reply(200,RESULTS[kind]);return
  if path=='/ai/sessions':self.reply(200,[]);return
  if path=='/checkins/today':self.reply(200,ROWS['checkins'][-1] if ROWS['checkins'] else None);return
  if path=='/feedback' and method=='POST':self.reply(200,{'success':True});return
  self.reply(501,{'error':'Это локальный просмотр. Действие требует настоящего сервера и здесь не выполняется.'})
 def do_GET(self):
  if self.path.startswith('/api/'):self.handle_api();return
  if urlsplit(self.path).path.startswith('/review/'):
   # Only synthetic screenshots and their gallery; never expose baseline ZIPs.
   review_path=unquote(urlsplit(self.path).path)
   prefix,folder=next(((prefix,folder) for prefix,folder in [('/review/nav-cloud/','app-2-nav-cloud'),('/review/nav/','app-2-nav'),('/review/pair-v2/','app-2-pair-v2'),('/review/stream/','app-2-stream'),('/review/pair/','app-2-pair'),('/review/action/','app-2-action'),('/review/top/','app-2-top')] if review_path.startswith(prefix)),('/review/','app-2-home'))
   review_root=ROOT.parent/folder
   rel=review_path.removeprefix(prefix) or 'index.html'
   target=(review_root/rel).resolve()
   try:target.relative_to(review_root.resolve())
   except ValueError:self.reply(404,{});return
   allowed=rel in ['index.html','reference.png'] or rel.startswith('screens/') and rel.endswith('.png')
   if not allowed or not target.is_file() or target.is_symlink():self.reply(404,{});return
   self.reply(200,target.read_bytes(),mimetypes.guess_type(str(target))[0] or 'application/octet-stream');return
  rel=unquote(urlsplit(self.path).path).lstrip('/') or 'index.html'
  target=(ROOT/rel).resolve()
  try:target.relative_to(ROOT.resolve())
  except ValueError:self.reply(404,{});return
  allowed=rel=='index.html' or rel.startswith(('css/','js/','media/app/','media/shared/'))
  if not allowed or not target.is_file() or target.is_symlink():self.reply(404,{});return
  data=target.read_bytes()
  if rel=='index.html':
   text=data.decode('utf-8')
   text=text.replace('<head>','<head><script>window.TelegramWebviewProxy={postEvent:(type,data)=>{if(type===\"web_app_setup_back_button\"){const b=document.getElementById(\"preview-back\");if(b)b.disabled=!JSON.parse(data).is_visible;}}};</script>',1)
   toolbar='<div id="preview-toolbar"><button id="preview-back" disabled type="button" onclick="Telegram.WebView.receiveEvent(\"back_button_pressed\")">← Назад</button><span>Учебный просмотр · данные локальные</span></div>'
   # Event handler uses a quoted attribute to keep the HTML valid.
   toolbar=toolbar.replace('onclick="Telegram.WebView.receiveEvent(\"back_button_pressed\")"',"onclick=\"Telegram.WebView.receiveEvent('back_button_pressed')\"")
   text=text.replace('<body>','<body>'+toolbar,1)
   text=text.replace('</head>',"<style>#preview-toolbar{height:36px;display:flex;align-items:center;justify-content:center;gap:12px;background:#DDE4D8;font:11px/1.4 sans-serif;color:#2A4A38}#preview-toolbar button{font:inherit;padding:6px;min-height:32px;color:inherit}#preview-toolbar button:disabled{opacity:.4}#app{height:calc(100% - 36px)}</style></head>",1)
   data=text.encode('utf-8')
  self.reply(200,data,mimetypes.guess_type(str(target))[0] or 'application/octet-stream')
 do_POST=handle_api
 do_PATCH=handle_api
 do_DELETE=handle_api
if __name__=='__main__':
 if not (ROOT/'index.html').is_file():raise SystemExit('Run node scripts/build-static.mjs first')
 print('Preview: http://127.0.0.1:8770/#tgWebAppPlatform=ios&tgWebAppVersion=8.0',flush=True)
 print('Synthetic data only. No backend, payments, AI or external API requests.',flush=True)
 ThreadingHTTPServer(('127.0.0.1',8770),Handler).serve_forever()
