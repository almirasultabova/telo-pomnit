from pathlib import Path
import json,shutil
ROOT=Path(__file__).resolve().parents[2];REL=ROOT/'output/silk-launch-release';HERE=Path(__file__).parent
a=json.loads((HERE/'activation-result.json').read_text(encoding='utf-8'));v=json.loads((HERE/'vercel.json').read_text(encoding='utf-8'));https=json.loads((HERE/'https.json').read_text(encoding='utf-8'));ui=json.loads((HERE/'published-ui.json').read_text(encoding='utf-8'))
assert len(https)==240 and all(x['ok']for x in https)
assert len(ui)==2 and all(x['realApiRequests']==0 and not x['pageErrors']for x in ui)
assert v['sha']=='7dfc0cf3759f61bd58656003803bd79265d9b1c9'and v['state']=='READY'
block='**J-APP-071 / A22 — согласованный контраст опубликован с резервной копией.** 18 октября Альмира приняла J-APP-070 и прямо поручила выпуск. Только шесть CSS и два bundled HTML: статус, необходимые границы, слабые подписи/placeholder, подложка приветствия и focus. Commit7dfc0cf в main; Vercel READY на точном SHA, Beget/recovery обновлены с private backup. 80/80 файлов каждого из трёх адресов совпали по HTTPS; опубликованный synthetic UI Chromium на основном и резервном адресах PASS. Дополнительные recovery/WebKit-прогоны не завершились; физическая приёмка отдельно. Backend/БД/данные/медиа/права не менялись, перезапусков/миграций/тестовых отправок0. Следующий шаг — приёмка владельцем в Telegram.'
text=f'''# J-APP-071 — контраст опубликован с резервной копией

18 октября2026. Источник: «Мне нравится. Опубликуй исправления контраста с резервной копией, я проверю в Telegram». Ограничение J-APP-070 снято только для принятого CSS-кандидата.

## Выпуск

Функциональный commit `{v['sha']}` отправлен в GitHub main. Vercel production `{v['id']}`, READY на точном SHA; alias `tg-app-telo-pomnit.vercel.app` подтверждён API. На Beget `/var/www/telo-app` и `/var/www/telo-app/recovery/j293` обновлены ровно8 публичных ресурсов:6 CSS и2 bundled HTML. Всего80 публичных файлов. Backend, схема, JS, медиа, auth/права и настоящие данные не изменялись. [Состав](manifest.json), [Vercel](vercel.json).

Изолированный чистый release-клон11dc597 получил только шесть файлов из принятого просмотра после сверки исходных/утверждённых хешей. Чужие накопленные правки корневого дерева не копировались. Публичный пакет не содержит compare-просмотр, документы базы, локальные fixtures или private media.

## Резерв и установка

Private backup `{a['backup']}`: app-before.tar.gz, recovery-before.tar.gz и before-manifest.json. Каталог0700, архивы/manifest0600; оглавления архивов прочитаны. Перед первой записью повторно сверены все80 прежних файлов каждого дерева; перед/после — nginx -t. CSS устанавливался через временный файл/chmod0644/atomic rename, HTML после CSS. Все80 установленных файлов совпали. PID/online backend и защищённые .env/мониторинг прежние, БД/миграции/перезапуск не требовались. [Результат](activation-result.json).

## Проверки

- Сборка80, source/built structure48/50, JS syntax/diff-check — без ошибок. Изменённые6 CSS совпали с принятым кандидатом; новых зависимостей/контента/размеров нет.
- Уже выполненные52 состояния/56 границ/72 фоновые проверки J-APP-070 не повторялись; проверено именно встраивание в сборку и опубликованный UI.
- Локальная сборка: Chromium/WebKit, статус/focus, pre-шкала/выбор, feedback и AI-placeholder PASS. [Данные](local-ui.json).
- Через HTTPS/TLS **80/80 файлов каждого из main/reserve/recovery** совпали с manifest, текст с нормализацией CRLF/LF, бинарные точно. Health200, доступ без авторизации401. [Хеши](https.json).
- Опубликованный учебный UI: Chromium на основном и резервном адресах —2 группы ×4 состояния PASS, запросов к настоящему API/уведомлений/AI0. [Данные](published-ui.json). Дополнительный recovery-прогон дважды прервался на навигационном timeout; WebKit-прогон прервался на закрытии страницы/браузера. Успешные main/reserve не запускались заново. В это время свободной RAM было около0,35ГБ; причинная связь со всеми отказами не установлена. Recovery80/80 файлов уже сверены отдельно по HTTPS/TLS. Полный WebKit-прогон этой же сборки до публикации PASS. Незавершённые опубликованные прогоны не объявлены успешными и остаются отдельной проверкой.

Документальный коммит после выпуска не меняет публичные исходники. Физические Telegram iPhone/Android остаются приёмкой владельца; успешный браузерный тест не объявлен физической проверкой. Живой OpenAI не проверялся.

## Проверка владельцем и откат

Полностью закрыть Mini App и снова открыть из бота. Проверить подпись «Идёт поток», границы анкеты/выбранные оценки, подсказку AI и подписи Профиля. Публикуемый index содержит CSS внутри, а HTML получает no-cache/no-store.

Откат: вернуть прежний READY Vercel `{v['previousId']}` (11dc597); на Beget взять8 изменённых ресурсов из соответствующих архивов через private staging и атомарную замену, nginx -t, сверить прежний manifest. Backend и БД не откатывать: этот выпуск их не менял. Полный before-manifest и автоматический rollback на ошибку включены в [установщик](activate.cjs).
'''
(HERE/'RELEASE.md').write_text(text,encoding='utf-8')
docs={'project.md':'audit/contrast-release-JAPP071/RELEASE.md','База знаний/План.md':'../audit/contrast-release-JAPP071/RELEASE.md','База знаний/07 Приложение и экосистема.md':'../audit/contrast-release-JAPP071/RELEASE.md','База знаний/08 Решения.md':'../audit/contrast-release-JAPP071/RELEASE.md','app/CLAUDE.md':'../audit/contrast-release-JAPP071/RELEASE.md','База знаний/Техническое/Развёртывание.md':'../../audit/contrast-release-JAPP071/RELEASE.md','audit/10-ISSUE-REGISTER.md':'contrast-release-JAPP071/RELEASE.md'}
for base in [ROOT,REL]:
 for name,link in docs.items():
  p=base/name
  if not p.exists():continue
  s=p.read_text(encoding='utf-8')
  if '**J-APP-071 / A22'in s:continue
  title,rest=s.split('\n',1);p.write_text(title+'\n\n'+block+' [Выпуск/backup/откат]('+link+').\n'+rest,encoding='utf-8')
 p=base/'База знаний/Журнал обсуждений.md';s=p.read_text(encoding='utf-8');title,rest=s.split('\n',1)
 if '## J-APP-071 —'not in s:p.write_text(title+'\n\n## J-APP-071 — контраст принят и опубликован с backup\n\n'+block+' [Доказательства](../audit/contrast-release-JAPP071/RELEASE.md). Прежнее «не публиковать» снято прямым поручением только для согласованного объёма. Приёмка Telegram остаётся у владельца.\n'+rest,encoding='utf-8')
 p=base/'app/DESIGN.md';s=p.read_text(encoding='utf-8')
 if '  control-border:'not in s:s=s.replace('  text-secondary: "#726A60"','  text-secondary: "#726A60"\n  control-border: "#7B8273"')
 marker='## Текущий визуальный контракт — 15 октября 2026\n';assert marker in s
 s=s if '**J-APP-071,18октября'in s else s.replace(marker,marker+'\n**J-APP-071,18октября — принятый контраст опубликован.** Локальный кандидат J-APP-070 принят владельцем, выпуск7dfc0cf/Vercel READY/Beget с backup проверен. Control-border #7B8273 отличается от декоративного line, состояния/палитра/фото/размеры сохранены. [Выпуск](../audit/contrast-release-JAPP071/RELEASE.md). Ниже прежние статусы кандидатов — история; физическая приёмка отдельно.\n',1);p.write_text(s,encoding='utf-8')
 p=base/'audit/contrast-JAPP070/REPORT.md';s=p.read_text(encoding='utf-8');title,rest=s.split('\n',1)
 if '**Последующий статус J-APP-071:**'not in s:p.write_text(title+'\n\n**Последующий статус J-APP-071:** кандидат принят и опубликован с резервной копией по отдельному поручению. [Выпуск/откат](../contrast-release-JAPP071/RELEASE.md). Ниже сохранён исторический срез локальной проверки.\n'+rest,encoding='utf-8')
target=REL/'audit/contrast-release-JAPP071';target.mkdir(exist_ok=True)
for p in HERE.iterdir():
 if p.is_file()and p.suffix in ['.py','.cjs','.json','.md']:shutil.copy2(p,target/p.name)
print('Release result recorded in both working context and clean release repository; unrelated root files not copied')
