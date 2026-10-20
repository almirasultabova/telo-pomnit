from pathlib import Path
import subprocess
R=Path(__file__).resolve().parents[2];C=R/'output/silk-launch-release'
context={'__file__':__file__};src=(Path(__file__).parent/'update-docs.py').read_text(encoding='utf-8');exec(src.split('for f in docs:')[0],context)
for f in context['docs']:
 s=subprocess.check_output(['git','-C',str(C),'show','HEAD:'+f]).decode('utf-8');link=''if f=='project.md'else'../';pos=s.index('\n')+1
 s=s[:pos]+'\n'+context['local'].format(link=link)+'\n\n'+context['release'].format(link=link)+'\n'+s[pos:]
 (C/f).write_text(s,encoding='utf-8')
f='База знаний/Идеи и развитие.md';s=subprocess.check_output(['git','-C',str(C),'show','HEAD:'+f]).decode('utf-8');pos=s.index('\n')+1
entry='\n**I-072 / J-APP-155 / T-APP-045 — отдельный модуль обратной связи, локально.** Предложение ассистента20октября2026 в рамках порученного продолжения A19. Польза — адресные дальнейшие изменения формы. Не опубликовано; возврат после решения о выпуске. [Результат](../audit/feedback-module-JAPP155/REPORT.md).\n\n**I-071 / J-APP-153 → J-APP-154 — правка личного шага опубликована.** По прямому поручению Альмиры20октября2026. Черновик восстанавливается, отправка только явно; условие возврата — обратная связь. [Выпуск](../audit/step-edit-release-JAPP154/RELEASE.md).\n'
(C/f).write_text(s[:pos]+entry+s[pos:],encoding='utf-8')
print('Release checkout contains only task-specific documentation additions; unrelated root history preserved locally')
