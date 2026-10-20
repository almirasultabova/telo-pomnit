from pathlib import Path
import subprocess,shutil,json,hashlib
R=Path(__file__).resolve().parents[2];C=R/'output/silk-launch-release';S=R/'output/feedback-module-JAPP155/source';H=Path(__file__).parent
assert not S.exists(),'Do not overwrite an existing candidate'
files=subprocess.check_output(['git','-C',str(C),'ls-files','-z']).decode().split('\0')
for f in files:
 if f and (f.startswith(('app/','scripts/','site/','media/','backend/')) or f in ['package.json','package-lock.json']):
  src=C/f
  if src.is_file():dest=S/f;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dest)
p=S/'app/js/app.js';s=p.read_text(encoding='utf-8');start=s.index('let feedbackRating = 0;');block=s[start:]
assert block.rstrip().endswith('}'),'Expected feedback to be final section'
assert 'async function submitFeedback()'in block
module="// Feedback screen. Existing behavior and API payloads preserved (J-APP-155).\nwindow.FeedbackForm = (() => {\n"+block+"\nreturn { init: initFeedback, open: openFeedback, submit: submitFeedback, resetRating() { feedbackRating = 0; } };\n})();\n"
(S/'app/js/feedback-form.js').write_text(module,encoding='utf-8')
s=s[:start]+"function openFeedback() { return FeedbackForm.open(); }\nfunction submitFeedback() { return FeedbackForm.submit(); }\n"
s=s.replace('  initFeedback();','  FeedbackForm.init();').replace('    feedbackRating = 0; qStreamId', '    FeedbackForm.resetRating(); qStreamId')
p.write_text(s,encoding='utf-8')
p=S/'app/index.html';s=p.read_text(encoding='utf-8');needle='<script src="js/app.js?v=access-20260922"></script>';assert s.count(needle)==1
p.write_text(s.replace(needle,'<script src="js/feedback-form.js?v=JAPP155"></script>\n'+needle),encoding='utf-8')
subprocess.run(['node','scripts/build-static.mjs'],cwd=S,check=True)
changed=[]
for f in files:
 if f and (S/f).is_file() and (S/f).read_bytes()!=(C/f).read_bytes():changed.append(f)
assert sorted(changed)==['app/index.html','app/js/app.js'],changed
assert module.split('\n',2)[2].split('\nreturn { init:')[0]==block
(H/'baseline.json').write_text(json.dumps({'baseCommit':subprocess.check_output(['git','-C',str(C),'rev-parse','HEAD'],text=True).strip(),'changed':changed,'added':['app/js/feedback-form.js'],'movedLines':len(block.splitlines()),'logicExact':True,'cssChanged':False,'backendChanged':False},indent=2),encoding='utf-8')
print('PASS exact feedback block moved, two source integrations, zero CSS/backend edits')
