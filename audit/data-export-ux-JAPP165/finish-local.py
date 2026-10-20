from pathlib import Path
import subprocess
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent;S=R/'output/data-export-ux-JAPP165/source'
for p in[H/'prepare.py',S/'app/js/app.js']:
 s=p.read_text(encoding='utf-8').replace('Это копия записей и черновиков с этого устройства, ожидающих отправки. Сохранение файла не отправляет их.','Здесь записи, ожидающие отправки, и сохранённые черновики с этого устройства. Сохранение файла ничего не отправляет.')
 if p.name=='app.js':s=s.replace("screen.querySelector('pre').textContent=contents; document.body.append(screen);","screen.querySelector('pre').textContent=contents; screen.querySelector('pre').tabIndex=0; screen.querySelector('pre').setAttribute('role','region'); screen.querySelector('pre').setAttribute('aria-label','Содержимое файла'); document.body.append(screen);")
 else:s=s.replace("screen.querySelector('pre').textContent=contents; document.body.append(screen);\")","screen.querySelector('pre').textContent=contents; screen.querySelector('pre').tabIndex=0; screen.querySelector('pre').setAttribute('role','region'); screen.querySelector('pre').setAttribute('aria-label','Содержимое файла'); document.body.append(screen);\")")
 p.write_text(s,encoding='utf-8')
rule='\n#screen-data-export-preview .private-preview-content:focus-visible{outline:2px solid var(--color-action);outline-offset:3px}\n'
p=S/'app/css/ux-personal.css';p.write_text(p.read_text(encoding='utf-8')+rule,encoding='utf-8')
p=H/'prepare.py';s=p.read_text(encoding='utf-8').replace('#screen-data-rights #data-rights-status:focus{outline:none}', '#screen-data-rights #data-rights-status:focus{outline:none}'+rule.rstrip());p.write_text(s,encoding='utf-8')
subprocess.run(['node','scripts/build-static.mjs'],cwd=S,check=True)
