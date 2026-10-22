from pathlib import Path
import json,hashlib,subprocess,re,shutil
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent;C=R/'output/silk-launch-release';D=R/'audit/product-context-20261022'
m=json.loads((H/'manifest.json').read_text(encoding='utf-8'))
def sha(p):return hashlib.sha256(p.read_bytes().replace(b'\r\n',b'\n')).hexdigest()
assert sha(R/'app/access-admin.html')==m['sourceBefore']['app/access-admin.html'],'Root runtime drift'
assert sha(C/'app/access-admin.html')==m['sourceAfter']['app/access-admin.html']
for name,n in [('local-service-checks.json',34),('main-service-checks.json',34),('reserve-service-checks.json',34),('local-admission-checks.json',56),('main-admission-checks.json',56),('reserve-admission-checks.json',56)]:
 rows=json.loads((H/name).read_text(encoding='utf-8'));assert sum(len(r.get('groups',[]))or 1 for r in rows)==n
assert len(json.loads((H/'https.json').read_text()))==300
assert all(r['ok']for r in json.loads((H/'https.json').read_text()))
assert json.loads((H/'backup-verification.json').read_text())['passed']
assert len(json.loads((H/'no-marks.json').read_text()))==2
(R/'app/access-admin.html').write_bytes((C/'app/access-admin.html').read_bytes())
commit=subprocess.check_output(['git','-C',str(C),'rev-parse','HEAD'],text=True).strip();(H/'functional-commit.txt').write_text(commit+'\n')
authorization='22 октября 2026. Прямое поручение Альмиры: «Да, перенеси J-APP-181 в приложение после финальных проверок, без рамок сравнения»; отдельно согласовано обновление старого формата внутреннего описания проекта, без изменения приложения. Разрешены точный перенос, необходимые commit/push и публикация. Новая функция, реальная заявка/оплата/рассылка или изменение AI не поручены.\n'
(H/'AUTHORIZATION.md').write_text(authorization,encoding='utf-8')
a=json.loads((H/'activation-result.json').read_text());dep=json.loads((H/'deployment.json').read_text())
(H/'RELEASE.md').write_text(f'''# J-APP-182 — принятый J181 опубликован

22 октября 2026. T-APP-058 / I-085 выполнены. Основание — прямое поручение Альмиры перенести J181 после финальных проверок, без рамок сравнения.

Из 100 публичных файлов меняется только access-admin.html. Перенесён точный принятый кандидат: при смене служебного раздела скрываются прежние данные; «Потоки» действительно перечитывают список; отсутствие потоков объяснено. Сохранены защита от позднего ответа, выбранный доступный поток и прежняя работа с очередью. CSS дословно прежний. Сравнение, учебный токен и пометки не входят в рабочий HTML.

- Функциональный commit `{commit}`, Vercel `{dep['id']}` READY.
- На каждом из трёх проверенных адресов (локальный, основной и резервный) прошли 34 группы служебных сценариев и 56 групп регрессии приёма: Chromium 320/390/1440, WebKit 390. API полностью учебный, реальные изменения блокируются.
- Все 300 HTTPS-хешей на основном/резервном/recovery совпали с принятой сборкой. Health 200, 18 анонимных API-проверок дали 401; установленные маршруты дневника/отметок совпали.
- На основном/резервном адресах отдельно проверены отсутствие рамок сравнения и JS-ошибок; сохранены снимки *-without-marks.png. Статическая проверка 68 файлов прошла без битых ссылок и предупреждений.
- Приватный backup `{a['backup']}`: оба архива прочитаны и прежние хеши изменяемого файла проверены до активации и повторно после. nginx проверен до/после атомарной замены. Backend не перезапускался, защищённые файлы и PID прежние.

Backend/API-схемы, данные, права, платежи и AI не менялись. Миграций, реальных решений/удалений/сообщений/AI-вызовов — 0. Эти браузерные проверки не доказывают работу настоящих ролей/БД и физического Telegram на телефоне.

Основной адрес: https://tg-app-telo-pomnit.vercel.app/ ; резерв: https://app.telo-pomnit.ru/ ; recovery: https://app.telo-pomnit.ru/recovery/j293/ . Откат: предыдущий commit `{m['previousCommit']}` для Vercel; два архива из указанного backup для Beget-корней, затем nginx и сверка хешей. Откат не выполнялся.

Доказательства: manifest.json, шесть *-checks.json, https.json, api.json, no-marks.json, activation-result.json, backup-verification.json, deployment.json. Финальный документальный deployment и повтор трёх изменённых HTML фиксируются отдельно в final-deployment.json / final-https.json.

Отдельно выполнено T-APP-059 / I-087: миграция app/PRODUCT.md на схему 1 Impeccable по подтверждённым источникам, с побайтовым сохранением прежнего документа. Она не меняет публичную сборку: [отчёт](../product-context-20261022/REPORT.md). Полный аудит не закрыт; остаток — CURRENT-REMAINDER.md.
''',encoding='utf-8')
(D/'REPORT.md').write_text('''# Обновление внутреннего описания продукта — T-APP-059 / I-087

22 октября 2026. Выполнено по прямому поручению Альмиры вместе с публикацией принятого J181. Это изменение внутренних документов, без нового пакета интерфейса.

## Что было и что стало

В app/PRODUCT.md перед кратким описанием накопилась история выпусков; отсутствовали маркер схемы и новые разделы Impeccable. В начале теперь подтверждённая карта продукта: платформа, пользователи, назначение, роль приложения, условия использования, функции/ограничения, обязательства бренда, доказательства и принципы. Добавлен точный маркер impeccable:product-schema 1. Сохранены полезные прежние заголовки.

Полный прежний документ сохранён **побайтово** в PRODUCT-before.md; SHA-256 и проверка — checks.json. Он помечен историческим источником, а не конкурирующим действующим описанием. История выпусков теперь отделена от постоянных сведений; новые статусы остаются в базе и отчётах. Старая ссылка «последний функциональный выпуск J045» заменена актуальной ссылкой на выпуск J182.

## Источники и границы

- Определение терапевтической групповой работы, личная значимость и границы обещаний — действующий «01 Продукт и программа», прямые решения Альмиры J322/J327/J259.
- Цель приложения, роли/приватность, действующие сценарии и сроки доступа — действующий «07 Приложение и экосистема» и сохранённые подтверждённые разделы прежнего PRODUCT.md.
- Порядок Профиля и поведение заполненной анкеты — принятый J171, опубликованный J172; сохранение/черновики — прямые решения J131/J133/J135 и последующие выпуски.
- Разделение наличных/free/онлайн и отсутствие автоматического доступа команды к личным данным — действующие решения J113 и документ 07.
- Поведение служебных разделов — принятый J181/выпуск J182, без новой функции.
- Формат — прочитан reference/init.md из установленного Impeccable 4.5.2. Это миграция существующего документа по уже данным ответам владельца; новых продуктовых предположений или решения о редизайне нет.

Неизбранные решения оставлены открытыми: отдельная веб-авторизация и PWA отложены; влияние приложения на возвращение/пользу требует проверки; остаток аудита, настоящие роли и физические устройства не закрыты. Не устанавливались зависимости, не менялись workflow-настройки Impeccable, модель AI или стек. Для этого документа используется существующий кодовый процесс; новый способ производства лендинга не выбирался и не записывался.

## Проверка

checks.json подтверждает схему, обязательные разделы и целость старого документа. Новые относительные ссылки проверены (исторический снимок сохраняет исходные относительные пути app/). Публичная сборка после переноса PRODUCT.md в публикационный checkout побайтово соответствует принятому J181 по всем 100 нормализованным хешам: build-unchanged.json. DESIGN.md не перепроектировался; его служебная отметка о публикации обновлена отдельно в рамках выпуска J182.
''',encoding='utf-8')
release='**J-APP-182 / T-APP-058 / I-085 — опубликовано и проверено, 22 октября 2026.** Принятый J181 перенесён без рамок сравнения; CSS прежний. Актуальные данные «Потоков», переходы между служебными разделами и понятная пустота опубликованы. На каждом локальном/основном/резервном адресе прошли 34 служебные и 56 приёмных групп; 300 HTTPS-хешей и backup проверены. Реальных решений/сообщений 0. T-APP-058 / I-085 выполнены. [Выпуск](LINK). Прежние локальные статусы ниже — история подготовки. Полный аудит не закрыт.'
doc='**T-APP-059 / I-087 — внутреннее описание обновлено, 22 октября 2026.** По прямому поручению Альмиры app/PRODUCT.md переведён на схему 1 Impeccable: подтверждённая карта продукта отделена от истории выпусков; полный прежний файл сохранён побайтово. Новые функции/решения, внешний вид, AI и публичная сборка этим шагом не меняются. [Отчёт](DOCLINK).'
paths=['project.md','app/CLAUDE.md','app/DESIGN.md','База знаний/07 Приложение и экосистема.md','База знаний/08 Решения.md','База знаний/План.md','База знаний/Идеи и развитие.md','База знаний/Журнал обсуждений.md','audit/audit-reconciliation-JAPP146/CURRENT-REMAINDER.md']
for root in [R,C]:
 for rel in paths:
  p=root/rel;s=p.read_text(encoding='utf-8');prefix='../'if rel.startswith(('app/','База знаний/'))else '../'if rel.startswith('audit/')else ''
  link=prefix+('service-panels-release-JAPP182/RELEASE.md'if rel.startswith('audit/')else'audit/service-panels-release-JAPP182/RELEASE.md')
  dlink=prefix+('product-context-20261022/REPORT.md'if rel.startswith('audit/')else'audit/product-context-20261022/REPORT.md')
  note=release.replace('LINK',link)
  if rel not in ['app/DESIGN.md']:note+='\n\n'+doc.replace('DOCLINK',dlink)
  line,rest=s.split('\n',1);s=line+'\n\n'+note+'\n\n'+rest.lstrip('\n')
  if rel.startswith('audit/'):
   s=s.replace('после J180; J181 только локально','после J182; принятый J181 опубликован')
   s=s.replace('Прочие служебные представления проверены на учебных API и исправлены локальным J181, который ждёт оценки/публикации.','Прочие служебные представления проверены на учебных API; принятый J181 опубликован J182 без рамок сравнения.')
   s=s.replace('Последний согласованный пакет J179 опубликован J180 без рамок. J181 проверен только локально; общий визуальный остаток, настоящие роли/данные и физические устройства остаются отдельно.','Последний согласованный пакет J181 опубликован J182 без рамок. Общий визуальный остаток, настоящие роли/данные и физические устройства остаются отдельно. Обновление формата PRODUCT.md выполнено как внутренняя документация и не закрывает визуальный остаток.')
  p.write_text(s,encoding='utf-8')
 (root/'app/PRODUCT.md').write_bytes((R/'app/PRODUCT.md').read_bytes())
candidate=R/'audit/service-panels-JAPP181/REPORT.md';text=candidate.read_text(encoding='utf-8');title,rest=text.split('\n',1);candidate.write_text(title+'\n\n**22 октября 2026: Альмира приняла кандидат; опубликован выпуском J182 без рамок сравнения.** [Выпуск и финальные проверки](../service-panels-release-JAPP182/RELEASE.md). Ниже сохранён первоначальный локальный протокол, его статусы относятся к моменту проверки. Старый формат PRODUCT.md отдельно обновлён: [отчёт](../product-context-20261022/REPORT.md).\n'+rest,encoding='utf-8')
# Copy only this task's evidence. Exclude generated cache, full previous build and verbose context dumps.
for rel in ['audit/service-panels-release-JAPP182','audit/product-context-20261022','audit/service-panels-JAPP181']:
 dest=C/rel;dest.mkdir(parents=True,exist_ok=True)
 for p in (R/rel).iterdir():
  if p.is_file()and p.name not in ['context.txt','context-before.txt']and p.suffix not in ['.log']:
   shutil.copy2(p,dest/p.name)
print('PASS root runtime synchronized, release/source-grounded migration documented; other-session KB content preserved')
