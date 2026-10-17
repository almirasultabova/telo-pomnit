from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse,unquote
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'output/contrast-JAPP070';REL=ROOT/'output/silk-launch-release'
class Handler(SimpleHTTPRequestHandler):
 def translate_path(self,path):
  name=unquote(urlparse(path).path)
  if name.startswith('/media/app/') or name.startswith('/media/shared/'): base=REL
  else:base=OUT
  candidate=(base/name.lstrip('/')).resolve()
  if not candidate.is_relative_to(base.resolve()):return str(OUT/'404')
  return str(candidate)
 def end_headers(self):
  self.send_header('Cache-Control','no-store')
  self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; media-src 'none'; connect-src 'none'; frame-src 'self'; form-action 'none'")
  super().end_headers()
 def log_message(self,*args):pass
print('Contrast-only preview http://127.0.0.1:8917/ — synthetic fixtures, no external connections',flush=True)
ThreadingHTTPServer(('127.0.0.1',8917),Handler).serve_forever()
