from pathlib import Path
import shutil
R=Path(__file__).resolve().parents[2];C=R/'output/silk-launch-release'
docs=['project.md','База знаний/План.md','База знаний/Журнал обсуждений.md','База знаний/07 Приложение и экосистема.md','База знаний/08 Решения.md','app/PRODUCT.md','app/DESIGN.md','app/CLAUDE.md']
for base in[R,C]:
 for f in docs:
  p=base/f;s=p.read_text(encoding='utf-8');link=''if f=='project.md'else'../';lines=s.splitlines()
  for i,line in enumerate(lines):
   if line.startswith('**J-APP-161 / T-APP-048 / I-075'):
    lines[i]='**J-APP-161 / T-APP-048 / I-075 — принят и опубликован J-APP-162.** История подготовки — [отчёт]('+link+'audit/discuss-ux-JAPP161/REPORT.md).';break
  s='\n'.join(lines)+'\n';pos=s.index('\n')+1
  local='**J-APP-163 / T-APP-049 / I-076 — опрос «Привычная реакция», локально.** По поручению продолжить дизайн/удобство: сохранён фокус выбранного ответа; фоновые данные не закрывают опрос; список16ответов получил верхний возврат/разделители, возврат сохраняет раскрытый результат/место/фокус.50UI/10краевых и44прежних синтетических проверки прошли; вопросы/расчёт/черновики/API/backend прежние. Не опубликовано; следующий шаг — оценка локального просмотра. [Результат]('+link+'audit/habitual-ux-JAPP163/REPORT.md).'
  release='**J-APP-162 / T-APP-048 — J-APP-161 опубликован.**20октября2026 по прямому поручению Альмиры. Точный кандидат фрагмента «К разбору», прочитанный private backup,294HTTPS-хеша/84опубликованные UI-группы проверены; Vercelca1e3ff READY. Backend/права/данные/оплаты прежние, реальных отправок0. [Выпуск]('+link+'audit/discuss-release-JAPP162/RELEASE.md).'
  p.write_text(s[:pos]+'\n'+local+'\n\n'+release+'\n'+s[pos:],encoding='utf-8')
 p=base/'База знаний/Идеи и развитие.md';s=p.read_text(encoding='utf-8');lines=s.splitlines()
 for i,line in enumerate(lines):
  if line.startswith('**I-075 / J-APP-161'):
   lines[i]='**I-075 / J-APP-161 → J-APP-162 / T-APP-048 — удобный длинный фрагмент «К разбору» опубликован.** Прямое поручение Альмиры20октября2026. Полный текст/черновик прежние; краткое выделение и возврат сохраняют место. Условие возврата — обратная связь на телефоне. [Выпуск](../audit/discuss-release-JAPP162/RELEASE.md).';break
 s='\n'.join(lines)+'\n';pos=s.index('\n')+1;entry='\n**I-076 / J-APP-163 / T-APP-049 — опрос без потери места, локально.** Предложение ассистента20октября2026 в рамках поручения продолжить дизайн/удобство. Основание — потерянный после Enter фокус, возврат только после16ответов и фоновая перерисовка. Польза — понятный выбор, сохранённый маршрут/черновик; вопросы и интерпретации прежние. Реализовано локально, не опубликовано; возврат после оценки Альмирой. [Результат](../audit/habitual-ux-JAPP163/REPORT.md).\n';p.write_text(s[:pos]+entry+s[pos:],encoding='utf-8')
for base in[R,C]:
 p=base/'audit/audit-reconciliation-JAPP146/CURRENT-REMAINDER.md';s=p.read_text(encoding='utf-8').replace('после J-APP-160','после J-APP-162')
 s=s.replace('J-APP-161 исправляет локально:','J-APP-161 опубликован выпуском J-APP-162:').replace('55UI/12краевых групп прошли; пока не опубликовано.','55UI/12краевых локальных и84опубликованные группы прошли.').replace('фрагмент проверен локально J161','фрагмент опубликован J162')
 entry='**Опрос «Привычная реакция», раздел6/14.** J-APP-163 локально исправляет потерю фокуса ответа/фоновой перерисовки и возврат только снизу16ответов. Верхний/нижний/nativeBack сохраняют раскрытый результат/позицию/фокус; вопросы/scoring/API прежние.50UI/10краевых/44прежних групп прошли. Не опубликовано, физический Telegram отдельно. [Результат](../habitual-ux-JAPP163/REPORT.md).\n\n'
 s=s.replace('## Что ещё требуется проверить по дизайну и удобству',entry+'## Что ещё требуется проверить по дизайну и удобству').replace('Ещё не подтверждён единый завершающий проход опроса «Привычная реакция» и длинного результата, остальных сценариев AI','Опрос «Привычная реакция» и длинный результат пройдены локально J163; ещё требуется завершающий проход остальных сценариев AI').replace('Следующее локальное изменение дизайна — J161;','Текущий локальный пакет дизайна — J163;');p.write_text(s,encoding='utf-8')
 p=base/'audit/audit-reconciliation-JAPP146/STATUS.md';s=p.read_text(encoding='utf-8');pos=s.index('\n')+1;p.write_text(s[:pos]+'\n**После J-APP-162:** фрагмент «К разбору» опубликован. Следующий пакет J163 — выбор/фоновые данные/возврат опроса — готов только локально. [Остаток](CURRENT-REMAINDER.md), [результат](../habitual-ux-JAPP163/REPORT.md). Старые записи ниже — история, не текущая очередь.\n'+s[pos:],encoding='utf-8')
 p=base/'audit/discuss-ux-JAPP161/REPORT.md';s=p.read_text(encoding='utf-8');pos=s.index('\n')+1;p.write_text(s[:pos]+'\n**Обновление20октября2026: принят и опубликован выпуском J-APP-162.** [Выпуск](../discuss-release-JAPP162/RELEASE.md). Ниже — история локального этапа.\n'+s[pos:],encoding='utf-8')
for folder in['discuss-release-JAPP162','habitual-ux-JAPP163']:
 shutil.copytree(R/'audit'/folder,C/'audit'/folder,dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__','public'))
print('Release and local package recorded separately; original audit remains open; local runtime not copied to release')
