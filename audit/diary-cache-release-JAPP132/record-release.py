from pathlib import Path
import hashlib,json,shutil,subprocess

R=Path(__file__).resolve().parents[2];C=R/'output/silk-launch-release';H=Path(__file__).parent;T=R/'audit/diary-cache-JAPP131'
def read(p):return p.read_text(encoding='utf-8-sig')
def load(p):return json.loads(read(p))
ui=load(T/'ui-results.json');storage=load(T/'storage-results.json');pub=load(H/'published-ui.json');https=load(H/'https.json');api=load(H/'api.json');activation=load(H/'activation-result.json');vercel=load(H/'vercel.json')
assert storage['passed'] and storage['groups']==16
assert ui['passed'] and len(ui['runs'])==20 and all(r['passed'] for r in ui['runs'])
assert sum(len(r['cases']) for r in ui['runs'])==100
assert len(pub)==16 and all(r['passed'] for r in pub) and sum(len(r['cases']) for r in pub)==76
assert len(https)==264 and all(r['ok'] for r in https)
assert sum(r.get('unauthenticatedStatus')==401 for r in api)==9 and all(r.get('installedHashMatches',True) for r in api)
assert vercel['readyState']=='READY' and vercel['sha']=='63b01610132df306678c1d026fab5ec1c0d3f084' and not vercel['aliasError']
assert not activation['backendChanged'] and not activation['backendRestarted'] and activation['migrations']==0 and activation['protectedFilesUnchanged']
for f,v in ui['sourceHashes'].items():
 assert hashlib.sha256((R/f).read_bytes()).hexdigest()==v,f
 assert (R/f).read_bytes()==(C/f).read_bytes(),f
assert all(r['passed'] for r in load(T/'regression-storage.json'))
assert sum(len(r['cases']) for r in load(T/'regression-ui.json'))==32
assert sum(len(r['passed']) for r in load(T/'regression-drafts.json'))==20
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=C,text=True).strip()==vercel['sha']

report='''# J-APP-131 — защита очереди и черновиков при большой истории

19 октября 2026. Поручение Альмиры: «Ограниченная история без интернета подходит, главное — сохранить неотправленные записи и черновики. После проверок сразу можешь загрузить в приложение». Реализовано T-APP-033 / I-063 и опубликовано J-APP-132. [Выпуск и возврат](../diary-cache-release-JAPP132/RELEASE.md).

## Поведение

Ограничивается только сохраняемая на устройстве копия подтверждённого diary_v2: до 90 недавних записей и 512 КиБ оценочного UTF-16 JSON, включая подтверждение. Записи с очень длинным текстом могут дать меньший набор. В памяти открытой сессии остаются все загруженные строки, полный серверный архив доступен по прежнему API. Статусы полноты дня, периода и полного архива не меняются. Локальный fallback явно сообщает, что история устройства может быть неполной, а полная история, поиск и «Важное» доступны после подключения.

Сокращать можно только копии, полученные через серверный GET или точный ACK текущего владельца. receipt v1 содержит owner и снимок полей; при изменении содержимого, неверном владельце/версии, неизвестных полях или неподтверждённом старом synced такая строка защищена. Это локальное происхождение копии, а не новый протокол серверной подписи. Старые неизвестные данные автоматически подтверждёнными не объявляются.

Pending, ошибки, неопределённые строки и черновики не входят в бюджет и не удаляются ради лимита. При отказе записи подтверждённый набор постепенно уменьшается вплоть до нуля. Операция заменяет один ключ и проверяет readback; она не вызывает removeItem, не чистит чужого владельца, старые бесхозные ключи или отдельные черновики. При QuotaExceeded и невозможности вместить защищённые данные прежний долговечный снимок сохраняется; новое остаётся в памяти с существующим предупреждением.

AppLocalStorage сохраняет доступный дескриптор для чтения, если проверочная запись не проходит из-за квоты; заблокированный getter по-прежнему обрабатывается безопасно. Черновик телесной записи очищается после долговечной очереди либо подходящего ACK. При memory-only сохраняется существующий долговечный черновик; повтор его отправки использует уже созданный clientId. Поздний ACK не очищает более новый текст, а новая намеренная запись не дедуплицируется как восстановленный черновик.

## Проверки

- 16 Storage-групп: точность receipt, 90/512 КиБ, пять reload-сессий, pending/ошибки/неизвестные данные, чужой владелец, версии, quota/retry/пустой подтверждённый набор, прежний снимок при отказе, полный store при запуске, readback mismatch, поздний ACK. [Результат](storage-results.json).
- На 1000 искусственных заметках по 6000 символов: 12 291 562 → 523 494 оценочных UTF-16 байта, 21 подтверждённая копия на диске и все 1000 строк в памяти. На заметках по 20 000 символов — 3–6 копий в зависимости от экранирования JSON. Это размер сохранённого JSON, не измерение памяти/скорости телефона. [Измерения](measurement.json).
- 20 браузерных прогонов / 100 проверок: Chromium 320/390/1440 и WebKit 390, пять режимов. Настоящий localStorage заполнялся до QuotaExceeded без подмены квоты; проверены запись очереди, reload и восстановление черновика, отказ истории, memory-only, повтор clientId, поздний ACK и заблокированное хранилище. [UI](ui-results.json), [сценарии](test-ui.py).
- Прежние Storage: 17 «Мой путь», 18 «Дневник сегодня», 12 «Последние состояния» и очередь наблюдений. Также 32 прежних UI-проверки «Моего пути» и 20 сценариев черновиков Chromium/WebKit. [Storage](regression-storage.json), [Путь](regression-ui.json), [Черновики](regression-drafts.json).
- Сборка 45 site / 88 app и структура 58 без предупреждений. Только четыре исходных JS; шесть публичных файлов из-за сборки HTML. [Сборка](build.json), [изменения](changes.patch).

## Границы

Проверка аккаунта при холодном запуске по-прежнему требует сервера. Reload-тесты подтверждают сохранность локальных данных после настоящей перезагрузки документа при разрешённой тестовой авторизации и отказе diary/history; они не доказывают холодный вход в Telegram в авиарежиме. Физический Telegram, мобильные сети и время телефона не проверены. В тестах — искусственные владельцы, сетевой API подставной; настоящая БД, записи участниц, OpenAI и уведомления не использовались. Если устройство полностью запрещает запись или очередь сама превышает доступное место, неограниченная долговечность невозможна; честный memory-only остаётся. Бюджет касается подтверждённых копий на диске; защищённые данные и оперативная память этим лимитом не ограничены.
'''
(T/'REPORT.md').write_text(report,encoding='utf-8')
release='''# J-APP-132 — опубликован J-APP-131

19 октября 2026. Прямое согласование Альмиры — ограниченная offline-история с приоритетом неотправленных записей и черновиков; публикация после проверок разрешена. Код 63b01610132df306678c1d026fab5ec1c0d3f084, Vercel dpl_Cev9Ejn2izZwwyVBZSxdDrb1DuCt READY, aliasError отсутствует. [Поведение, тесты и границы](../diary-cache-JAPP131/REPORT.md).

Подтверждённые локальные копии дневника ограничены 90 записями / 512 КиБ UTF-16 JSON; pending/ошибки/черновики/неизвестные старые данные защищены. При квоте приложение читает прежние данные и сокращает только подтверждённые копии. Memory-only не очищает сохранённый черновик; повтор и поздний ACK проверены. Полный серверный архив и открытая история в памяти сохраняются.

## Выпуск и доказательства

- Чистая база 1a2478e получила четыре проверенных JS: storage, boot (только адаптер хранилища), observation-drafts, diary-history. Из 88 публичных файлов изменены ровно 6: эти четыре JS, index.html и screen-review.html. Публичная панель наличных прежняя. Сборка/структура прошли. [Manifest](manifest.json).
- До публикации 16 Storage-групп и 100 новых UI-проверок; прежние 17+18+12 Storage, очередь, 32 UI «Моего пути», 20 сценариев черновиков. [Результаты](../diary-cache-JAPP131/REPORT.md).
- Проверенный частный backup `/root/telo-backups/diary-cache-JAPP132-2026-10-19T160416463Z`: app/recovery. До/после активации nginx -t, точная сверка всех 88 файлов каждого каталога и защищённых backend/схемы/SQL/AI/наличных. Шесть файлов установлены через временные файлы и атомарное переименование. Backend и PID прежние, миграций 0. [Активация](activation-result.json), [скрипт](activate.cjs).
- Vercel READY точного кода, 264/264 HTTPS-хеша main/reserve/recovery совпали. Health 200; 9 прямых/проксированных запросов без авторизации вернули 401; принятые diary/checkins runtime-хеши прежние. [HTTPS](https.json), [API](api.json), [Vercel](vercel.json).
- Опубликованные ресурсы: 16 прогонов / 76 проверок, main Chromium 390/1440 и WebKit390, reserve Chromium390; ограниченный кэш, фактическая квота, восстановление черновика и blocked storage. Синтетический API, реальных записей/сообщений 0. Исправлены только детали тестового стенда: определение owner-scoped ключа и настоящий reload при Telegram hash. [Published UI](published-ui.json).
- Резервный Chromium проверен по HTTP/1.1 с --disable-http2; прежняя причина HTTP/2-таймаута остаётся неустановленной. Новой тестовой БД/роли в этом пакете не создавалось, рабочие строки не трогались. Новых зависимостей/LLM/схемы/прав/оплаты нет.

Холодная серверная проверка аккаунта прежняя; работа полностью без сети с первого запуска этим пакетом не добавлена. Локальные reload-тесты используют разрешённую тестовую авторизацию при недоступной истории. Физический Telegram и время телефона отдельно. Полностью недоступное хранилище не даёт гарантии новой долговечной записи: предупреждение memory-only сохраняется.

## Возврат

Вернуть предыдущий клиент 1a2478e на Vercel, а app/recovery — из соответствующих архивов backup; сверить publicBefore в manifest, health/401 и nginx -t. Backend/БД не откатывать: они этим пакетом не менялись. Не восстанавливать серверные рабочие данные поверх новых записей. Локальные owner-scoped ключи/черновики пользователя при возврате не очищать. Автовосстановление файлов при ошибке активации есть в activate.cjs. Ограничение уже удалённых подтверждённых offline-копий возврат само не отменяет — полный архив дочитывается с сервера после подключения.

Выпуск проверен и завершён. Следующий пакет в этом ходе не разрабатывался. Финальное состояние Vercel после коммита документации и 7 основных публичных хешей фиксируются отдельными final-vercel.json / final-https.json в рабочем аудите без повторного цикла коммитов.
'''
(H/'RELEASE.md').write_text(release,encoding='utf-8')

summary='**J-APP-132 / J-APP-131 / T-APP-033 / I-063 — опубликовано.** 19 октября 2026 по прямому поручению Альмиры подтверждённые локальные копии дневника ограничены 90 записями / 512 КиБ; неотправленные, ошибки, черновики и неопределённые старые данные защищены. Полный store читается при отказе probe; memory-only сохраняет существующий черновик, повтор clientId и поздний ACK проверены. Полный серверный архив/история открытой сессии прежние. 16 Storage,100 новых UI,32 прежних UI пути,20 сценариев черновиков,16 published/76 проверок и264 HTTPS-хеша прошли. Vercel READY, Beget/recovery с проверенным backup; backend/PID/БД/AI/наличные прежние. Холодная проверка аккаунта требует сервера; физический Telegram отдельно. Выпуск завершён.'
contract='**Контракт J-APP-131 (опубликован J-APP-132):** бюджет применяется только при _writeDiary к доказанным подтверждённым копиям текущего owner: максимум90 и512КиБ по JSON UTF-16, включая receipt v1 точного снимка GET/ACK. Старый synced/неизвестные поля/неверные owner/version/изменённое содержимое защищены. Pending/ошибки/неизвестные данные не бюджетируются; отдельные черновики/чужие и бесхозные ключи не чистятся. Quota уменьшает только подтверждённые копии до0; чтение доступного store сохраняется при отказе write-probe, запись проверяет readback. Memory-only не очищает долговечный черновик; повтор восстановленного черновика использует тот же clientId, подходящий ACK не стирает новый текст. Массив в памяти, полнота day/period/global и серверный архив не ограничены этим бюджетом. Локальный fallback сообщает неполноту. Холодная авторизация по-прежнему серверная; не обещать offline cold boot или долговечность при полностью недоступной записи. Прежние названия legacy localStorage ниже не заменяют этот owner-scoped diary_v2 контракт.'
docs=['project.md','app/CLAUDE.md','app/PRODUCT.md','База знаний/План.md','База знаний/Журнал обсуждений.md','База знаний/08 Решения.md','База знаний/07 Приложение и экосистема.md','База знаний/Техническое/Развёртывание.md','База знаний/Идеи и развитие.md']
idea='**I-063 / J-APP-131 — сохранность новых записей при большой истории.** 19 октября 2026; источник — вопрос Альмиры о следующем пакете после J-APP-130, рекомендация ассистента; затем прямое согласование ограниченной offline-истории с приоритетом очереди/черновиков. Статус — реализовано T-APP-033 и опубликовано J-APP-132; 90/512КиБ только для доказанно подтверждённых копий, неизвестные старые данные защищены. Полный архив на сервере, холодная проверка аккаунта прежняя. Условие возврата — новая потребность в offline-объёме либо фактическая проблема хранения. [Объём](../audit/next-cache-JAPP131/PROPOSAL.md), [проверки и выпуск](../audit/diary-cache-release-JAPP132/RELEASE.md).'
for base in [R,C]:
 for rel in docs:
  p=base/rel;s=read(p);assert '**J-APP-132 /' not in s,rel
  s=s.replace('статус — в работе. [Предложение и критерии]','статус — выполнено и опубликовано J-APP-132. [Предложение и критерии]',1)
  if rel=='База знаний/План.md':s=s.replace('Следующий шаг — выбор Альмиры и принятие этой границы. Реализация/публикация не назначены.','Историческое предложение принято Альмирой; реализовано T-APP-033 и опубликовано J-APP-132, ожидание выбора снято.',1)
  if rel=='База знаний/Идеи и развитие.md':
   lines=s.splitlines();found=False
   for n,line in enumerate(lines):
    if line.startswith('**I-063 /'):lines[n]=idea;found=True;break
   s='\n'.join(lines)+'\n'
   if not found:first,tail=s.split('\n',1);s=first+'\n\n'+idea+'\n'+tail
  else:
   prefix='' if rel=='project.md' else '../../' if rel=='База знаний/Техническое/Развёртывание.md' else '../'
   add=summary+f' [Выпуск и возврат]({prefix}audit/diary-cache-release-JAPP132/RELEASE.md).'
   if rel in ['app/CLAUDE.md','База знаний/07 Приложение и экосистема.md']:add+='\n\n'+contract
   first,tail=s.split('\n',1);s=first+'\n\n'+add+'\n'+tail
  p.write_text(s,encoding='utf-8')
p=R/'audit/next-cache-JAPP131/PROPOSAL.md';s=read(p);first,tail=s.split('\n',1);p.write_text(first+'\n\n**Итог 19 октября2026:** реализовано J-APP-131 / T-APP-033 и опубликовано J-APP-132; подтверждённые копии90/512КиБ, очередь и черновики защищены. [Выпуск](../diary-cache-release-JAPP132/RELEASE.md).\n'+tail,encoding='utf-8')

# Copy only scoped reproducible audit evidence. No screenshots, staged public files,
# secrets, historical result overwrites or unrelated worktree edits.
for folder,names in [
 ('diary-cache-JAPP131',['REPORT.md','changes.patch','measure.cjs','measurement.json','test-storage.cjs','storage-results.json','test-ui.py','ui-results.json','test-regressions.py','regression-storage.json','regression-ui.json','regression-drafts.json','build.json']),
 ('diary-cache-release-JAPP132',['RELEASE.md','manifest.json','activation-result.json','activate.cjs','prepare-release.py','verify-live.py','verify-api.py','verify-final.py','https.json','api.json','vercel.json','test-published.py','published-ui.json','record-release.py']),
 ('next-cache-JAPP131',['PROPOSAL.md'])]:
 for name in names:
  src=R/'audit'/folder/name;dst=C/'audit'/folder/name;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,dst)
for f in ui['sourceHashes']:
 src=T/'before'/f;dst=C/'audit/diary-cache-JAPP131/before'/f;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,dst)
subprocess.run(['git','diff','--check'],cwd=C,check=True)
print('PASS all release assertions; nine docs and scoped audit evidence recorded in root and clean checkout')
