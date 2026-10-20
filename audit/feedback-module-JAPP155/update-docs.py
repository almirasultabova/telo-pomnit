from pathlib import Path
import shutil
R=Path(__file__).resolve().parents[2];C=R/'output/silk-launch-release'
docs=['project.md','База знаний/План.md','База знаний/Журнал обсуждений.md','База знаний/07 Приложение и экосистема.md','База знаний/08 Решения.md','app/PRODUCT.md','app/DESIGN.md','app/CLAUDE.md']
release='**J-APP-154 / T-APP-044 — J-APP-153 опубликован.** 20 октября 2026 по прямому поручению Альмиры. Согласованный черновик правки личного шага установлен на основном/резервном/recovery адресах; backup проверен, 291 HTTPS-хеш и 64 группы опубликованного UI прошли. На резерве обычный браузерный переход дважды зависал до30с; сценарий прошёл с отключённым HTTP/2, сетевое ограничение не объявляется исправленным. Backend/данные/AI/наличные прежние. [Выпуск и откат]({link}audit/step-edit-release-JAPP154/RELEASE.md).'
local='**J-APP-155 / T-APP-045 / I-072 — отдельный модуль обратной связи готов локально.** Продолжение A19: 137 строк формы перенесены из app.js с прежними полями, видом, черновиками и отправкой. 28 парных групп Chromium/WebKit и 66 прежних групп прошли; рабочие записи/уведомления0. Не опубликовано; следующий шаг — оценка локального результата и отдельное поручение на выпуск. Полный A19, A09 и физическая приёмка открыты. [Результат и просмотр]({link}audit/feedback-module-JAPP155/REPORT.md).'
for f in docs:
 p=R/f;s=p.read_text(encoding='utf-8');link=''if f=='project.md'else'../'
 # Supersede the old local-only status, while leaving historical evidence below.
 lines=s.splitlines()
 for i,line in enumerate(lines):
  if line.startswith('**J-APP-153 / T-APP-044 / I-071'):
   lines[i]='**J-APP-153 / T-APP-044 / I-071 — локальный результат принят и опубликован выпуском J-APP-154.** Первоначальные проверки и сравнение сохранены в [отчёте]('+link+'audit/route-polish-JAPP153/REPORT.md).';break
 s='\n'.join(lines)+'\n';pos=s.index('\n')+1;s=s[:pos]+'\n'+local.format(link=link)+'\n\n'+release.format(link=link)+'\n'+s[pos:]
 p.write_text(s,encoding='utf-8');shutil.copy2(p,C/f)
p=R/'База знаний/Идеи и развитие.md';s=p.read_text(encoding='utf-8');pos=s.index('\n')+1
entry='\n**I-072 / J-APP-155 / T-APP-045 — отделить обратную связь от общего файла.** Источник: предложение ассистента20октября2026 в рамках порученного продолжения аудита A19. Польза — адресно менять форму с меньшим числом затрагиваемых экранов. Реализовано/проверено локально, не опубликовано; условие возврата — решение о выпуске. [Результат](../audit/feedback-module-JAPP155/REPORT.md).\n\n**I-071 / J-APP-153 → J-APP-154 — правка личного шага опубликована.** Прямое поручение Альмиры20октября2026; прежний местный результат принят. Польза — восстановление незавершённой правки без автоматической отправки. Условие возврата — обратная связь после использования. [Выпуск](../audit/step-edit-release-JAPP154/RELEASE.md).\n'
p.write_text(s[:pos]+entry+s[pos:],encoding='utf-8');shutil.copy2(p,C/p.relative_to(R))
p=R/'audit/audit-reconciliation-JAPP146/STATUS.md';s=p.read_text(encoding='utf-8');pos=s.index('\n')+1
entry='\n**20 октября 2026, J-APP-154/155:** сохранность правки личного шага опубликована [J-APP-154](../step-edit-release-JAPP154/RELEASE.md). Следующий адресный этап A19 — модуль обратной связи — выполнен и проверен только локально [J-APP-155](../feedback-module-JAPP155/REPORT.md); внешний вид прежний. Системный A19 целиком, продуктовый вопрос A09 и физическая/полная ролевая приёмка всё ещё открыты. Старые local-only записи ниже — история соответствующих этапов.\n'
p.write_text(s[:pos]+entry+s[pos:],encoding='utf-8');shutil.copy2(p,C/p.relative_to(R))
p=R/'audit/route-polish-JAPP153/REPORT.md';s=p.read_text(encoding='utf-8');pos=s.index('\n')+1;p.write_text(s[:pos]+'\n**Обновление20октября2026: принят и опубликован J-APP-154.** [Выпуск](../step-edit-release-JAPP154/RELEASE.md). Локальные статусы ниже описывают подготовку до этого поручения.\n'+s[pos:],encoding='utf-8');shutil.copy2(p,C/p.relative_to(R))
for name in ['step-edit-release-JAPP154','feedback-module-JAPP155']:
 shutil.copytree(R/'audit'/name,C/'audit'/name,dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__','public','crop-*','visual-difference.png'))
print('Updated project map, plan, decisions, journal, ideas, product/design/app rules and audit matrix; runtime J155 not copied to release checkout')
