from pathlib import Path
import shutil,subprocess
R=Path(__file__).resolve().parents[2];C=R/'output/silk-launch-release'
docs=['project.md','База знаний/План.md','База знаний/Журнал обсуждений.md','База знаний/07 Приложение и экосистема.md','База знаний/08 Решения.md','app/PRODUCT.md','app/DESIGN.md','app/CLAUDE.md']
release='**J-APP-156 / T-APP-045 — J-APP-155 опубликован.** 20 октября2026 по прямому поручению Альмиры. Точный модуль обратной связи установлен на основном/резервном/recovery адресах; private backup прочитан,294HTTPS-хеша,66прежних UI и21группа сохранности/владельцев прошли. Оформление прежнее; backend/данные/AI/наличные не менялись. Обычная загрузка резерва отдельно, guard-проверка с отключённым HTTP/2. [Выпуск]({link}audit/feedback-release-JAPP156/RELEASE.md).'
local='**J-APP-157 / T-APP-046 / I-073 — удобство шкал анкет, готово локально.** По прямому уточнению Альмиры продолжать именно дизайн/удобство: на телефоне вместо10тесных кнопок два ряда по5, примерно50×48px вместо26×40px на320px; начальная/итоговая анкеты согласованы.72UI-группы и66прежних прошли. Только один CSS, значения/слова/JS/API прежние; не опубликовано. Следующий шаг — оценка видимого До/После. Полный актуальный остаток разделён на дефекты, непроверенные маршруты, решение A09 и телефонную приёмку. [Просмотр и результат]({link}audit/scale-touch-JAPP157/REPORT.md), [остаток аудита]({link}audit/audit-reconciliation-JAPP146/CURRENT-REMAINDER.md).'
for f in docs:
 for base in[R,C]:
  p=base/f;s=p.read_text(encoding='utf-8');link=''if f=='project.md'else'../';lines=s.splitlines()
  for i,line in enumerate(lines):
   if line.startswith('**J-APP-155 / T-APP-045 / I-072'):
    lines[i]='**J-APP-155 / T-APP-045 / I-072 — принят и опубликован J-APP-156.** Подробности прежнего локального этапа — [отчёт]('+link+'audit/feedback-module-JAPP155/REPORT.md).';break
  s='\n'.join(lines)+'\n';pos=s.index('\n')+1;p.write_text(s[:pos]+'\n'+local.format(link=link)+'\n\n'+release.format(link=link)+'\n'+s[pos:],encoding='utf-8')
for base in[R,C]:
 p=base/'База знаний/Идеи и развитие.md';s=p.read_text(encoding='utf-8');lines=s.splitlines()
 for i,line in enumerate(lines):
  if line.startswith('**I-072 / J-APP-155'):
   lines[i]='**I-072 / J-APP-155 → J-APP-156 / T-APP-045 — выделение обратной связи опубликовано.** По прямому поручению Альмиры20октября2026. Польза — внутренняя поддерживаемость; оформление прежнее. Условие возврата — конкретная ошибка/изменение формы. [Выпуск](../audit/feedback-release-JAPP156/RELEASE.md).';break
 s='\n'.join(lines)+'\n';pos=s.index('\n')+1;entry='\n**I-073 / J-APP-157 / T-APP-046 — удобные цифры анкет, реализовано локально.** Предложение ассистента20октября2026 по прямому поручению продолжить дизайн/удобство. Основание — исходный аудит и измерение26×40px. Польза — проще нажать нужное число. Два ряда на телефоне, прежние ответы; не опубликовано. Возврат — оценка Альмирой и решение о выпуске. [Результат](../audit/scale-touch-JAPP157/REPORT.md).\n'
 p.write_text(s[:pos]+entry+s[pos:],encoding='utf-8')
 # Record the user's explicit distinction; do not inflate a technical package into design.
 p=base/'База знаний/Журнал обсуждений.md';s=p.read_text(encoding='utf-8');pos=s.index('\n')+1
 p.write_text(s[:pos]+'\n**Уточнение Альмиры20октября2026:** после одинаковых экранов J155 спросила, в чём разница. Ассистент объяснил внутреннее разнесение без внешнего улучшения. Альмира разрешила выпуск и поручила следующий пакет «именно по дизайну и удобству», запросила остаток аудита. Не подавать внутреннюю чистку как визуальное изменение; показывать конкретное До/После или действие. J157 выбран по сохранившемуся замеру тесных кнопок; непроверенные экраны перечислены отдельно от доказанных дефектов.\n'+s[pos:],encoding='utf-8')
p=R/'audit/audit-reconciliation-JAPP146/STATUS.md';s=p.read_text(encoding='utf-8');pos=s.index('\n')+1;p.write_text(s[:pos]+'\n**Актуальный остаток после J-APP-156:** [CURRENT-REMAINDER.md](CURRENT-REMAINDER.md). J155 опубликован; следующий именно UI-пакет J157 со шкалами анкет локальный. Ниже сохранены исторические статусы, не текущая очередь невыполненных правок.\n'+s[pos:],encoding='utf-8');shutil.copy2(p,C/p.relative_to(R))
p=R/'audit/feedback-module-JAPP155/REPORT.md';s=p.read_text(encoding='utf-8');pos=s.index('\n')+1;p.write_text(s[:pos]+'\n**Обновление20октября2026: принят и опубликован J-APP-156.** [Выпуск](../feedback-release-JAPP156/RELEASE.md). Ниже — история локального этапа.\n'+s[pos:],encoding='utf-8');shutil.copy2(p,C/p.relative_to(R))
shutil.copy2(R/'audit/audit-reconciliation-JAPP146/CURRENT-REMAINDER.md',C/'audit/audit-reconciliation-JAPP146/CURRENT-REMAINDER.md')
for name in['feedback-release-JAPP156','scale-touch-JAPP157']:
 shutil.copytree(R/'audit'/name,C/'audit'/name,dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__','public'))
print('Updated current statuses, user design preference and finite original audit remainder; J157 runtime stays local')
