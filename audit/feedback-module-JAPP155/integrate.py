from pathlib import Path
import subprocess,json,hashlib,shutil
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent;C=R/'output/silk-launch-release';S=R/'output/feedback-module-JAPP155/source'
names=subprocess.check_output(['git','ls-files','-z','--cached','--others','--exclude-standard','--','app','backend','scripts','site','media'],cwd=R).decode().split('\0')
def hashes():return {f:hashlib.sha256((R/f).read_bytes()).hexdigest()for f in names if f and(R/f).is_file()}
before=hashes();assert(R/'app/js/app.js').read_bytes()==(C/'app/js/app.js').read_bytes(),'Unrelated root app.js change'
for f in ['app/js/app.js','app/js/feedback-form.js']:shutil.copy2(S/f,R/f)
p=R/'app/index.html';s=p.read_text(encoding='utf-8');needle='<script src="js/app.js?v=access-20260922"></script>';assert s.count(needle)==1
p.write_text(s.replace(needle,'<script src="js/feedback-form.js?v=JAPP155"></script>\n'+needle),encoding='utf-8')
after=hashes();changed=sorted(f for f in before if before[f]!=after[f]);assert changed==['app/index.html','app/js/app.js'],changed
assert(R/'app/js/feedback-form.js').read_bytes()==(S/'app/js/feedback-form.js').read_bytes()
(H/'root-integration.json').write_text(json.dumps({'changed':changed,'added':['app/js/feedback-form.js'],'otherRootSourcesUnchanged':len(before)-len(changed),'preservedUnrelatedIndexWording':True,'published':False},indent=2),encoding='utf-8')
print('PASS local integration; other root source files unchanged; published checkout untouched')
