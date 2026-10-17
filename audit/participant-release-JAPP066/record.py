from pathlib import Path
import shutil
ROOT=Path(__file__).resolve().parents[2];HERE=Path(__file__).parent;REL=ROOT/'output/silk-launch-release'
block='**J-APP-066 / A14 — исправление карточки опубликовано с резервной копией.** 17 октября Альмира разрешила выпуск J-APP-065, сохранив запрет изменения настоящих участниц/расширения прав/уведомлений. На Beget заменён только admin.js, backup проверен, backend перезапущен; 33 synthetic-группы повторены на установленном коде, записи/внешние вызовы/уведомления теста 0. Owner-only, личные дневники/AI и гранты прежние. Commit c7094b0, Vercel READY; health200/unauthorized401 по HTTPS, frontend неизменён.'
docs={'project.md':'audit/participant-release-JAPP066/RELEASE.md','База знаний/План.md':'../audit/participant-release-JAPP066/RELEASE.md','База знаний/07 Приложение и экосистема.md':'../audit/participant-release-JAPP066/RELEASE.md','База знаний/08 Решения.md':'../audit/participant-release-JAPP066/RELEASE.md','База знаний/Техническое/Развёртывание.md':'../../audit/participant-release-JAPP066/RELEASE.md'}
for base in [ROOT,REL]:
 for f,link in docs.items():
  p=base/f;s=p.read_text(encoding='utf-8')
  if '**J-APP-066 / A14'in s:continue
  title,rest=s.split('\n',1);p.write_text(title+'\n\n'+block+' [Выпуск и откат]('+link+').\n'+rest,encoding='utf-8')
 p=base/'База знаний/Журнал обсуждений.md';s=p.read_text(encoding='utf-8')
 entry='## J-APP-066 — исправление карточки опубликовано с backup и прежними правами\n\n'+block+' [Доказательства и границы](../audit/participant-release-JAPP066/RELEASE.md). Прежнее «не публиковать» J-APP-065 снято прямым поручением. Рабочие карточки настоящих участниц тестами не читались; положительный owner200 подтверждён изолированным inject установленного модуля, а HTTP smoke без настоящего токена.\n\n'
 if '## J-APP-066 —'in s:
  a=s.index('## J-APP-066 —');b=s.index('\n## ',a+4);s=s[:a]+entry+s[b+1:]
 else:
  title,rest=s.split('\n',1);s=title+'\n\n'+entry+rest
 p.write_text(s,encoding='utf-8')
 for f in ['audit/10-ISSUE-REGISTER.md','audit/13-IMPLEMENTATION-BACKLOG.md']:
  p=base/f
  if not p.exists():continue
  s=p.read_text(encoding='utf-8');needle='## A14 · P2 · Legacy карточка участницы возвращает500\n'
  if '**Текущий статус J-APP-066'in s:continue
  assert s.count(needle)==1
  s=s.replace(needle,needle+'\n**Текущий статус J-APP-066, 17 октября:** исправление опубликовано по прямому поручению, backup/33 synthetic-группы на сервере/health200/unauthorized401 успешны; права не расширены. [Выпуск](participant-release-JAPP066/RELEASE.md). Ниже сохранены прежние этапы/исходный аудит.\n',1);p.write_text(s,encoding='utf-8')
p=ROOT/'audit/participant-card-JAPP065/REPORT.md';s=p.read_text(encoding='utf-8')
if '**Текущий этап J-APP-066:'not in s:
 title,rest=s.split('\n',1);p.write_text(title+'\n\n**Текущий этап J-APP-066:** исправление опубликовано по отдельному прямому поручению; [выпуск и backup](../participant-release-JAPP066/RELEASE.md). Ниже — исторический срез локальной проверки J-APP-065.\n'+rest,encoding='utf-8')
for folder in ['participant-release-JAPP066','participant-card-JAPP065']:
 target=REL/'audit'/folder;target.mkdir(parents=True,exist_ok=True)
 for p in (ROOT/'audit'/folder).iterdir():
  if p.is_file()and p.suffix in ['.md','.json','.py','.cjs']:shutil.copy2(p,target/p.name)
print('Release status recorded without copying unrelated root changes')
