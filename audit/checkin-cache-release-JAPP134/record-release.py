from pathlib import Path
import hashlib,json,shutil,subprocess
R=Path(__file__).resolve().parents[2];C=R/'output/silk-launch-release';H=Path(__file__).parent;T=R/'audit/checkin-cache-JAPP133'
def read(p):return p.read_text(encoding='utf-8-sig')
def load(p):return json.loads(read(p))
ui=load(T/'ui-results.json');storage=load(T/'storage-results.json');pub=load(H/'published-ui.json');https=load(H/'https.json');api=load(H/'api.json');activation=load(H/'activation-result.json');vercel=load(H/'vercel.json')
assert storage['passed'] and storage['groups']==20
assert ui['passed'] and len(ui['runs'])==20 and all(r['passed'] for r in ui['runs'])
assert sum(len(r['cases'])for r in ui['runs'])==116
assert len(pub)==16 and all(r['passed'] for r in pub)
publicChecks=sum(len(r['cases'])for r in pub)
assert len(https)==264 and all(r['ok'] for r in https)
assert sum(r.get('unauthenticatedStatus')==401 for r in api)==9 and all(r.get('installedHashMatches',True) for r in api)
assert vercel['readyState']=='READY' and not vercel['aliasError']
assert not activation['backendChanged'] and not activation['backendRestarted'] and activation['migrations']==0 and activation['protectedFilesUnchanged']
for f,v in ui['sourceHashes'].items():
 assert hashlib.sha256((R/f).read_bytes()).hexdigest()==v,f
 assert (R/f).read_bytes()==(C/f).read_bytes(),f
assert all(r['passed'] for r in load(T/'regression-storage.json'))
assert sum(len(r['cases'])for r in load(T/'regression-path.json'))==32
assert sum(len(r['passed'])for r in load(T/'regression-drafts.json'))==20
assert all(r['passed'] for r in load(T/'regression-diary.json'))
diaryChecks=sum(len(r['cases'])for r in load(T/'regression-diary.json'))
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=C,text=True).strip()==vercel['sha']

report='''# J-APP-133 — защищённая сегодняшняя отметка и ограниченные старые копии

19 октября 2026. Альмира: «Да, давай J-APP-133. Главное — сохранить сегодняшнюю отметку, неотправленные изменения и черновики. После проверок сразу можешь загрузить в приложение». T-APP-034 / I-064 реализованы и опубликованы J-APP-134. [Выпуск и возврат](../checkin-cache-release-JAPP134/RELEASE.md).

## Поведение и выбранный бюджет

Сохраняемая старая подтверждённая история checkins_v2 ограничена 201 записью и 512 КиБ UTF-16 JSON, включая receipt. Число201 соответствует первоначальному окну состояний, а не дневниковому лимиту90. По измерению короткие201копия занимают318758байт и помещаются в бюджет; длинные6000символьные —20копий /511246байт. Подтверждённая сегодняшняя отметка по Москве всегда вне этого бюджета. Полный массив в памяти открытой сессии и серверный архив сохраняются.

К сокращению допускаются только копии текущего владельца, полученные в GET или существующем проверенном ACK: receipt v1 хранит owner и точный снимок полей (пять шкал, заметка, dayKey, clientUpdatedAt и остальные известные поля). Старый synced не достаточен. Изменённые данные/версия/owner, неизвестные поля и legacy со старой шкалой защищены. Receipt — локальное происхождение копии, не новый протокол криптографической подписи.

Сегодняшняя отметка, pending/memory-only/ошибки и неопределённые данные не бюджетируются. При квоте сначала уменьшаются допустимые старые копии до0. Замена одного ключа с readback, без removeItem и очистки чужих/бесхозных ключей или форм. При QuotaExceeded, если защищённые данные сами не помещаются, прежний долговечный снимок остаётся; новое хранится в памяти с существующим предупреждением. Черновик формы при таком сохранении не очищается; подходящий ACK может очистить только свой отправленный черновик, новый текст защищён.

GET теперь явно сохраняет локальную неотправленную правку даже при равной/более поздней удалённой версии. Существующие правила daily upsert, clientUpdatedAt/409 и защита новой правки от старого ACK сохранены. После московской полуночи вчерашняя подтверждённая отметка может войти в бюджет старых копий; неотправленная остаётся защищённой. В неполной локальной истории есть явная подпись о подключении; сравнение не строится как по полному архиву.

## Проверки

- 20 Storage-групп: бюджет/201, receipt и изменение каждого поля, пять reload-сессий, сегодняшняя вне лимита, все pending/ошибки/legacy, actual-like quota/retry, прежний снимок, blocked/readback mismatch, ACK и смена владельца, равный/более новый GET, конфликт409, полночь, удалённый пользователь. [Результаты и измерения](storage-results.json).
- 1000 искусственных заметок6000символов: прежний сериализованный набор12697782 →536806UTF-16байт, включая защищённую сегодняшнюю отметку; старая часть20копий /511246байт. Все1000строк остались в памяти. На20000символьных текстах6копий, с экранированием3; сегодняшняя отдельно. Это размеры JSON, не измерение телефона/оперативной памяти.
- 20 браузерных прогонов /116проверок: Chromium320/390/1440, WebKit390. Реальное заполнение localStorage до QuotaExceeded, reload документа с полной квотой, серверная история503, сегодняшняя правка и все пять значений, отдельный несохранённый черновик, memory-only и прежний снимок, matching/late ACK, blocked store, чужие/legacy/body/AI-черновики неизменны. [UI](ui-results.json), [сценарии](test-ui.py).
- Прежние Storage:16 дневникового кэша,17 периода пути,18 сегодняшнего дневника,12 последних состояний и очередь наблюдений. Также32 UI пути со сравнением пяти моделей по полному искусственному архиву,20 сценариев прежних черновиков и @DIARY@ проверок quota/late ACK дневника Chromium/WebKit. Исторические результаты после запуска восстановлены. [Storage](regression-storage.json), [Путь](regression-path.json), [Черновики](regression-drafts.json), [Дневник](regression-diary.json).
- Только storage.js и узкая подпись app.js; сборка45site/88app и структура58 без предупреждений. [Изменения](changes.patch), [Сборка](build.json).

## Границы

При полностью запрещённой записи или очереди больше реальной квоты неограниченная долговечность невозможна: memory-only предупреждение остаётся. Бюджет ограничивает подтверждённую старую копию на диске; сегодняшняя, защищённые данные и память могут превышать512КиБ. Старые неизвестные строки могут поддерживать большой кэш до нормального подтверждения; их не удаляют автоматически ради лимита.

Холодная проверка аккаунта по-прежнему серверная. Reload-тесты используют разрешённую подставную авторизацию и настоящий reload при отказе истории; холодный Telegram в авиарежиме не доказан. Физический Telegram/мобильные сети/время телефона не проверены. БД/реальные участнические записи/OpenAI/уведомления в тестах не использовались. SDK и auth не менялись; текущая [официальная документация Telegram](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app) сверена как граница, без внедрения новых API хранения.
'''.replace('@DIARY@',str(diaryChecks))
(T/'REPORT.md').write_text(report,encoding='utf-8')
release='''# J-APP-134 — опубликован J-APP-133

19 октября2026. Прямое поручение Альмиры: сохранить сегодняшнюю отметку, неотправленные изменения и черновики, выпустить после проверок. Код @CODE@; Vercel @DEPLOY@ READY, aliasError отсутствует. [Поведение, проверки и границы](../checkin-cache-JAPP133/REPORT.md).

Старые подтверждённые копии состояний — максимум201 /512КиБ JSON UTF-16; сегодняшняя по Москве, очередь, ошибки, неизвестные данные и черновики защищены. Полный серверный архив, пять шкал, модели и открытая память прежние. GET не снимает локальную pending-правку, receipt учитывает точные поля и версию. Полностью запрещённая запись всё ещё требует предупреждения memory-only.

## Выпуск и доказательства

- Чистая база4975c10 получила ровно два проверенных исходника. Сборка45site/88app; структура58 без предупреждений. Изменены4публичных файла: js/storage.js, js/app.js, index.html, screen-review.html. Панель наличных, boot, SDK, остальные файлы прежние. [Manifest](manifest.json).
- До выпуска20 Storage/116 новых UI; прежние16+17+18+12 Storage и очередь,32 UI пути,20 сценариев черновиков и @DIARY@ UI дневника. [Результаты](../checkin-cache-JAPP133/REPORT.md).
- Частный проверенный backup `@BACKUP@`: app/recovery. Активация сверила88старых файлов каждого каталога, защищённые backend/схему/SQL/AI/наличные, nginx -t до/после; четыре файла поставлены через tmp/rename, все88итоговых хешей совпали. Backend/PID не менялись, миграций0. [Активация](activation-result.json), [Скрипт](activate.cjs).
- Vercel READY точного Git;264/264 HTTPS-хеша main/reserve/recovery совпали. Health200,9 прямых/проксированных проверок401 и прежние runtime-хеши diary/checkins. [HTTPS](https.json), [API](api.json), [Vercel](vercel.json).
- Опубликованные ресурсы:16прогонов /@PUBLIC@проверок — main Chromium390/1440/WebKit390, reserve Chromium390; bounded/quota/recovery/blocked, синтетический API и настоящая браузерная квота. Реальных рабочих записей/OpenAI/уведомлений0. Новая тестовая БД не создавалась. [Published UI](published-ui.json).
- Резерв проверен поHTTP/1.1 с --disable-http2; прежняя причина HTTP/2-таймаута этим выпуском не исправлялась. Один первоначальный navigation-timeout30с main/WebKit прошёл при повторном запуске оставшихся сценариев без изменения продукта. [Навигационный повтор](navigation-retry.json). Скриншоты ждут окончания конечных CSS-переходов, чтобы не оценивать промежуточный кадр как готовый экран. Физический Telegram и время телефона отдельно; холодная авторизация по-прежнему требует сервера. Следующий пакет не разрабатывался.

## Возврат

Вернуть клиент4975c10 на Vercel, app/recovery из соответствующих архивов backup; сверить publicBefore, health/401 и nginx -t. Backend/БД не откатывать: они этим пакетом не менялись. Локальные owner-scoped ключи и черновики при возврате не очищать. Удалённые подтверждённые offline-копии возвращаются чтением полного сервера после подключения; откат файлов сам их на устройство не возвращает. Автовосстановление при ошибке активации предусмотрено activate.cjs.

Выпуск проверен и завершён. Финальное состояние Vercel после коммита документации и6основных публичных хешей фиксируются root-only final-vercel.json/final-https.json без повторного цикла коммитов.
'''
for key,value in {'@CODE@':vercel['sha'],'@DEPLOY@':vercel['id'],'@BACKUP@':activation['backup'],'@DIARY@':str(diaryChecks),'@PUBLIC@':str(publicChecks)}.items():release=release.replace(key,value)
(H/'RELEASE.md').write_text(release,encoding='utf-8')
summary=f'**J-APP-134 / J-APP-133 / T-APP-034 / I-064 — опубликовано.** 19 октября2026 по прямому поручению Альмиры старые подтверждённые копии состояний ограничены201 /512КиБ; сегодняшняя по Москве, pending/ошибки/черновики/неизвестный legacy защищены. GET сохраняет локальную неотправленную версию, receipt проверяет пять шкал/заметку/owner/dayKey/clientUpdatedAt. Полный серверный архив, модели и память открытой сессии прежние.20 Storage/116 новых UI,32 прежних UI пути,20 сценариев черновиков,{diaryChecks} UI дневника,16 published/{publicChecks}проверок и264 HTTPS-хеша прошли. Vercel READY, Beget/recovery с проверенным backup; backend/PID/БД/AI/наличные прежние. Холодная авторизация серверная; физический Telegram отдельно. Выпуск завершён.'
contract='**Контракт J-APP-133 (опубликован J-APP-134):** _writeCheckins оставляет в памяти весь массив; на диске бюджет201/512КиБ UTF-16 JSON применяется только к старым копиям текущего owner с точным receipt v1 GET/ACK. Пять шкал/заметка/dayKey/clientUpdatedAt и известные поля входят в снимок; неизвестные поля/старый synced/legacy не доказательство. Сегодняшняя по Москве и все неотправленные/ошибочные/неопределённые строки вне бюджета. Quota-retry уменьшает только старые подтверждённые до0, заменяет один ключ с readback, не трогает черновики/другие owner/бесхозные ключи. GET не заменяет pending; версия защищает новый ACK. Существующий memory-only/защита черновика сохраняются. Полнота day/period/global и модели прежние; локальная история явно неполная. Не обещать offline cold boot или бесконечное хранение при запрете записи.'
docs=['project.md','app/CLAUDE.md','app/PRODUCT.md','База знаний/План.md','База знаний/Журнал обсуждений.md','База знаний/08 Решения.md','База знаний/07 Приложение и экосистема.md','База знаний/Техническое/Развёртывание.md','База знаний/Идеи и развитие.md']
idea='**I-064 / J-APP-133 — сохранность новых отметок состояния при большой истории.** 19 октября2026; источник — вопрос Альмиры после J-APP-132, рекомендация ассистента, затем прямое согласование защиты сегодняшней/неотправленного/черновиков и выпуска. Статус — реализовано T-APP-034 и опубликовано J-APP-134. Старые подтверждённые201/512КиБ, сегодняшняя и очередь вне бюджета; полный архив на сервере, холодная авторизация прежняя. Условие возврата — фактическая проблема хранения или новая потребность в offline-объёме. [Объём](../audit/next-checkin-cache-JAPP133/PROPOSAL.md), [проверки и выпуск](../audit/checkin-cache-release-JAPP134/RELEASE.md).'
for base in [R,C]:
 for rel in docs:
  p=base/rel;s=read(p);assert '**J-APP-134 /' not in s,rel
  if rel in ['app/CLAUDE.md','База знаний/07 Приложение и экосистема.md']:
   s=s.replace('Кэш не удаляется; новый pending/ACK сохраняется','Слияние сохраняет загруженные строки в памяти; долговечные подтверждённые копии ограничены по J-APP-131/J-APP-133. Новый pending/ACK сохраняется',1)
  s=s.replace('Статус — в работе. Ограничение только','Статус — выполнено и опубликовано J-APP-134. Ограничение только',1)
  if rel=='База знаний/План.md':s=s.replace('Следующий шаг — выбор Альмиры; реализация/публикация не назначены.','Историческое предложение принято Альмирой; T-APP-034 реализовано и опубликовано J-APP-134, ожидание выбора снято.',1)
  if rel=='База знаний/Идеи и развитие.md':
   lines=s.splitlines();found=False
   for n,line in enumerate(lines):
    if line.startswith('**I-064 /'):lines[n]=idea;found=True;break
   s='\n'.join(lines)+'\n'
   if not found:first,tail=s.split('\n',1);s=first+'\n\n'+idea+'\n'+tail
  else:
   prefix=''if rel=='project.md'else'../../'if rel=='База знаний/Техническое/Развёртывание.md'else'../'
   add=summary+f' [Выпуск и возврат]({prefix}audit/checkin-cache-release-JAPP134/RELEASE.md).'
   if rel in ['app/CLAUDE.md','База знаний/07 Приложение и экосистема.md']:add+='\n\n'+contract
   first,tail=s.split('\n',1);s=first+'\n\n'+add+'\n'+tail
  p.write_text(s,encoding='utf-8')
p=R/'audit/next-checkin-cache-JAPP133/PROPOSAL.md';s=read(p);first,tail=s.split('\n',1);p.write_text(first+'\n\n**Итог 19 октября2026:** реализовано J-APP-133/T-APP-034 и опубликовано J-APP-134. [Выпуск](../checkin-cache-release-JAPP134/RELEASE.md).\n'+tail,encoding='utf-8')
for folder,names in [
 ('checkin-cache-JAPP133',['REPORT.md','changes.patch','test-storage.cjs','storage-results.json','test-ui.py','ui-results.json','test-regressions.py','regression-storage.json','regression-path.json','regression-drafts.json','regression-diary.json','build.json']),
 ('checkin-cache-release-JAPP134',['RELEASE.md','manifest.json','activation-result.json','activate.cjs','prepare-release.py','verify-live.py','verify-api.py','verify-final.py','https.json','api.json','vercel.json','test-published.py','published-ui.json','navigation-retry.json','record-release.py']),
 ('next-checkin-cache-JAPP133',['PROPOSAL.md'])]:
 for name in names:
  src=R/'audit'/folder/name;dst=C/'audit'/folder/name;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,dst)
for f in ui['sourceHashes']:
 src=T/'before'/f;dst=C/'audit/checkin-cache-JAPP133/before'/f;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,dst)
subprocess.run(['git','diff','--check'],cwd=C,check=True)
print('PASS release assertions, nine docs and scoped evidence; published',publicChecks,'checks; previous diary',diaryChecks)
