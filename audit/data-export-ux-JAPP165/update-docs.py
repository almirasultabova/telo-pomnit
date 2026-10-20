from pathlib import Path
import shutil,json
R=Path(__file__).resolve().parents[2];C=R/'output/silk-launch-release';H=Path(__file__).parent
assert sum(len(x['groups'])for x in json.loads((H/'ui-results.json').read_text(encoding='utf-8')))==50
assert sum(len(x['groups'])for x in json.loads((H/'edge-results.json').read_text(encoding='utf-8')))==14
assert json.loads((H/'preview-results.json').read_text(encoding='utf-8'))['passed']
docs=['project.md','База знаний/План.md','База знаний/Журнал обсуждений.md','База знаний/07 Приложение и экосистема.md','База знаний/08 Решения.md','app/PRODUCT.md','app/DESIGN.md','app/CLAUDE.md']
for base in[R,C]:
 for f in docs:
  p=base/f;s=p.read_text(encoding='utf-8');link=''if f=='project.md'else'../';lines=s.splitlines()
  for i,line in enumerate(lines):
   if line.startswith('**J-APP-163 / T-APP-049 / I-076'):
    lines[i]='**J-APP-163 / T-APP-049 / I-076 — принят и опубликован выпуском J-APP-164.** История локальной подготовки — [отчёт]('+link+'audit/habitual-ux-JAPP163/REPORT.md).';break
  s='\n'.join(lines)+'\n';pos=s.index('\n')+1
  local='**J-APP-165 / T-APP-050 / I-077 — сохранение дневника и личных копий, локально.** По поручению продолжить дизайн/удобство: видимая подготовка файла, готовый PDF рядом с действием, разные названия копий, возврат к исходной кнопке.50UI/14краевых групп и HTTP-просмотр прошли. Файлы/черновики/API/права/подтверждение удаления прежние; не опубликовано. Следующий шаг — локальная оценка. [Результат]('+link+'audit/data-export-ux-JAPP165/REPORT.md).'
  release='**J-APP-164 / T-APP-049 — J-APP-163 опубликован.** Прямое поручение Альмиры20октября2026. Точный кандидат опроса, проверенный backup,294HTTPS-хеша и70опубликованных UI-групп. Backend/данные/оплаты прежние, реальных отправок0. [Выпуск]('+link+'audit/habitual-release-JAPP164/RELEASE.md).'
  p.write_text(s[:pos]+'\n'+local+'\n\n'+release+'\n'+s[pos:],encoding='utf-8')
 p=base/'База знаний/Идеи и развитие.md';s=p.read_text(encoding='utf-8');lines=s.splitlines()
 for i,line in enumerate(lines):
  if line.startswith('**I-076 / J-APP-163'):
   lines[i]='**I-076 / J-APP-163 → J-APP-164 / T-APP-049 — опрос без потери места опубликован.** Прямое поручение Альмиры20октября2026. Следующий возврат — обратная связь на телефоне. [Выпуск](../audit/habitual-release-JAPP164/RELEASE.md).';break
 s='\n'.join(lines)+'\n';pos=s.index('\n')+1;entry='\n**I-077 / J-APP-165 / T-APP-050 — понятное сохранение личной копии, локально.** Идея ассистента20октября2026 в рамках поручения продолжить аудит. Польза — видно подготовку файла/следующий шаг, копии различимы, возврат сохраняет место. Основание — воспроизведённые состояния выгрузки; вопросы о данных и автоматическая отправка не менялись. Реализовано и проверено локально; условие возврата — оценка Альмирой. [Результат](../audit/data-export-ux-JAPP165/REPORT.md).\n';p.write_text(s[:pos]+entry+s[pos:],encoding='utf-8')
 p=base/'audit/audit-reconciliation-JAPP146/CURRENT-REMAINDER.md';s=p.read_text(encoding='utf-8').replace('после J-APP-162','после J-APP-164').replace('J-APP-163 локально исправляет','J-APP-163 опубликован выпуском J-APP-164; исправляет').replace('50UI/10краевых/44прежних групп прошли. Не опубликовано, физический Telegram отдельно.','50UI/10краевых/44прежних локальных и70опубликованных групп прошли. Физический Telegram отдельно.').replace('длинный результат пройдены локально J163','длинный результат опубликованы J164')
 entry='**Данные/копии/PDF, раздел6/14.** J-APP-165 локально исправляет непонятное ожидание/готовность файла, общий заголовок разных копий и потерю кнопки при возврате; длинный текст доступен клавиатурой.50UI/14краевых групп и HTTP-просмотр прошли, формат/содержимое/права прежние. Не опубликовано; реальное сохранение файла в Telegram отдельно. [Результат](../data-export-ux-JAPP165/REPORT.md).\n\n'
 s=s.replace('## Что ещё требуется проверить по дизайну и удобству',entry+'## Что ещё требуется проверить по дизайну и удобству').replace('данных/экспорта, всего профиля','остальных состояний данных/экспорта (подготовка/просмотр/возврат PDF/JSON пройдены локально J165), всего профиля').replace('Текущий локальный пакет дизайна — J163;','Текущий локальный пакет дизайна — J165;');p.write_text(s,encoding='utf-8')
 p=base/'audit/audit-reconciliation-JAPP146/STATUS.md';s=p.read_text(encoding='utf-8');pos=s.index('\n')+1;p.write_text(s[:pos]+'\n**После J-APP-164:** опрос «Привычная реакция» опубликован. Следующий J165 — видимая подготовка/готовность копий и возврат — готов локально, не опубликован. [Остаток](CURRENT-REMAINDER.md), [результат](../data-export-ux-JAPP165/REPORT.md). Ниже исторические записи.\n'+s[pos:],encoding='utf-8')
 p=base/'audit/habitual-ux-JAPP163/REPORT.md';s=p.read_text(encoding='utf-8');pos=s.index('\n')+1;p.write_text(s[:pos]+'\n**Обновление20октября2026: принят и опубликован выпуском J-APP-164.** [Выпуск](../habitual-release-JAPP164/RELEASE.md). Ниже — история локальной подготовки.\n'+s[pos:],encoding='utf-8')
for folder in['habitual-release-JAPP164','data-export-ux-JAPP165']:
 shutil.copytree(R/'audit'/folder,C/'audit'/folder,dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__','public'))
print('Recorded accepted J163 publication, local J165 and remaining audit separately; no J165 runtime copied to release')
