from pathlib import Path
import subprocess,shutil,json
R=Path(__file__).resolve().parents[2];C=R/'output/silk-launch-release';S=R/'output/scale-touch-JAPP157/source';H=Path(__file__).parent
assert not S.exists(),'Candidate already exists'
files=subprocess.check_output(['git','-C',str(C),'ls-files','-z']).decode().split('\0')
for f in files:
 if f and f.startswith(('app/','scripts/','site/','media/','backend/'))and(C/f).is_file():
  dest=S/f;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(C/f,dest)
p=S/'app/css/form-layout.css';s=p.read_text(encoding='utf-8')
a=":is(#screen-questionnaire,#screen-post-questionnaire) .q-scale{grid-template-columns:repeat(10,minmax(0,1fr));gap:3px}"
b=":is(#screen-questionnaire,#screen-post-questionnaire) .q-scale-btn{height:40px;min-width:0;padding:0;border-radius:8px;font-size:12px;line-height:1;box-sizing:border-box}"
assert s.count(a)==1 and s.count(b)==1
s=s.replace(a,":is(#screen-questionnaire,#screen-post-questionnaire) .q-scale{grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}")
s=s.replace(b,":is(#screen-questionnaire,#screen-post-questionnaire) .q-scale-btn{height:48px;min-width:0;padding:0;border-radius:12px;font-size:15px;line-height:1;box-sizing:border-box}\n@media(min-width:600px){:is(#screen-questionnaire,#screen-post-questionnaire) .q-scale{grid-template-columns:repeat(10,minmax(0,1fr))}}")
p.write_text(s,encoding='utf-8');subprocess.run(['node','scripts/build-static.mjs'],cwd=S,check=True)
changed=[f for f in files if f and(S/f).is_file()and(S/f).read_bytes()!=(C/f).read_bytes()]
assert changed==['app/css/form-layout.css'],changed
(H/'baseline.json').write_text(json.dumps({'baseCommit':subprocess.check_output(['git','-C',str(C),'rev-parse','HEAD'],text=True).strip(),'sourceChanged':changed,'jsChanged':False,'copyChanged':False,'backendChanged':False},indent=2),encoding='utf-8')
print('PASS one existing stylesheet, no behavior/copy/API edits')
