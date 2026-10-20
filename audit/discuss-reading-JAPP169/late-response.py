from pathlib import Path
import subprocess
R=Path(__file__).resolve().parents[2];S=R/'output/discuss-reading-JAPP169/source';p=S/'app/js/discussion-notes.js';s=p.read_text(encoding='utf-8')
def rep(a,b):
 global s
 assert s.count(a)==1,(a,s.count(a));s=s.replace(a,b)
rep('rows=data;listLoaded=true;list();','rows=data;listLoaded=true;if(currentScreen===\'discuss\')list();')
rep("catch{if(valid(s)){list('Не удалось загрузить записи.","catch{if(valid(s)&&currentScreen==='discuss'){list('Не удалось загрузить записи.")
rep("keepDraft();lockUI(false);editor(editing,true);status('Первая версия сохранена. Изменённый текст остался черновиком — проверьте его перед новым сохранением.');","keepDraft();lockUI(false);if(currentScreen==='discuss'){editor(editing,true);status('Первая версия сохранена. Изменённый текст остался черновиком — проверьте его перед новым сохранением.');}")
rep("else{draft=null;lockUI(false);detail(row.id,'Запись сохранена для вас.');}","else{draft=null;lockUI(false);if(currentScreen==='discuss')detail(row.id,'Запись сохранена для вас.');}")
rep("keepDraft();lockUI(false);editor(editing,true);const existing=el('details','dq-prompts');","keepDraft();lockUI(false);if(currentScreen!=='discuss')return;editor(editing,true);const existing=el('details','dq-prompts');")
rep("lockUI(false);detail(row.id,done?'Сохранено в разделе «Обсудили».':'Запись снова в списке к встрече.');","lockUI(false);if(currentScreen==='discuss')detail(row.id,done?'Сохранено в разделе «Обсудили».':'Запись снова в списке к встрече.');")
p.write_text(s,encoding='utf-8');subprocess.run(['node','scripts/build-static.mjs'],cwd=S,check=True)
