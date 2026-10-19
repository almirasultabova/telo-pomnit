from pathlib import Path
import hashlib,json,shutil,subprocess
R=Path(__file__).resolve().parents[2];C=R/'output/silk-launch-release';H=Path(__file__).parent;T=R/'audit/save-status-JAPP135'
def read(p):return p.read_text(encoding='utf-8-sig')
def load(p):return json.loads(read(p))
ui=load(T/'ui-results.json');extra=load(T/'extra-ui.json');pub=load(H/'published-ui.json');https=load(H/'https.json');api=load(H/'api.json');activation=load(H/'activation-result.json');vercel=load(H/'vercel.json');build=load(T/'build.json')
assert ui['passed']and len(ui['runs'])==24 and sum(len(r['cases'])for r in ui['runs'])==120
assert len(extra)==4 and all(r['passed']for r in extra)and sum(len(r['cases'])for r in extra)==16
assert len(pub)==20 and all(r['passed']for r in pub);publicChecks=sum(len(r['cases'])for r in pub)
assert len(https)==270 and all(r['ok']for r in https)
assert sum(r.get('unauthenticatedStatus')==401 for r in api)==9 and all(r.get('installedHashMatches',True)for r in api)
assert vercel['readyState']=='READY'and not vercel['aliasError']and vercel['sha']=='7c76f988bc4dbc9de4e7153da3fa4c66d1299cd8'
assert not activation['backendChanged']and not activation['backendRestarted']and activation['migrations']==0 and activation['protectedFilesUnchanged']
assert read(T/'review.md').startswith('disposition: ship')and (T/'design-review.md').exists()and load(T/'detector.json')==[]
assert all(r['passed']for r in load(T/'regression-storage.json'))and all(r['passed']for r in load(T/'regression-checkin.json'))
assert sum(len(r['passed'])for r in load(T/'regression-drafts.json'))==20
for f,v in ui['sourceHashes'].items():
 assert hashlib.sha256((R/f).read_bytes()).hexdigest()==v,f
 if f!='app/index.html':assert (R/f).read_bytes()==(C/f).read_bytes(),f
assert build['storageUnchanged']and build['backendChanges']==0 and build['rootHTMLUnrelatedChangeExcluded']and build['cashPanelUnchanged']
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=C,text=True).strip()==vercel['sha']

report='''# J-APP-135 — понятное сохранение дневника и состояний

19 октября2026. Альмира: «Главное — понятно показывать, что сохранилось, а что ещё ждёт отправки. Черновики автоматически не отправляй. После проверок сразу можешь загрузить в приложение». Реализовано T-APP-035 / I-065, опубликовано J-APP-136. [Выпуск и возврат](../save-status-release-JAPP136/RELEASE.md).

## Что получает участница

На Главной под «Ваши наблюдения» появляется сообщение, если дневниковые записи, оценки состояния или их черновики требуют внимания. Оно учитывает старую очередь, даже если записи уже не входят в две последние карточки. «Проверить записи» открывает дочерний экран. В нём отдельно очередь и черновики; указаны тип, дата по Москве, заметка и исходные пять ответов.

У записи с фактической совпадающей копией — «Сохранено на этом устройстве. Ждёт отправки». Без доступной копии — «Пока только в открытом приложении», просьба не закрывать окно и копирование. Проверяется исходное содержимое/версия, а не один флаг наличия интернета или общая работоспособность localStorage. Нулевой список говорит только «Нет записей, ожидающих отправки», не обещает сохранность всех данных приложения.

«Повторить отправку» вызывает прежние flushPending/flushCheckinsPending только по явно выбранному действию. Открытие списка не читает полный архив и ничего не отправляет. Черновики получают «Продолжить» в прежнюю форму; новые очередные строки при просмотре/возврате не создаются. При серверном ACK запись исчезает из ожидающих, черновики не очищаются этим модулем. Отклонённые/конфликтные строки автоматически не повторяются, для исправляемого дневника доступен прежний ремонт.

«Скопировать» включает весь доступный текст и пять ответов. Успех показывается только после разрешённого clipboard.writeText. При отказе — подписанное readonly-поле с полным текстом и «Выделить текст»; успех копирования при этом не заявляется. Clipboard в тестах изолирован подставным объектом, настоящий системный буфер не читался/не менялся.

Только сервером связанный текущий владелец и текущая сессия. Выход/удаление очищают новый личный DOM. Поздний clipboard/повтор прежней сессии не рисует чужие данные. Черновики/реакции/AI/заметки после встреч/«К разбору» не выдаются за автоматически отправленные или покрытые общим статусом. Прежние фоновые очереди работают как раньше, новая функция их не запускает при чтении.

## Проверки и дизайн

- 24 прогона /120проверок Chromium320/390/1440 и WebKit390: очередь старше двух последних карточек, разные виды записей, draft-only/restore, неудачная отправка/ACK, пять ответов, безопасный текст, отказ clipboard и выделение, настоящий QuotaExceeded, сохранность прежнего снимка, reload и выход. [UI](ui-results.json), [сценарии](test-ui.py).
- Ещё4прогона /16проверок Chromium/WebKit: обе очереди удержаны во время выхода, поздние ответы не затрагивают другой аккаунт и его черновик; localStorage getter бросает SecurityError, список/копия/явный повтор работают без ложного «сохранено». [Дополнительные](extra-ui.json).
- Прежние20 Storage состояний,16 Storage дневника,17 периода пути и очередь;20 сценариев черновиков и28 UI quota/late ACK состояний. Исторические результаты после запуска восстановлены. [Storage](regression-storage.json), [черновики](regression-drafts.json), [состояния](regression-checkin.json).
- Принятая светлая природная айдентика, Cormorant/Manrope, читаемая иерархия,44px действия. Реальные mobile/desktop кадры после переходов; fallback WebKit проверен. Detector нового JS/CSS пуст; независимый finish reviewer — ship, обязательных правок0. Documenter подтвердил обычное расширение системы, DESIGN.md не переписывал. [Контракт](../../app/surfaces/save-status.md), [review](review.md), [дизайн](design-review.md), [метрики](visual-metrics.json).
- Только5исходников: новый JS/CSS,2строки app.js,1строка logout api.js и2подключения index.html. Сборка45site/90app, структура60 без предупреждений;6публичных файлов,2добавлены. storage.js/backend/права/оплата/LLM прежние. Прежняя локальная правка disclosure в root/index не включена в чистый выпуск. [Сборка](build.json), [интеграция](integration.patch).

## Границы

Это локальный список дневника и оценок состояния, не глобальная проверка всех устройств/разделов и не новый доступ ведущим. При запрете записи и недоступном сервере новое может остаться только в открытом окне; приложение честно предупреждает и предлагает копию, не обещает невозможную долговечность. Холодная проверка аккаунта по-прежнему серверная.

API/аккаунты в UI-тестах искусственные; настоящие записи, OpenAI и уведомления не использовались. Физический Telegram и его реальная clipboard-политика/сеть отдельно: проверены браузеры и ручной fallback, не заявлена проверка телефона. [Официальная граница Telegram](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app) сверена; SDK/initData/server auth не менялись. Физическая проверка не подменяется READY/HTTPS-хешами.
'''
(T/'REPORT.md').write_text(report,encoding='utf-8')
release='''# J-APP-136 — опубликован J-APP-135

19 октября2026. Прямое поручение Альмиры — понятно показывать сохранение и очередь, не отправлять черновики автоматически, выпустить после проверок. Код @CODE@, Vercel @DEPLOY@ READY, aliasError отсутствует. [Результат и границы](../save-status-JAPP135/REPORT.md).

## Выпуск и доказательства

- Чистый checkout367a42e получил5проверенных исходников. Из90публичных файлов изменены6: index.html,screen-review.html,js/app.js,js/api.js и новыеjs/save-status.js,css/save-status.css. Прежний88файловый набор сохранён,2добавлены. Сборка45site/90app, структура60 без предупреждений. Посторонняя локальная правка disclosure root HTML исключена; принятое публичное объяснение прежнее. [Manifest](manifest.json), [интеграция](../save-status-JAPP135/integration.patch).
- До выпуска120новых UI+16дополнительных проверок, прежние20+16+17Storage и очередь,20сценариев черновиков/28UI состояний. Detector[],finish reviewer ship,documenter подтверждает обычное расширение принятой системы. [Отчёт](../save-status-JAPP135/REPORT.md).
- Частный проверенный backup `@BACKUP@`: app/recovery. Сверены88предыдущих файлов каждого каталога, отсутствие2новых имён, все6staged-хешей, защищённые backend/схема/SQL/AI/наличные. nginx -t до/после.6файлов поставлены через tmp/rename,90итоговых хешей каждого каталога совпали; backend/PID прежние, миграций0. При ошибке активации удаляются только2точных новых публичных файла и восстанавливаются прежние архивы. [Активация](activation-result.json), [скрипт](activate.cjs).
- Vercel READY точного кода,270/270 HTTPS-хешей main/reserve/recovery совпали. Health200,9прямых/проксированных запросов401 и точные прежние runtime-хеши diary/checkins. [HTTPS](https.json), [API](api.json), [Vercel](vercel.json).
- Опубликованные ресурсы:20прогонов /@PUBLIC@проверок mainChromium390/1440/WebKit390, reserveChromium390; очередь/ACK/черновики/отказ копирования/полная квота/blocked store. Сетевой API и clipboard подставные; настоящий буфер/участнические данные не использовались. [Published UI](published-ui.json).
- Резервный Chromium проверен поHTTP/1.1 с --disable-http2; прежняя причина HTTP/2-таймаута не исправлялась. Новая тестовая БД не создавалась. Реальных тестовых рабочих записей/OpenAI/уведомлений0. Физический Telegram, clipboard и мобильная сеть отдельно; холодная авторизация серверная. Следующий пакет не разрабатывался.

## Возврат

Вернуть клиент367a42e на Vercel. В app/recovery убрать только точные новые файлы css/save-status.css и js/save-status.js (пути проверять внутри этих двух каталогов), восстановить соответствующие app-before/recovery-before архивы backup; сверить88publicBefore, nginx -t, health/401. Backend/БД/личные localStorage и черновики не восстанавливать/не очищать: этот пакет их схемы и хранение не менял. Личные записи не удаляются возвратом интерфейса.

Выпуск проверен и завершён. Финальное READY после коммита документации и8основных публичных хешей фиксируются root-only final-vercel.json/final-https.json без повторного цикла коммитов.
'''
for key,value in {'@CODE@':vercel['sha'],'@DEPLOY@':vercel['id'],'@BACKUP@':activation['backup'],'@PUBLIC@':str(publicChecks)}.items():release=release.replace(key,value)
(H/'RELEASE.md').write_text(release,encoding='utf-8')
summary=f'**J-APP-136 / J-APP-135 / T-APP-035 / I-065 — опубликовано.** 19 октября2026 по прямому поручению Альмиры на Главной доступны ожидающие отправки дневник/состояния и отдельные черновики. Показаны фактическая копия устройства либо только открытое окно; явный повтор прежних очередей, полный clipboard/fallback. Чтение не отправляет черновики и не читает архив; выход/поздние ответы защищены.120новых UI+16дополнительных,20прежних сценариев черновиков/28UI состояний,20published/{publicChecks}проверок и270HTTPS-хешей прошли; finish ship. Vercel READY, Beget/recovery с проверенным backup,90файлов. Хранение/backend/PID/БД/AI/наличные/права прежние; физический Telegram/clipboard отдельно. Выпуск завершён.'
contract='**Контракт J-APP-135 (опубликован J-APP-136):** SaveStatus читает только текущие локальные diary/checkins и form drafts body/checkin/repair, без API GET/POST при открытии. Домашнее сообщение учитывает старую очередь, не только2последние карточки. Статус устройства требует совпадения сохранённого payload/версии, memory-only не объявляется долговечным. Черновики отдельны, resume открывает прежнюю форму, не создаёт очередь. Retry использует прежние flush и retryBlocked, успех только реальный ACK. Copy содержит все5ответов/текст; отказ даёт readonly/выделение, не успех. Identity owner/generation/auth+epoch, logout/private clear инвалидируют DOM/поздние результаты. Нельзя называть этот экран глобальным «всё сохранено», расширять права ведущих или обещать физический Telegram по браузерному тесту.'
docs=['project.md','app/CLAUDE.md','app/PRODUCT.md','База знаний/План.md','База знаний/Журнал обсуждений.md','База знаний/08 Решения.md','База знаний/07 Приложение и экосистема.md','База знаний/Техническое/Развёртывание.md','База знаний/Идеи и развитие.md']
idea='**I-065 / J-APP-135 — видно, что ещё ждёт отправки.** 19 октября2026; источник — вопрос Альмиры после J-APP-134 и просьба объяснять простыми словами, рекомендация ассистента, затем прямое поручение. Статус — реализовано T-APP-035 и опубликовано J-APP-136. Главная/локальный список дневника и состояний, фактическое сохранение/временный текст, отдельные неавтоматические черновики, безопасный retry/copy/fallback и выход. Ожидаемая польза — меньше неопределённости и проще помощь; снижение обращений не измерено. Условие возврата — пользовательская проверка/фактическая проблема сохранения. [Объём](../audit/next-save-status-JAPP135/PROPOSAL.md), [выпуск](../audit/save-status-release-JAPP136/RELEASE.md).'
for base in [R,C]:
 for rel in docs:
  p=base/rel;s=read(p);assert '**J-APP-136 /'not in s,rel
  s=s.replace('Статус — в работе; только дневник/состояния','Статус — выполнено и опубликовано J-APP-136; только дневник/состояния',1)
  if rel=='База знаний/План.md':s=s.replace('Следующий шаг — выбор Альмиры, реализация/публикация не назначены.','Историческое предложение принято Альмирой; T-APP-035 реализовано и опубликовано J-APP-136, ожидание выбора снято.',1)
  if rel=='База знаний/Идеи и развитие.md':
   lines=s.splitlines();found=False
   for n,line in enumerate(lines):
    if line.startswith('**I-065 /'):lines[n]=idea;found=True;break
   s='\n'.join(lines)+'\n'
   if not found:first,tail=s.split('\n',1);s=first+'\n\n'+idea+'\n'+tail
  else:
   prefix=''if rel=='project.md'else'../../'if rel=='База знаний/Техническое/Развёртывание.md'else'../';add=summary+f' [Выпуск и возврат]({prefix}audit/save-status-release-JAPP136/RELEASE.md).'
   if rel in['app/CLAUDE.md','База знаний/07 Приложение и экосистема.md']:add+='\n\n'+contract
   first,tail=s.split('\n',1);s=first+'\n\n'+add+'\n'+tail
  p.write_text(s,encoding='utf-8')
p=R/'audit/next-save-status-JAPP135/PROPOSAL.md';s=read(p);first,tail=s.split('\n',1);p.write_text(first+'\n\n**Итог 19 октября2026:** J-APP-135/T-APP-035 реализован и опубликован J-APP-136; черновики автоматически не отправляются. [Выпуск](../save-status-release-JAPP136/RELEASE.md).\n'+tail,encoding='utf-8')
for folder,names in[
 ('save-status-JAPP135',['REPORT.md','integration.patch','build.json','test-ui.py','ui-results.json','test-regressions.py','regression-storage.json','regression-drafts.json','regression-checkin.json','extra-ui.json','capture.py','visual-metrics.json','detector.json','review.md','design-review.md']),
 ('save-status-release-JAPP136',['RELEASE.md','manifest.json','activation-result.json','activate.cjs','prepare-release.py','verify-live.py','verify-api.py','verify-final.py','https.json','api.json','vercel.json','test-published.py','published-ui.json','record-release.py']),
 ('next-save-status-JAPP135',['PROPOSAL.md'])]:
 for name in names:
  src=R/'audit'/folder/name;dst=C/'audit'/folder/name;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,dst)
for rel in ['release-before/app/index.html','release-before/app/js/app.js','release-before/app/js/api.js','before/app/index.html']:
 src=T/rel;dst=C/'audit/save-status-JAPP135'/rel;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,dst)
dst=C/'app/surfaces/save-status.md';dst.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(R/'app/surfaces/save-status.md',dst)
subprocess.run(['git','diff','--check'],cwd=C,check=True);print('PASS release assertions, nine project docs and surface contract; published',publicChecks,'checks')
