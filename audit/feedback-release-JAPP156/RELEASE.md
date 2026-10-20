# J-APP-156 — J-APP-155 опубликован

20 октября 2026, по прямому поручению Альмиры. [Разрешение](AUTHORIZATION.md). Перенесён точный локальный кандидат: app.js, feedback-form.js и подключение в index.html. Стили/слова/поведение прежние. Сборка98файлов, изменены4публичных файла, добавлен только js/feedback-form.js.

Функциональный commit `0bc89aca7356745195ef4dcd7865dfa90a2dc513`. Vercel `dpl_BjkTiTatBaCztvKvFwbiqDtkV44Z`, READY на точном SHA, aliasError=null. Основной https://tg-app-telo-pomnit.vercel.app/ , резерв https://app.telo-pomnit.ru/ , recovery/j293/ установлены.

После установки:294/294 HTTPS-хеша;66прежних UI-групп Chromium320/390/768/1440/WebKit390;14групп сохранности/позднего ответа/двух владельцев на основном адресе и7на резерве. На резерве Chromium запускался с --disable-http2 из-за ранее отмеченных зависаний; обычное HTTP/2 не объявляется исправленным. 15API без авторизации вернули401, установленный diary/checkins и health проверены. [HTTPS](https.json), [UI](ui-results.json), [границы](guards.json), [резерв](reserve-guards.json), [API](api.json).

Private backup `/root/telo-backups/ui-JAPP156-2026-10-20T113623614Z`. Оба архива прочитаны; шесть прежних изменённых файлов совпали с publicBefore, новый модуль отсутствовал в прежнем архиве. [Backup](backup-verification.json), [установка](activation-result.json). Nginx до/после, прежний PM2PID, защищённые AI/наличные/конфигурация проверены. Backend/БД не менялись; отправок людям/OpenAI/тестовых рабочих записей0.

Откат Beget: убрать только новый /var/www/telo-app/js/feedback-form.js и его recovery/j293/js копию, восстановить app-before.tar.gz и recovery-before.tar.gz в соответствующие roots, nginx -t и publicBefore. Vercel: вернуть прежнюю функциональную сборку a19a7d4f94d3a42f5afb6a02b5520593fa787d7b. Backend не откатывать.

Следующий J-APP-157 — отдельный локальный CSS-кандидат шкал анкет. Его runtime не включён в этот выпуск. Полный аудит не закрыт; актуальный остаток — [список](../audit-reconciliation-JAPP146/CURRENT-REMAINDER.md). Физический Telegram отдельно.
