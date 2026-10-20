from pathlib import Path
import re,json,shutil,subprocess
R=Path(__file__).resolve().parents[2];C=R/'output/silk-launch-release'
DOCS=['project.md','База знаний/План.md','База знаний/Журнал обсуждений.md','База знаний/07 Приложение и экосистема.md','База знаний/08 Решения.md','База знаний/Идеи и развитие.md','app/PRODUCT.md','app/DESIGN.md','app/CLAUDE.md']
for base in [R,C]:
 for f in DOCS:
  p=base/f;s=p.read_text(encoding='utf-8');prefix=''if f=='project.md'else'../'
  release=f'**J-APP-167 → J-APP-168 / T-APP-051 / I-078 — принят и опубликован целиком.**20октября2026 по прямому поручению Альмиры. История, широкие ответы, скрытые полосы и снятие1000символов в клиенте/API; backup/294HTTPS-хеша и опубликованные браузерные сценарии проверены. Модель/prompt прежние, реальныхAI-запросов0. [Выпуск]({prefix}audit/ai-history-release-JAPP168/RELEASE.md).'
  local=f'**J-APP-169 / T-APP-052 / I-079 — «К разбору», только локально.** Возврат к прежней строке/вкладке, чтение после отмены редактирования, заметные состояния сохранения; поздний ответ не возвращает на покинутый экран.35UI/8краевых и55/12прежних групп прошли. [Результат]({prefix}audit/discuss-reading-JAPP169/REPORT.md). Следующий шаг — оценка Альмирой; публикация не согласована.'
  if f=='База знаний/Журнал обсуждений.md':
   local+=' Основание — поручение продолжить аудит и браузерное воспроизведение2164→0/3403→0. Выбран адресный возврат/состояния, без смены айдентики и передачи ведущим. При проверке обнаружен и устранён переход от позднего сохранения; черновики сохраняются.'
  elif f=='База знаний/План.md':
   release+=' Задача T-APP-051 выполнена с установленным backend ai.js; миграций нет.'
   local+=' T-APP-052: локальная реализация и проверки выполнены; открытая часть — решение о выпуске и физическая приёмка.'
  elif f=='База знаний/Идеи и развитие.md':
   local+=' Автор находки/предложения — ассистент,20октября2026; источник — завершающий проход раздела6/14 исходного аудита по поручению Альмиры. Польза — не искать открытую запись заново; условие возврата — оценка локального просмотра.'
  elif f=='База знаний/08 Решения.md':
   release+=' Прежняя граница «только локально» снята прямым сообщением владельца. Весь финальный кандидат, включая серверную длину, принят; модель/prompt менять не поручено.'
   local+=' Это результат разрешённой локальной работы по аудиту, а не утверждённый публичный дизайн.'
  elif f=='База знаний/07 Приложение и экосистема.md':
   release+=' Отправка при переключении разговора приостановлена; выбранное название соответствует сообщениям, после сбоя остаются предыдущие сообщения/черновик и одно действие повтора. Ответы занимают доступную ширину; прокрутка пальцем/клавиатурой сохранена. Снят предел1000символов; прежняя граница HTTP-запроса остаётся.'
  elif f=='app/CLAUDE.md':
   local+=' Runtime J169 есть в корневой рабочей копии/изолированном кандидате, но отсутствует в опубликованном checkout output/silk-launch-release. Не переносить в релиз автоматически.'
  elif f=='app/DESIGN.md':
   local+=' Действующие цвета/типографика сохранены; ошибка использует спокойную подложку, подтверждение идёт перед длинным текстом. Ширина AI/скрытые полосы уже опубликованы J168.'
  elif f=='app/PRODUCT.md':
   local+=' Только личные записи, без автоматической передачи ведущим; несохранённая правка остаётся черновиком.'
  matches=list(re.finditer(r'^\*\*(?:I-078 / )?J-APP-167[^\n]*(?:\n(?!\n)[^\n]*)*',s,re.M))
  assert len(matches)>=1,(f,base)
  match=matches[0];s=s[:match.start()]+local+'\n\n'+release+s[match.end():];p.write_text(s,encoding='utf-8')
 # Reconcile the primary current remainder rather than adding another parallel list.
 p=base/'audit/audit-reconciliation-JAPP146/CURRENT-REMAINDER.md';s=p.read_text(encoding='utf-8').replace('после J-APP-166','после J-APP-168')
 a='**История AI, раздел6/14.**';start=s.index(a);end=s.index('\n\n',start)
 s=s[:start]+'**История AI, раздел6/14.** J167 со всеми дополнениями опубликован J168: корректный разговор/пауза отправки, состояния истории, широкие ответы, скрытые полосы при сохранённой прокрутке, снят1000символов в клиенте/API.294HTTPS-хеша,79основных и8резервных групп плюс проверки длинной доставки/форм/полос прошли. [Выпуск](../ai-history-release-JAPP168/RELEASE.md).\n\n**Остальные чтение/редактирование «К разбору», раздел6/14.** J169 только локально: найден возврат в начало длинного списка и принудительный переход от позднего ответа; восстановлены прежние строка/вкладка/фокус, чтение после редактирования и состояния сохранения.35UI/8краевых/67прежних групп прошли; ждёт оценки владельца. [Результат](../discuss-reading-JAPP169/REPORT.md).'+s[end:]
 s=s.replace('чтение истории локально пройдено J167','чтение истории опубликовано J168').replace('выбор/длинный фрагмент опубликован J162','выбор/длинный фрагмент опубликован J162, чтение/редактирование локально пройдены J169').replace('Текущий локальный пакет дизайна — J167','Текущий локальный пакет дизайна — J169');p.write_text(s,encoding='utf-8')
 p=base/'audit/audit-reconciliation-JAPP146/STATUS.md';s=p.read_text(encoding='utf-8');point=s.index('\n\n')+2;s=s[:point]+'**После J-APP-168:** весь J167 опубликован, включая широкое чтение/полосы/снятие1000символов на клиенте/API. Следующий J169 — возврат/редактирование/состояния «К разбору» — проверен только локально. [Остаток](CURRENT-REMAINDER.md), [выпуск](../ai-history-release-JAPP168/RELEASE.md), [локально](../discuss-reading-JAPP169/REPORT.md). Полный аудит не закрыт; ниже история прежних этапов.\n\n'+s[point:];p.write_text(s,encoding='utf-8')
 p=base/'audit/ai-history-ux-JAPP167/REPORT.md';s=p.read_text(encoding='utf-8');point=s.index('\n\n');s=s[:point]+'\n\n**Текущий статус20октября2026: весь окончательный J167 согласован и опубликован выпуском J168.** [Выпуск](../ai-history-release-JAPP168/RELEASE.md). Ниже хронология локальной подготовки до согласования; прежние слова «не опубликовано» относятся к этим этапам, а не текущему состоянию.'+s[point:];s=s.replace('понятное переключение истории AI, локально','понятное переключение истории AI — опубликовано J168',1);p.write_text(s,encoding='utf-8')
# Copy evidence only. Never copy the next candidate runtime into the release checkout.
for folder in ['ai-history-release-JAPP168','discuss-reading-JAPP169','ai-history-ux-JAPP167']:
 for p in (R/'audit'/folder).rglob('*'):
  rel=p.relative_to(R/'audit'/folder)
  if not p.is_file()or any(x in rel.parts for x in ['__pycache__','public','backend']):continue
  if p.suffix not in ['.py','.cjs','.json','.md','.html','.patch']and p.name not in ['comparison-return.png','chromium-390-error.png','comparison-reading.png']:continue
  t=C/'audit'/folder/rel;t.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,t)
expected='e59cb1e74e85013b9897c86de0eb9a4e36bcddc2'
assert not subprocess.check_output(['git','-C',str(C),'diff',expected,'--','app/index.html','app/css','app/js','backend','scripts'],text=True),'Next runtime leaked into release checkout'
print('PASS root and isolated docs updated, J167 whole release recorded, J169 runtime unpublished')
