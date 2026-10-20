from pathlib import Path
import shutil
R=Path(__file__).resolve().parents[2];C=R/'output/silk-launch-release'
docs=['project.md','База знаний/План.md','База знаний/Журнал обсуждений.md','База знаний/07 Приложение и экосистема.md','База знаний/08 Решения.md','app/PRODUCT.md','app/DESIGN.md','app/CLAUDE.md']
release='**J-APP-160 / T-APP-047 — J-APP-159 опубликован.** 20 октября2026 по прямому поручению Альмиры: счётчик/выделение/предел5 и сохранение фокуса выбора дневника дляAI. Точный кандидат, проверенный private backup,294HTTPS-хеша и78опубликованных UI/краевых групп прошли. Backend/модель/права/данные прежние, реальных отправок0. [Выпуск]({link}audit/ai-picker-release-JAPP160/RELEASE.md).'
local='**J-APP-161 / T-APP-048 / I-075 — удобный выбор фрагмента «К разбору», локально.** По поручению продолжить дизайн/удобство воспроизведены длинное дублирование выделения и потеря загруженной страницы при Back. Краткий счётчик/раскрытие полного текста,52px-действия и возврат к исходной заметке/прокрутке/фокусу готовы;55UI и12краевых групп прошли. Оригинал/черновик/явное сохранение сохранены, API/backend прежние. Не опубликовано; следующий шаг — оценка До/После. [Результат и просмотр]({link}audit/discuss-ux-JAPP161/REPORT.md).'
for f in docs:
 for base in[R,C]:
  p=base/f;s=p.read_text(encoding='utf-8');link=''if f=='project.md'else'../';lines=s.splitlines()
  for i,line in enumerate(lines):
   if line.startswith('**J-APP-159 / T-APP-047 / I-074'):
    lines[i]='**J-APP-159 / T-APP-047 / I-074 — принят и опубликован J-APP-160.** История подготовки — [отчёт]('+link+'audit/ai-picker-JAPP159/REPORT.md).';break
  s='\n'.join(lines)+'\n';pos=s.index('\n')+1;p.write_text(s[:pos]+'\n'+local.format(link=link)+'\n\n'+release.format(link=link)+'\n'+s[pos:],encoding='utf-8')
for base in[R,C]:
 p=base/'База знаний/Идеи и развитие.md';s=p.read_text(encoding='utf-8');lines=s.splitlines()
 for i,line in enumerate(lines):
  if line.startswith('**I-074 / J-APP-159'):
   lines[i]='**I-074 / J-APP-159 → J-APP-160 / T-APP-047 — понятный выбор записей дляAI опубликован.** По прямому поручению Альмиры20октября2026. Польза — видны выбор/количество/предел, сохраняется место. Условие возврата — обратная связь на устройстве. [Выпуск](../audit/ai-picker-release-JAPP160/RELEASE.md).';break
 s='\n'.join(lines)+'\n';pos=s.index('\n')+1;entry='\n**I-075 / J-APP-161 / T-APP-048 — удобный длинный фрагмент «К разбору», локально.** Предложение ассистента20октября2026 в рамках поручения продолжить дизайн/удобство. Основание — исходный аудит и воспроизведённые дублирование2000символов/потеря13→10строк при Back. Польза — кнопки не теряются под повтором текста, возврат сохраняет место; исходник целый. Проверено локально, не опубликовано; возврат после оценки Альмирой. [Результат](../audit/discuss-ux-JAPP161/REPORT.md).\n'
 p.write_text(s[:pos]+entry+s[pos:],encoding='utf-8')
p=R/'audit/audit-reconciliation-JAPP146/CURRENT-REMAINDER.md';s=p.read_text(encoding='utf-8').replace('после J-APP-158','после J-APP-160')
s=s.replace('J-APP-159 исправляет локально:','J-APP-159 опубликован выпуском J-APP-160:').replace('55UI/8краевых/24прежних сценария прошли; пока не опубликовано. [Результат](../ai-picker-JAPP159/REPORT.md).','55UI/8краевых/24прежних локальных и78опубликованных групп прошли. [Выпуск](../ai-picker-release-JAPP160/RELEASE.md).')
needle='## Что ещё требуется проверить по дизайну и удобству';entry='**«К разбору»: выбор заметки и фрагмента, раздел6/14.** Подтверждены повтор2000символов над кнопками и потеря загруженной страницы при Back. J-APP-161 исправляет локально: короткий статус/явное раскрытие полного фрагмента, возврат13строк/позиции/фокуса.55UI/12краевых групп прошли; пока не опубликовано. Оригинал/копия/черновики и отсутствие передачи ведущим сохранены. [Результат](../discuss-ux-JAPP161/REPORT.md).\n\n'
s=s.replace(needle,entry+needle).replace('точный контекст локально проверен J159','точный контекст проверен и опубликован J160').replace('«К разбору» с длинным фрагментом,','остальных представлений «К разбору» (выбор/длинный фрагмент проверен локально J161),').replace('Следующее локальное изменение дизайна — J159;','Следующее локальное изменение дизайна — J161;');p.write_text(s,encoding='utf-8');shutil.copy2(p,C/p.relative_to(R))
p=R/'audit/audit-reconciliation-JAPP146/STATUS.md';s=p.read_text(encoding='utf-8');pos=s.index('\n')+1;p.write_text(s[:pos]+'\n**После J-APP-160:** выбор дневника дляAI опубликован. Следующий UI-пакет — фрагмент «К разбору» J161 — реализован и проверен только локально. [Актуальный остаток](CURRENT-REMAINDER.md), [результат](../discuss-ux-JAPP161/REPORT.md). Исторические записи ниже не текущая очередь.\n'+s[pos:],encoding='utf-8');shutil.copy2(p,C/p.relative_to(R))
p=R/'audit/ai-picker-JAPP159/REPORT.md';s=p.read_text(encoding='utf-8');pos=s.index('\n')+1;p.write_text(s[:pos]+'\n**Обновление20октября2026: принят и опубликован J-APP-160.** [Выпуск](../ai-picker-release-JAPP160/RELEASE.md). Ниже — история локальной подготовки.\n'+s[pos:],encoding='utf-8');shutil.copy2(p,C/p.relative_to(R))
for name in['ai-picker-release-JAPP160','discuss-ux-JAPP161']:
 shutil.copytree(R/'audit'/name,C/'audit'/name,dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__','public'))
print('Updated release, local discussion UI, plan and original audit remainder; J161 runtime stays local')
