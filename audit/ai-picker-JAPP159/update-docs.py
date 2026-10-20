from pathlib import Path
import shutil
R=Path(__file__).resolve().parents[2];C=R/'output/silk-launch-release'
docs=['project.md','База знаний/План.md','База знаний/Журнал обсуждений.md','База знаний/07 Приложение и экосистема.md','База знаний/08 Решения.md','app/PRODUCT.md','app/DESIGN.md','app/CLAUDE.md']
release='**J-APP-158 / T-APP-046 — J-APP-157 опубликован.** 20 октября2026 по прямому поручению Альмиры: крупные кнопки начальной/итоговой анкет на телефоне. Точный один CSS, private backup прочитан,294HTTPS-хеша,72новых/66прежних/9резервных UI-групп прошли. JS/значения/API/backend/участницы прежние; физический Telegram отдельно. [Выпуск]({link}audit/scale-release-JAPP158/RELEASE.md).'
local='**J-APP-159 / T-APP-047 / I-074 — понятный выбор записей для AI, готово локально.** По поручению продолжить дизайн/удобство воспроизведена потеря фокуса после отметки. Добавлены счётчик/выделение/объяснение предела5, сохранены фокус/прокрутка; явный просмотр переводит внимание к полному тексту. Отдельное разрешение и набранное сообщение сохранены.55UI/8краевых/24прежних сценария прошли; реальных отправок0. Не опубликовано; следующий шаг — оценка локального До/После. [Результат и просмотр]({link}audit/ai-picker-JAPP159/REPORT.md).'
for f in docs:
 for base in[R,C]:
  p=base/f;s=p.read_text(encoding='utf-8');link=''if f=='project.md'else'../';lines=s.splitlines()
  for i,line in enumerate(lines):
   if line.startswith('**J-APP-157 / T-APP-046 / I-073'):
    lines[i]='**J-APP-157 / T-APP-046 / I-073 — принят и опубликован J-APP-158.** История подготовки и замеры — [отчёт]('+link+'audit/scale-touch-JAPP157/REPORT.md).';break
  s='\n'.join(lines)+'\n';pos=s.index('\n')+1;p.write_text(s[:pos]+'\n'+local.format(link=link)+'\n\n'+release.format(link=link)+'\n'+s[pos:],encoding='utf-8')
for base in[R,C]:
 p=base/'База знаний/Идеи и развитие.md';s=p.read_text(encoding='utf-8');lines=s.splitlines()
 for i,line in enumerate(lines):
  if line.startswith('**I-073 / J-APP-157'):
   lines[i]='**I-073 / J-APP-157 → J-APP-158 / T-APP-046 — крупные цифры анкет опубликованы.** По прямому поручению Альмиры20октября2026. Польза — легче нажимать оценки на телефоне. Условие возврата — обратная связь на устройстве. [Выпуск](../audit/scale-release-JAPP158/RELEASE.md).';break
 s='\n'.join(lines)+'\n';pos=s.index('\n')+1;entry='\n**I-074 / J-APP-159 / T-APP-047 — наглядный выбор дневника для AI, локально.** Предложение ассистента20октября2026 в рамках поручения продолжить именно дизайн/удобство. Основание — исходный аудит и воспроизведённая потеря фокуса после Space. Польза — видны выбор/количество/предел, сохраняется место, полный текст и разрешение отделены. Проверено локально, не опубликовано; возврат после оценки Альмирой. [Результат](../audit/ai-picker-JAPP159/REPORT.md).\n'
 p.write_text(s[:pos]+entry+s[pos:],encoding='utf-8')
p=R/'audit/audit-reconciliation-JAPP146/CURRENT-REMAINDER.md';s=p.read_text(encoding='utf-8').replace('после J-APP-156','после J-APP-158')
s=s.replace('J-APP-157 подготовлен локально:','J-APP-157 опубликован выпуском J-APP-158:').replace('Пока не опубликован. [Результат и проверка](../scale-touch-JAPP157/REPORT.md).','Вопрос выполнен; физическая приёмка отдельно. [Выпуск](../scale-release-JAPP158/RELEASE.md).')
s=s.replace('## Подтверждённая оставшаяся UI-правка','## Подтверждённые UI-замечания: текущий статус')
needle='## Что ещё требуется проверить по дизайну и удобству'
entry='**Выбор дневника для AI, раздел6/14.** После Space фокус переходил наBODY; выбранное количество не показано. Воспроизведено вChromium/WebKit. J-APP-159 исправляет локально: выделение/счётчик/предел5, фокус/прокрутка и явный переход к полному просмотру.55UI/8краевых/24прежних сценария прошли; пока не опубликовано. [Результат](../ai-picker-JAPP159/REPORT.md). Это адресный проход выбранных записей, не всегоAI.\n\n'
s=s.replace(needle,entry+needle).replace('выбора дневника/точного контекста AI,','остальных сценариев AI (выбор дневника/точный контекст локально проверен J159),')
s=s.replace('Следующее локальное изменение дизайна — J157;','Следующее локальное изменение дизайна — J159;');p.write_text(s,encoding='utf-8');shutil.copy2(p,C/p.relative_to(R))
p=R/'audit/audit-reconciliation-JAPP146/STATUS.md';s=p.read_text(encoding='utf-8');pos=s.index('\n')+1;p.write_text(s[:pos]+'\n**После J-APP-158:** шкалы анкет опубликованы. Следующий адресный UI-пакет — выбор дневника для AI J159 — реализован и проверен только локально. [Актуальный остаток](CURRENT-REMAINDER.md), [результат](../ai-picker-JAPP159/REPORT.md). Исторические local-only записи ниже не текущий статус.\n'+s[pos:],encoding='utf-8');shutil.copy2(p,C/p.relative_to(R))
p=R/'audit/scale-touch-JAPP157/REPORT.md';s=p.read_text(encoding='utf-8');pos=s.index('\n')+1;p.write_text(s[:pos]+'\n**Обновление20октября2026: принят и опубликован J-APP-158.** [Выпуск](../scale-release-JAPP158/RELEASE.md). Ниже — история подготовки.\n'+s[pos:],encoding='utf-8');shutil.copy2(p,C/p.relative_to(R))
for name in['scale-release-JAPP158','ai-picker-JAPP159']:
 shutil.copytree(R/'audit'/name,C/'audit'/name,dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__','public'))
print('Updated release, local UI package, project decisions and original audit remainder; J159 runtime not copied to release checkout')
