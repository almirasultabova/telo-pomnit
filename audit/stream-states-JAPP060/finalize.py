from pathlib import Path
import json,shutil
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1];REL=ROOT/'output/silk-launch-release'
sha='8bb5b8bf573d9920afcc4cbafd46093a2631d554';deployment='dpl_HWK2pmBWg8ptg7z8W7cq9yatGPAZ'
backup=json.loads((HERE/'activation-result.json').read_text(encoding='utf-8'))['backup']
report=(HERE/'RELEASE.md').read_text(encoding='utf-8').replace('Статус записи: подготовлено, выпуск пока не подтверждён.','**Статус: опубликовано и технически проверено; физическая проверка Telegram остаётся владельцу.**')
report=report.replace('Backup/commit/Vercel/HTTPS/откат будут записаны по фактическому выпуску. Следующий этап после публикации — физическая проверка владельца в Telegram.',f'''## Выпуск и эксплуатация

Функциональный commit `{sha}` отправлен в GitHub main, SHA сверён. Vercel `{deployment}`, production READY, точный commit8bb5b8b. Основной адрес https://tg-app-telo-pomnit.vercel.app/.

Beget `/var/www/telo-app` и `/var/www/telo-app/recovery/j293`:76 прежних файлов каждого дерева и точный me.js проверены до записи;9 публичных файлов заменены assets-first/atomic rename, nginx -t до/после. Изменён только backend/src/routes/me.js, процесс telo-backend перезапущен, миграций0. Private backup `{backup}` содержит backend-before/app-before/recovery-before tar.gz и database-before.dump, архивы/оглавление проверены. Количества существующих записей/роли/настройки сохранены, .env и обе версии мониторинга неизменны; встречи не включались, тестовых отправок людям0. [Активация](activation-result.json).

**78/78 файлов каждого из main/reserve/recovery совпали через HTTPS/TLS**, тексты нормализованы только по CRLF/LF, бинарные точно. Health200 и GET access без авторизации401. [Сверка](https.json), [manifest](manifest.json). Опубликованные два состояния повторно проверены в Chromium375, post-анкета открывается; overflow/pageerrors/API-запросов нет, все ответы только в fixture. [Опубликованный UI](published-ui-checks.json). Отдельно HOST открыл оба пункта через настоящий ScreenReview controller в синтетическом стенде, opaque sandbox без передачи токена/данных. [Проверка ведущей](staff-checks.json).

## Проверка владельца и откат

Полностью закрыть Mini App и открыть из бота заново. Текущий поток — в Профиле; оба учебных состояния доступны ведущей через «Профиль → Проверить экраны → Поток идёт / Поток завершён». Физический Telegram/клавиатура iPhone/Android не подтверждаются HTTPS или браузерным стендом. Реальные видео и членство Telegram не читались/не менялись; их удаление этот выпуск не автоматизирует.

Откат frontend: предыдущий Vercel dpl_FXrH7US4Ltewkh1tw6ZV8FjvmCQj и соответствующие app/recovery backup через staging/atomic replacement после nginx -t. Backend: вернуть прежний src/routes/me.js из backend-before и перезапустить telo-backend; схема не менялась, Prisma generate/восстановление старой БД не нужны. Новые неиспользуемые static-файлы могут остаться; личные записи поверх старого dump не откатывать.''')
(HERE/'RELEASE.md').write_text(report,encoding='utf-8')
for base in (ROOT,REL):
 for relative in ['project.md','База знаний/07 Приложение и экосистема.md','База знаний/08 Решения.md','app/CLAUDE.md','База знаний/Журнал обсуждений.md']:
  f=base/relative;s=f.read_text(encoding='utf-8').replace('На момент записи код/изолированные проверки готовы, публикация ещё не подтверждена.', 'Опубликовано8bb5b8b: Vercel READY, Beget с private backup,78 файлов каждого из трёх адресов сверены. Следующий шаг — физическая проверка владельца в Telegram.');f.write_text(s,encoding='utf-8')
 f=base/'База знаний/План.md';s=f.read_text(encoding='utf-8').replace('Проверки календарной границы, прав и UI320/375/390 прошли; следующий шаг — backup/выпуск/HTTPS, затем физическая проверка владельца.', 'Опубликовано8bb5b8b: Vercel READY, Beget с private backup,78 файлов каждого из трёх адресов сверены. Статус: технический выпуск выполнен, следующий шаг — физическая проверка владельца в Telegram.');s=s.replace('Начало отсчёта трёхмесячного хранения остаётся открытым уточнением, поэтому точную дату в интерфейсе не показываем.', 'На этапе J-APP-059 начало трёхмесячного хранения ещё не уточняли; J-APP-060 владелец определила его после окончания потока. Текущий контракт и публикация — выше.');f.write_text(s,encoding='utf-8')
 f=base/'app/PRODUCT.md';s=f.read_text(encoding='utf-8').replace('Результат выпуска — audit/stream-states-JAPP060/RELEASE.md.', 'Опубликовано17октября,8bb5b8b. Результат выпуска — audit/stream-states-JAPP060/RELEASE.md.');f.write_text(s,encoding='utf-8')
 # The former preview paragraph is history, not a second current access contract.
 f=base/'project.md';s=f.read_text(encoding='utf-8').replace('**J-APP-059 / T-APP-008 — два состояния потока готовы только в просмотре.**','**J-APP-059 / T-APP-008 — история подготовки просмотра; опубликовано по J-APP-060.**').replace('Начало отсчёта3месяцев не уточнено, дата удаления не выдумана.', 'На этапе просмотра начало отсчёта не уточнялось; последующим J-APP-060 владелец определила три месяца после окончания потока.');f.write_text(s,encoding='utf-8')
for p in HERE.iterdir():
 if p.is_file():shutil.copy2(p,REL/'audit/stream-states-JAPP060'/p.name)
print('Current access rule, publication proof, staff path and rollback saved; historical preview uncertainty superseded explicitly')
