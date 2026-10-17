"""Record this completed release without copying unrelated root documentation."""
from pathlib import Path
import shutil
ROOT=Path(__file__).resolve().parents[2];REL=ROOT/'output/silk-launch-release';HERE=Path(__file__).parent
block="""**J-APP-063 / A23 — облегчённая карта принята и опубликована.** 17 октября Альмира поручила перенос/выпуск с резервной копией. Две карты lossless: 4,00 → 2,42 МБ; исходные RGBA, геометрия и 35 зон сохранены. Выпуск 6399d5d, Vercel READY, Beget/recovery с private backup; 80 файлов каждого из трёх адресов сверены по HTTPS. Опубликованный UI Chromium/Edge/WebKit проверен без реальных отправок. Backend/сохранение/права/уведомления не менялись. Физическая проверка в Telegram остаётся владельцу."""
docs={
 'project.md':'audit/map-release-JAPP063/RELEASE.md',
 'База знаний/План.md':'../audit/map-release-JAPP063/RELEASE.md',
 'База знаний/07 Приложение и экосистема.md':'../audit/map-release-JAPP063/RELEASE.md',
 'База знаний/08 Решения.md':'../audit/map-release-JAPP063/RELEASE.md',
 'app/CLAUDE.md':'../audit/map-release-JAPP063/RELEASE.md',
 'База знаний/Техническое/Развёртывание.md':'../../audit/map-release-JAPP063/RELEASE.md',
}
for base in [ROOT,REL]:
 for name,link in docs.items():
  p=base/name;s=p.read_text(encoding='utf-8');assert '**J-APP-063 / A23'not in s
  title,rest=s.split('\n',1);p.write_text(title+'\n\n'+block+' [Выпуск и откат]('+link+').\n'+rest,encoding='utf-8')
 p=base/'База знаний/Журнал обсуждений.md';s=p.read_text(encoding='utf-8')
 entry='## J-APP-063 — облегчённая карта принята, перенесена и опубликована\n\n'+block+' [Результат и доказательства](../audit/map-release-JAPP063/RELEASE.md). Предыдущая граница J-APP-062 «только кандидат» снята прямым поручением; чужие root-правки в релиз не переносились.\n\n'
 if '## J-APP-063 —'in s:
  a=s.index('## J-APP-063 —');b=s.index('\n## ',a+4);s=s[:a]+entry+s[b+1:]
 else:
  title,rest=s.split('\n',1);s=title+'\n\n'+entry+rest
 p.write_text(s,encoding='utf-8')
# Candidate report remains a historical record, with an explicit current pointer.
p=ROOT/'audit/performance-JAPP062/REPORT.md';s=p.read_text(encoding='utf-8');title,rest=s.split('\n',1)
p.write_text(title+'\n\n**Актуализация J-APP-063:** кандидат принят, перенесён и опубликован по отдельному поручению; [выпуск](../map-release-JAPP063/RELEASE.md). Ниже — исторический срез локального этапа J-APP-062.\n'+rest,encoding='utf-8')
target=REL/'audit/map-release-JAPP063';target.mkdir(parents=True,exist_ok=True)
for p in HERE.iterdir():
 if p.is_file() and p.suffix in ['.md','.json','.py','.cjs']:shutil.copy2(p,target/p.name)
target=REL/'audit/performance-JAPP062';target.mkdir(parents=True,exist_ok=True);shutil.copy2(ROOT/'audit/performance-JAPP062/REPORT.md',target/'REPORT.md')
print('Current release recorded in map/plan/application/decisions/journal/app instructions/operations; no unrelated doc replacement')
