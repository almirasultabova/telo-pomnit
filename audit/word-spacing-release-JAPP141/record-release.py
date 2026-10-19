from pathlib import Path
import json,shutil
R=Path(__file__).resolve().parents[2];C=R/'output/silk-launch-release';H=Path(__file__).parent
https=json.loads((H/'https.json').read_text(encoding='utf-8'));assert len(https)==276 and all(r['ok']for r in https)
ui=json.loads((H/'published-ui.json').read_text(encoding='utf-8'));assert len(ui)==4 and all(r['buttonsPassed']and not r['overflow']and not r['pageErrors']for r in ui)
assert json.loads((H/'backup-verification.json').read_text(encoding='utf-8'))['passed']
v=json.loads((H/'vercel.json').read_text(encoding='utf-8'));assert v['readyState']=='READY' and v['sha']=='01ecb35b6f43f31fa5c0510c838353406d14c436'
summary='**J-APP-141 / J-APP-140 / T-APP-038 — опубликовано.** 19 октября2026 по прямому поручению Альмиры слова в двух названиях карточек Главной разделены обычным пробелом. Кегль14px, CSS/JS/медиа/сценарии и данные прежние. Код01ecb35/Vercel READY, Beget/recovery с проверенным backup;2HTML,276HTTPS-хешей и4published UI с переходами обеих кнопок прошли. Физическая сверка на iPhone отдельно. Выпуск завершён. '
docs={'project.md':'audit/word-spacing-release-JAPP141/RELEASE.md','База знаний/07 Приложение и экосистема.md':'../audit/word-spacing-release-JAPP141/RELEASE.md','База знаний/08 Решения.md':'../audit/word-spacing-release-JAPP141/RELEASE.md','База знаний/План.md':'../audit/word-spacing-release-JAPP141/RELEASE.md','База знаний/Журнал обсуждений.md':'../audit/word-spacing-release-JAPP141/RELEASE.md','База знаний/Техническое/Развёртывание.md':'../../audit/word-spacing-release-JAPP141/RELEASE.md','app/CLAUDE.md':'../audit/word-spacing-release-JAPP141/RELEASE.md'}
for base in [R,C]:
 for name,link in docs.items():
  p=base/name;s=p.read_text(encoding='utf-8');head,rest=s.split('\n',1)
  assert '**J-APP-141 / J-APP-140 / T-APP-038'not in s
  p.write_text(head+'\n\n'+summary+f'[Выпуск и возврат]({link}).\n'+rest,encoding='utf-8',newline='\n')
p=R/'audit/word-spacing-JAPP140/REPORT.md';s=p.read_text(encoding='utf-8').replace('**Исправлено локально, не опубликовано.**','**Принято и опубликовано J-APP-141.** [Выпуск и возврат](../word-spacing-release-JAPP141/RELEASE.md). Ниже — исходная локальная проверка.');p.write_text(s,encoding='utf-8',newline='\n')
p=R/'audit/phone-acceptance-JAPP137/CHECKLIST.md';s=p.read_text(encoding='utf-8').replace('Локальная правка J-APP-140; выпуск/телефонный повтор ожидаются','Правка J-APP-140 опубликована J-APP-141; телефонный повтор ожидается');p.write_text(s,encoding='utf-8',newline='\n')
for folder in ['word-spacing-JAPP140','word-spacing-release-JAPP141']:
 dest=C/'audit'/folder;dest.mkdir(parents=True,exist_ok=True)
 for p in(R/'audit'/folder).iterdir():
  if p.is_file() and p.suffix in ['.md','.json','.py','.cjs'] and not p.name.startswith('final-'):shutil.copyfile(p,dest/p.name)
shutil.copyfile(H/'webkit-main-390.png',C/'audit/word-spacing-release-JAPP141/webkit-main-390.png')
shutil.copyfile(R/'audit/word-spacing-JAPP140/chromium-390-pair.png',C/'audit/word-spacing-JAPP140/chromium-390-pair.png')
shutil.copyfile(R/'audit/phone-acceptance-JAPP137/CHECKLIST.md',C/'audit/phone-acceptance-JAPP137/CHECKLIST.md')
print('Recorded completed release and pending phone acceptance; unrelated root edits excluded.')
