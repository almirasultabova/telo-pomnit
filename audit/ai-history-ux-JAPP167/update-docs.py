from pathlib import Path
import shutil,json
R=Path(__file__).resolve().parents[2];C=R/'output/silk-launch-release';H=Path(__file__).parent
assert sum(len(x['groups'])for x in json.loads((H/'ui-results.json').read_text(encoding='utf-8')))==40
assert sum(len(x['groups'])for x in json.loads((H/'edge-results.json').read_text(encoding='utf-8')))==14
assert json.loads((H/'preview-results.json').read_text(encoding='utf-8'))['passed']
docs=['project.md','База знаний/План.md','База знаний/Журнал обсуждений.md','База знаний/07 Приложение и экосистема.md','База знаний/08 Решения.md','app/PRODUCT.md','app/DESIGN.md','app/CLAUDE.md']
for base in[R,C]:
 for f in docs:
  p=base/f;s=p.read_text(encoding='utf-8');link=''if f=='project.md'else'../';lines=s.splitlines()
  for i,line in enumerate(lines):
   if line.startswith('**J-APP-165 / T-APP-050 / I-077'):
    lines[i]='**J-APP-165 / T-APP-050 / I-077 — принят и опубликован выпуском J-APP-166.** История локальной подготовки — [отчёт]('+link+'audit/data-export-ux-JAPP165/REPORT.md).';break
  s='\n'.join(lines)+'\n';pos=s.index('\n')+1
  local='**J-APP-167 / T-APP-051 / I-078 — история разговоров AI, локально.** По поручению продолжить дизайн/удобство: видимая загрузка, пауза отправки на время выбора, название соответствует реальному диалогу после сбоя, явный повтор и отдельные черновики.40UI/14краевых групп и HTTP-просмотр прошли; provider/backend/модель прежние, отправок0. Не опубликовано; следующий шаг — локальная оценка. [Результат]('+link+'audit/ai-history-ux-JAPP167/REPORT.md).'
  release='**J-APP-166 / T-APP-050 — J-APP-165 опубликован.** Альмира согласилась «да давай» на перенос проверенного кандидата и продолжение аудита. Backup,294HTTPS-хеша и74опубликованные UI-группы проверены; backend/файлы/данные/оплаты прежние. [Выпуск]('+link+'audit/data-export-release-JAPP166/RELEASE.md).'
  p.write_text(s[:pos]+'\n'+local+'\n\n'+release+'\n'+s[pos:],encoding='utf-8')
 p=base/'База знаний/Идеи и развитие.md';s=p.read_text(encoding='utf-8');lines=s.splitlines()
 for i,line in enumerate(lines):
  if line.startswith('**I-077 / J-APP-165'):
   lines[i]='**I-077 / J-APP-165 → J-APP-166 / T-APP-050 — понятное сохранение копий опубликовано.**20октября2026 по согласию Альмиры. Следующий возврат — физическая проверка сохранения файла на телефоне. [Выпуск](../audit/data-export-release-JAPP166/RELEASE.md).';break
 s='\n'.join(lines)+'\n';pos=s.index('\n')+1;entry='\n**I-078 / J-APP-167 / T-APP-051 — история AI без путаницы разговоров, локально.** Идея ассистента20октября2026 в рамках поручения продолжить аудит. Основание — подтверждённое расхождение выбранного названия/открытых сообщений после сбоя и доступная отправка в ожидании. Польза — понятный текущий диалог/повтор; черновики сохранены. Проверено локально, не опубликовано; условие возврата — оценка Альмирой. [Результат](../audit/ai-history-ux-JAPP167/REPORT.md).\n';p.write_text(s[:pos]+entry+s[pos:],encoding='utf-8')
 p=base/'audit/audit-reconciliation-JAPP146/CURRENT-REMAINDER.md';s=p.read_text(encoding='utf-8').replace('после J-APP-164','после J-APP-166').replace('J-APP-165 локально исправляет','J-APP-165 опубликован выпуском J-APP-166; исправляет').replace('50UI/14краевых групп и HTTP-просмотр прошли, формат/содержимое/права прежние. Не опубликовано;','50UI/14краевых локальных и74опубликованные группы прошли, формат/содержимое/права прежние;').replace('подготовка/просмотр/возврат PDF/JSON пройдены локально J165','подготовка/просмотр/возврат PDF/JSON опубликованы J166')
 entry='**История AI, раздел6/14.** J167 локально устраняет расхождение выбранного и открытого диалогов после ошибки и паузу отправки при переключении; добавлены загрузка/пусто/повтор, видимые в шапке, сохранение черновиков/старого чтения и изоляция поздних ответов.40UI/14краевых групп и HTTP-просмотр прошли. Не опубликовано; provider не вызывается. [Результат](../ai-history-ux-JAPP167/REPORT.md).\n\n'
 s=s.replace('## Что ещё требуется проверить по дизайну и удобству',entry+'## Что ещё требуется проверить по дизайну и удобству').replace('выбор дневника/точный контекст проверен и опубликован J160','выбор дневника/точный контекст опубликован J160; чтение истории локально пройдено J167').replace('Текущий локальный пакет дизайна — J165;','Текущий локальный пакет дизайна — J167;');p.write_text(s,encoding='utf-8')
 p=base/'audit/audit-reconciliation-JAPP146/STATUS.md';s=p.read_text(encoding='utf-8');pos=s.index('\n')+1;p.write_text(s[:pos]+'\n**После J-APP-166:** понятное сохранение PDF/копий опубликовано. Следующий J167 — загрузка/ошибка/повтор истории AI и текущий разговор — готов локально, не опубликован. [Остаток](CURRENT-REMAINDER.md), [результат](../ai-history-ux-JAPP167/REPORT.md). Ниже исторические записи.\n'+s[pos:],encoding='utf-8')
 p=base/'audit/data-export-ux-JAPP165/REPORT.md';s=p.read_text(encoding='utf-8');pos=s.index('\n')+1;p.write_text(s[:pos]+'\n**Обновление20октября2026: принят и опубликован выпуском J-APP-166.** [Выпуск](../data-export-release-JAPP166/RELEASE.md). Ниже — история локальной подготовки.\n'+s[pos:],encoding='utf-8')
for folder in['data-export-release-JAPP166','ai-history-ux-JAPP167']:
 shutil.copytree(R/'audit'/folder,C/'audit'/folder,dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__','public'))
print('Recorded published J165 and local-only J167; original audit remains open')
