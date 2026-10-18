from pathlib import Path
import json,shutil
ROOT=Path(__file__).resolve().parents[2];REL=ROOT/'output/silk-launch-release';HERE=Path(__file__).parent
a=json.loads((HERE/'activation-result.json').read_text(encoding='utf-8'))
v=json.loads((HERE/'vercel.json').read_text(encoding='utf-8'))
h=json.loads((HERE/'https.json').read_text(encoding='utf-8'))
u=json.loads((HERE/'published-ui.json').read_text(encoding='utf-8'))
ai=json.loads((HERE/'ai-result.json').read_text(encoding='utf-8'))
assert len(h)==240 and all(x['ok']for x in h)
assert len(u)==4 and all(x['realApiRequests']==0 and not x['pageErrors']for x in u)
assert ai['status']=='PASS' and ai['providerCalls']==1 and ai['realDbReads']==ai['realDbWrites']==ai['diaryReads']==ai['notifications']==0
text=f'''# J-APP-073 — черновики опубликованы, живой AI проверен

18 октября2026. Прямое поручение Альмиры: опубликовать черновики с резервной копией, затем проверить AI после оплаты на искусственных данных, без настоящих дневников и уведомлений. Снята граница «пока не публиковать» только для кандидата J-APP-072.

## Выпуск и резерв

Функциональный commit `{v['sha']}` в GitHub main; Vercel `{v['id']}` READY, production alias подтверждён API. Чистый release-клон6dd7940 получил только проверенный app.js; локальные boot/storage совпадали с чистым выпуском и не менялись. На Beget и recovery атомарно заменены **js/app.js, index.html, screen-review.html**, 80 публичных файлов всего. Backend/БД/медиа/права/уведомления не менялись. PID backend прежний, перезапусков/миграций0. [Manifest](manifest.json), [результат установки](activation-result.json).

До push/первой публикации создан private backup **`{a['backup']}`**: два архива прежнего app/recovery и manifest. Каталог0700, файлы0600, списки архивов проверены. Все80 прежних файлов каждого дерева сверены до backup и повторно до записи; nginx -t до/после успешен, защищённые env/мониторинг не изменились. [Установщик с повторным использованием предварительного backup и rollback](activate.cjs).

## Проверка опубликованной версии

- Сборка80, source/built structure48/50, JS syntax и diff-check PASS. Полные 26 сценариев черновика и8 пограничных проверок J-APP-072 не повторялись: перенесён именно их проверенный hash.
- Все **80/80 файлов main/reserve/recovery** совпали через HTTPS с нормализацией переносов текстов, TLS включён. Health200, доступ без авторизации401. [Хеши](https.json).
- Опубликованный учебный UI: Chromium на всех трёх адресах и WebKit на основном — возврат заметки/оценки, удаление и Save/ACK учебного примера PASS. Настоящий API заблокирован, реальных запросов0. [Результат](published-ui.json). Первое открытие preview path-empty переключало вкладку в тестовом harness; исправлена точка входа harness на home-pending, код продукта не менялся.
- Физический Telegram iPhone/Android остаётся приёмкой владельца. Черновики доступны на том устройстве; при запрете хранилища после закрытия не обещается восстановление.

## AI после оплаты

После проверки выпуска отдельно запущен один процесс на рабочем сервере, **без listener и без настоящей БД**. Он использовал существующий ключ из backend-env и **установленные** ai.js/me.js/auth.js, хеши сверены с release-клоном. БД полностью заменена строгой моделью в памяти, JWT имеет отдельный случайный secret, аккаунт HOST искусственный. Настоящий ключ/JWT/дневники не выводились и не копировались. Изменения постоянных ролей/аккаунтов не выполнялись.

Нативный POST /ai/chat с contextMode=none получил **HTTP200** и непустой ответ OpenAI **`{ai['provider']['model']}`**. Один provider-запрос, **{ai['provider']['usage']['total_tokens']} токенов** ({ai['provider']['usage']['prompt_tokens']} входных + {ai['provider']['usage']['completion_tokens']} выходных), store=false, история до запроса пустая. Наружу допускались только два сообщения: штатный system prompt и вымышленный текст про напряжение плеч после рабочего дня. Обращений к дневнику/реальной БД/уведомлениям0. Нативный GET истории вернул пару message/reply из памяти. У неавторизованного запроса401 и providerCalls0. [Безопасные метаданные и вымышленный ответ](ai-result.json), [изолированная проверка](ai-probe.cjs).

Полученный ответ отдельно воспроизведён в опубликованном frontend на учебной странице Chromium/WebKit: отправка, очистка ввода и возврат из истории PASS. **Это воспроизведение результата в UI, не второй платный вызов и не вход реальной участницы.** [Результат](ai-ui.json). Содержимое двух настоящих аккаунтов, их анкеты/гранты и физический Telegram не проверялись этим опытом. Точный денежный баланс не читался; подтверждена доступность одного настоящего запроса с текущим ключом на момент проверки. Прежний insufficient_quota15октября не является текущим состоянием.

После результата дополнительных генераций не делали. В локальные helpers добавлен обязательный --live-confirmed, чтобы их случайный запуск не тратил квоту. Никаких изменений ключа, модели, провайдера, лимитов или автопополнения.

## Откат и проверка владельцем

Вернуть Vercel `{v['previousId']}` (6dd7940); на Beget восстановить три изменённых файла из двух соответствующих архивов private backup через staging/atomic rename, nginx -t, сверить before-manifest. Backend/БД не откатывать: их этот выпуск не менял.

Полностью закрыть и снова открыть Mini App: начать заметку/изменить оценку → выйти → вернуться; затем сохранить. Черновик и серверное подтверждение различаются. AI можно проверить своим коротким сообщением с режимом «Без дневника».

Документальный коммит после выпуска не меняет публичные исходники; его точный READY/хеши дополнительно сохраняются в ignored output/draft-release-JAPP073, чтобы не запускать бесконечные документальные деплои.
'''
(HERE/'RELEASE.md').write_text(text,encoding='utf-8')
block='**J-APP-073 — черновики опубликованы с backup; живой AI ответил.** По прямому поручению18октября выпущен J-APP-072: commit a2bb2e1, Vercel READY, Beget/recovery с предварительным private backup. Ровно app.js и два bundled HTML,80/80 каждого из трёх адресов сверены; опубликованный учебный UI Chromium3адреса/WebKitmain PASS. Backend/права/реальные данные/уведомления не менялись. После выпуска один настоящий запрос текущим ключом к gpt-4o-mini получил200/непустой ответ,219токенов; нативные handlers и история проверены с БД/аккаунтом в памяти, context=none, настоящие дневники/БД/уведомления0. UI ответа/истории проверен воспроизведением без второго provider-вызова. Денежный баланс не читался. Следующий шаг — физическая приёмка владельца в Telegram; прежние локальные статусы ниже являются историей.'
docs={'project.md':'audit/draft-release-JAPP073/RELEASE.md','База знаний/План.md':'../audit/draft-release-JAPP073/RELEASE.md','База знаний/Журнал обсуждений.md':'../audit/draft-release-JAPP073/RELEASE.md','База знаний/07 Приложение и экосистема.md':'../audit/draft-release-JAPP073/RELEASE.md','База знаний/08 Решения.md':'../audit/draft-release-JAPP073/RELEASE.md','База знаний/Техническое/Развёртывание.md':'../../audit/draft-release-JAPP073/RELEASE.md','app/CLAUDE.md':'../audit/draft-release-JAPP073/RELEASE.md'}
for root in [ROOT,REL]:
    for name,link in docs.items():
        file=root/name;s=file.read_text(encoding='utf-8');head,sep,tail=s.partition('\n')
        if not tail.lstrip().startswith('**J-APP-073'):file.write_text(head+'\n\n'+block+' [Доказательства и откат]('+link+').\n'+tail,encoding='utf-8')
    file=root/'База знаний/Техническое/OpenAI — квота и восстановление.md'
    if not file.exists():
        file.parent.mkdir(parents=True,exist_ok=True)
        file.write_text((ROOT/'База знаний/Техническое/OpenAI — квота и восстановление.md').read_text(encoding='utf-8'),encoding='utf-8')
    s=file.read_text(encoding='utf-8');head,sep,tail=s.partition('\n')
    note='**18октября2026, J-APP-073 — после сообщённой оплаты AI проверен живым запросом.** Установленный ai/chat с текущим ключом сервера:200, непустой ответ gpt-4o-mini-2024-07-18,1запрос/219токенов/store=false. Только вымышленное сообщение и штатный system prompt, context=none; БД/аккаунт/история в памяти, настоящие дневники/БД/уведомления0. История native handler и UI-воспроизведение ответа PASS. Ключ/модель/провайдер не менялись, денежный баланс не читался; физический Telegram остаётся владельцу. Прежние недостаток квоты/ожидание зачисления ниже — история15октября, не текущая диагностика. [Проверка](../../audit/draft-release-JAPP073/RELEASE.md).'
    if not tail.lstrip().startswith('**18октября2026, J-APP-073'):file.write_text(head+'\n\n'+note+'\n'+tail,encoding='utf-8')
for root in [ROOT,REL]:
    file=root/'audit/checkin-draft-JAPP072/REPORT.md'
    s=file.read_text(encoding='utf-8');head,sep,tail=s.partition('\n')
    if not tail.lstrip().startswith('**Продолжение J-APP-073'):
        file.write_text(head+'\n\n**Продолжение J-APP-073:** по отдельному поручению18октября кандидат опубликован с резервной копией; затем живой AI проверен на искусственных данных. [Выпуск и ограничения](../draft-release-JAPP073/RELEASE.md). Ниже сохранён локальный этап до согласования выпуска.\n'+tail,encoding='utf-8')
shutil.copytree(HERE,REL/'audit/draft-release-JAPP073',dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__'))
print('Recorded production draft release and one successful live AI call; unrelated root changes preserved')
