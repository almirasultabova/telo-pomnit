from pathlib import Path
import json,shutil
R=Path(__file__).resolve().parents[2];C=R/'output/silk-launch-release';H=Path(__file__).parent
https=json.loads((H/'https.json').read_text(encoding='utf-8'));assert len(https)==276 and all(r['ok']for r in https)
ui=json.loads((H/'published-ui.json').read_text(encoding='utf-8'));assert len(ui)==8 and all(r['passed']for r in ui)
assert json.loads((H/'backup-verification.json').read_text(encoding='utf-8'))['passed']
assert len(json.loads((H/'range.json').read_text(encoding='utf-8')))==6
v=json.loads((H/'vercel.json').read_text(encoding='utf-8'));assert v['readyState']=='READY' and v['sha']=='fc31fa1bee08b2a67ebfd3217b3f155acb76901e'
summary='**J-APP-139 / J-APP-138 / T-APP-037 — опубликовано.** 19 октября2026 по прямому поручению Альмиры заставка заполняет всю площадь, выбранный облегчённый MP4 подгружается одновременно со входом. Темп6/2,5с сохранён; play после допуска. Кодfc31fa1/Vercel READY, Beget/recovery с проверенным частным backup;92файла,276HTTPS-хешей,6Range206 и8published UI прошли. Backend/БД/данные/черновики/наличные прежние; физическое подтверждение скорости и полей ожидается от Альмиры на iPhone. Выпуск завершён. '
docs={'project.md':'audit/launch-speed-release-JAPP139/RELEASE.md','База знаний/07 Приложение и экосистема.md':'../audit/launch-speed-release-JAPP139/RELEASE.md','База знаний/08 Решения.md':'../audit/launch-speed-release-JAPP139/RELEASE.md','База знаний/План.md':'../audit/launch-speed-release-JAPP139/RELEASE.md','База знаний/Журнал обсуждений.md':'../audit/launch-speed-release-JAPP139/RELEASE.md','База знаний/Техническое/Развёртывание.md':'../../audit/launch-speed-release-JAPP139/RELEASE.md','app/CLAUDE.md':'../audit/launch-speed-release-JAPP139/RELEASE.md'}
for base in [R,C]:
 for name,link in docs.items():
  p=base/name;s=p.read_text(encoding='utf-8');heading,rest=s.split('\n',1)
  assert '**J-APP-139 / J-APP-138 / T-APP-037' not in s
  # Earlier local state is retained as a dated preparation record.
  rest=rest.replace('— ускорение загрузки заставки и заполнение экрана, локально.','— подготовка локального кандидата перед выпуском J-APP-139.').replace('— подготовлено локальное исправление заставки.','— локальное исправление подготовлено и затем выпущено J-APP-139.')
  p.write_text(heading+'\n\n'+summary+f'[Выпуск и возврат]({link}).\n'+rest,encoding='utf-8',newline='\n')
 note=base/'База знаний/Идеи и развитие.md';s=note.read_text(encoding='utf-8')
 if base==R:s=s.replace('Адресная локальная правка J-APP-138/T-APP-037 подготовлена;','Адресная правка J-APP-138/T-APP-037 опубликована J-APP-139;')
 else:
  heading,rest=s.split('\n',1);s=heading+'\n\n**I-066 / T-APP-036 — телефонная приёмка продолжается.** Получен отзыв Альмиры с iPhone о долгом закрытом бутоне и зелёных полях сверху/снизу. Адресная правка J-APP-138 опубликована J-APP-139/T-APP-037; повтор на iPhone и путь сохранения/возврата ещё ожидаются. [Выпуск](../audit/launch-speed-release-JAPP139/RELEASE.md).\n'+rest
 note.write_text(s,encoding='utf-8',newline='\n')
p=R/'audit/phone-acceptance-JAPP137/CHECKLIST.md';s=p.read_text(encoding='utf-8').replace('Локальный кандидат J-APP-138; повтор на телефоне ожидается','J-APP-138 опубликован J-APP-139; повтор на телефоне ожидается').replace('Публикация и действия с рабочими данными не выполнялись.','Правка заставки опубликована J-APP-139; действий с рабочими данными не было.');p.write_text(s,encoding='utf-8',newline='\n')
p=R/'audit/launch-speed-JAPP138/REPORT.md';s=p.read_text(encoding='utf-8').replace('**Локальный кандидат, не опубликован.**','**Кандидат принят и опубликован J-APP-139.** [Выпуск и возврат](../launch-speed-release-JAPP139/RELEASE.md). Ниже — исходная локальная проверка.');p.write_text(s,encoding='utf-8',newline='\n')
# Keep the audit wrapper aligned with the now-authoritative nine-group test.
p=R/'audit/launch-speed-JAPP138/test-unit.cjs';p.write_text("const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');\nconst root=path.resolve(__dirname,'../..');process.chdir(path.join(root,'output/launch-speed-JAPP138/source'));\nconst code=fs.readFileSync(path.join(root,'scripts/test-launch.cjs'),'utf8');vm.runInThisContext('(function(require){'+code+'\\n})',{filename:__filename})(require);\n",encoding='utf-8')
for folder in ['launch-speed-JAPP138','launch-speed-release-JAPP139']:
 dest=C/'audit'/folder;dest.mkdir(parents=True,exist_ok=True)
 for p in(R/'audit'/folder).iterdir():
  if p.is_file() and p.suffix in ['.md','.json','.py','.cjs','.patch'] and p.name not in ['final-vercel.json','final-https.json']:shutil.copyfile(p,dest/p.name)
for name in ['webkit-main-first.png','chromium-main-return.png']:shutil.copyfile(H/name,C/'audit/launch-speed-release-JAPP139'/name)
dest=C/'audit/phone-acceptance-JAPP137';dest.mkdir(parents=True,exist_ok=True);shutil.copyfile(R/'audit/phone-acceptance-JAPP137/CHECKLIST.md',dest/'CHECKLIST.md')
print('Recorded release and retained pending iPhone acceptance; no unrelated root changes copied.')
