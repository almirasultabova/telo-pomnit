from pathlib import Path
import shutil,hashlib,json
R=Path(__file__).resolve().parents[2];C=R/'output/silk-launch-release';P=R/'output/word-spacing-JAPP140';H=Path(__file__).parent
pairs=[('Отметить<br>состояние','Отметить состояние'),('Заметить<br>реакцию','Заметить реакцию')]
def fix(text):
 for old,new in pairs:
  assert text.count(old)==1,old
  text=text.replace(old,new)
 return text
shutil.copytree(C/'output/app',P/'app',dirs_exist_ok=True)
(P/'app/index.html').write_text(fix((C/'output/app/index.html').read_text(encoding='utf-8')),encoding='utf-8',newline='\n')
(P/'source/app').mkdir(parents=True,exist_ok=True)
(P/'source/app/index.html').write_text(fix((C/'app/index.html').read_text(encoding='utf-8')),encoding='utf-8',newline='\n')
(H/'manifest.json').write_text(json.dumps({'changed':['app/index.html'],'rootHTMLHash':hashlib.sha256((R/'app/index.html').read_bytes()).hexdigest(),'sourceHash':hashlib.sha256((P/'source/app/index.html').read_bytes()).hexdigest(),'previewHash':hashlib.sha256((P/'app/index.html').read_bytes()).hexdigest(),'published':False},indent=2),encoding='utf-8')
print('Prepared two title-space replacements in isolated current-release preview; no publication.')
