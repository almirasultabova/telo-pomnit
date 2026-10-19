from pathlib import Path
import shutil
R=Path(__file__).resolve().parents[2];C=R/'output/silk-launch-release';H=Path(__file__).parent
for base in [R,C]:
 p=base/'audit/recent-diary-JAPP119/REPORT.md'
 s=p.read_text(encoding='utf-8')
 note='**Обновление 19 октября — J-APP-120:** после отдельного поручения проверка реального Prisma/PostgreSQL выполнена до и после установки, J-APP-119 опубликован. [Выпуск, доказательства и откат](../recent-diary-release-JAPP120/RELEASE.md). Текст ниже сохраняет границу первоначальной локальной проверки; следующий J-APP-121 в этот выпуск не включён.'
 if '**Обновление 19 октября — J-APP-120:**' not in s:
  first,tail=s.split('\n',1);s=first+'\n\n'+note+'\n'+tail
 p.write_text(s,encoding='utf-8')
for f in ['changes.patch','native-results.json']:
 shutil.copyfile(R/'audit/recent-diary-JAPP119'/f,C/'audit/recent-diary-JAPP119'/f)
for p in (R/'audit/recent-diary-JAPP119/before').rglob('*'):
 if p.is_file():
  dest=C/'audit/recent-diary-JAPP119/before'/p.relative_to(R/'audit/recent-diary-JAPP119/before');dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,dest)
for f in ['api.json','verify-api.py','support.py']:
 shutil.copyfile(H/f,C/'audit/recent-diary-release-JAPP120'/f)
print('Release evidence and historical local status saved; no candidate source copied')
