from pathlib import Path
import importlib.util,sys
H=Path(__file__).resolve().parent;R=H.parents[1];sys.path.insert(0,str(R/'audit/route-polish-JAPP153'))
spec=importlib.util.spec_from_file_location('scale_preview_base',R/'audit/route-polish-JAPP153/preview.py');base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
base.ROOT=R/'output/scale-touch-JAPP157/source/output/app'
base.SCRIPT=base.SCRIPT.replace("openQuestionnaire();qAnswers={};for(const block of Q_BLOCKS)for(const f of block.fields)if(f.required)qAnswers[f.id]=f.type==='radio'?f.options[0]:f.type==='checkbox'?[f.options[0]]:f.type==='scale'?5:'Учебный ответ';qStep=Q_BLOCKS.length-1;renderQBlock();focusQuestionnaireBlock();","openQuestionnaire();qStep=Q_BLOCKS.findIndex(b=>b.fields.some(f=>f.type==='scale'));renderQBlock();focusQuestionnaireBlock();")
class Handler(base.Handler):
 def do_GET(self):
  if base.urlsplit(self.path).path=='/review':return self.reply(200,(H/'compare.html').read_bytes(),'text/html; charset=utf-8')
  return super().do_GET()
if __name__=='__main__':
 print('Local synthetic preview: http://127.0.0.1:15357/review',flush=True)
 base.ThreadingHTTPServer(('127.0.0.1',15357),Handler).serve_forever()
