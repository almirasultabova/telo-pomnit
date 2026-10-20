from pathlib import Path
import json
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent
note='**Уточнение после замечания Альмиры о двух кнопках,20октября2026.** Постоянная «Обновить доступ и историю» удалена из локального кандидата: история обновляется при открытии экрана. При сбое остаётся одна «Попробовать ещё раз», после успеха она скрыта. Светлая кнопка без внешней двойной обводки; для клавиатуры один внутренний контур. Проверены320/390px Chromium/WebKit и26px текст без выхода за границы.40UI/14краевых и4новых браузерных случая прошли. Не опубликовано. [Проверка](control-results.json).'
p=H/'REPORT.md';s=p.read_text(encoding='utf-8');pos=s.index('\n')+1;s=s[:pos]+'\n'+note+'\n'+s[pos:];s=s.replace('Только app/js/app.js и app/css/ux-personal.css;345других корневых исходников сохранены.','Только app/js/app.js, app/css/ux-personal.css и точное удаление одной кнопки из app/index.html;344других корневых исходника сохранены.');p.write_text(s,encoding='utf-8')
p=H/'BRIEF.md';s=p.read_text(encoding='utf-8');pos=s.index('\n')+1;p.write_text(s[:pos]+'\n**Уточнение:** Альмира не приняла вид повтора/выход текста за кнопку и спросила о необходимости двух действий. Локальная правка оставляет только одно действие при ошибке; постоянное ручное обновление убрано. Это доработка J167, не новый пакет и не разрешение публикации.\n'+s[pos:],encoding='utf-8')
for filename in['verification.json','baseline.json']:
 p=H/filename;data=json.loads(p.read_text(encoding='utf-8'));data['sourceChanges']=['app/css/ux-personal.css','app/index.html','app/js/app.js']
 if filename=='verification.json':data['otherRootSourcesUnchanged']=344;data['controlsRevisionPassed']=True
 p.write_text(json.dumps(data,indent=2),encoding='utf-8')
docs=['project.md','База знаний/План.md','База знаний/Журнал обсуждений.md','База знаний/07 Приложение и экосистема.md','База знаний/08 Решения.md','app/PRODUCT.md','app/DESIGN.md','app/CLAUDE.md']
for f in docs:
 p=R/f;s=p.read_text(encoding='utf-8');lines=s.splitlines();link=''if f=='project.md'else'../'
 for i,line in enumerate(lines):
  if line.startswith('**J-APP-167 / T-APP-051 / I-078'):
   lines[i]=line+' **Доработка по замечанию Альмиры:** постоянная кнопка обновления убрана; одна светлая «Попробовать ещё раз» только при ошибке, без двойного контура/выхода текста. Проверено локально; публикации нет.';break
 p.write_text('\n'.join(lines)+'\n',encoding='utf-8')
p=R/'База знаний/Идеи и развитие.md';s=p.read_text(encoding='utf-8');lines=s.splitlines()
for i,line in enumerate(lines):
 if line.startswith('**I-078 / J-APP-167'):
  lines[i]=line+' После вопроса Альмиры о необходимости кнопок локально оставлено одно действие только при ошибке; внешний вид и перенос исправлены, оценка владельцем ожидается.';break
p.write_text('\n'.join(lines)+'\n',encoding='utf-8')
print('Recorded owner feedback and local revision under existing J167/T051/I078; no publish or commit')
