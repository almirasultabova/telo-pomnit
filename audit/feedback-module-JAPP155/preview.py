from pathlib import Path
import importlib.util,sys
H=Path(__file__).resolve().parent;R=H.parents[1]
sys.path.insert(0,str(R/'audit/route-polish-JAPP153'))
spec=importlib.util.spec_from_file_location('route_preview153',R/'audit/route-polish-JAPP153/preview.py')
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
base.ROOT=R/'output/feedback-module-JAPP155/source/output/app'
class Handler(base.Handler):
 def api(self,post=False):
  # Iframes share a browser cookie. Keep their synthetic send attempts separate.
  cookie=base.SimpleCookie(self.headers.get('Cookie',''));key=cookie['ui_preview'].value if 'ui_preview'in cookie else 'local'
  key+='-before'if '/before/'in self.headers.get('Referer','')else '-after'
  if self.headers.get('Cookie')is not None:self.headers.replace_header('Cookie','ui_preview='+key)
  else:self.headers['Cookie']='ui_preview='+key
  return super().api(post)
 def do_GET(self):
  if base.urlsplit(self.path).path=='/review':return self.reply(200,(H/'compare.html').read_bytes(),'text/html; charset=utf-8')
  return super().do_GET()
if __name__=='__main__':
 print('Local synthetic preview: http://127.0.0.1:15355/review',flush=True)
 base.ThreadingHTTPServer(('127.0.0.1',15355),Handler).serve_forever()
