# J-APP-158 — J-APP-157 опубликован

20 октября2026 по прямому поручению Альмиры. [Разрешение](AUTHORIZATION.md). Перенесён точный согласованный кандидат: один CSS form-layout.css. На телефоне начальная/итоговая анкеты показывают два ряда по5крупных кнопок; от600px один ряд. Вопросы/значения/JS/API прежние.

Функциональный commit `255fadd` (полный SHA в окончательном журнале Vercel). Сборка98файлов, изменены только CSS и два bundled HTML. Vercel проверяется по точному SHA/READY; основной https://tg-app-telo-pomnit.vercel.app/ , Beget https://app.telo-pomnit.ru/ и recovery/j293/ обновлены.

После установки:294/294 HTTPS-хеша; один timeout старого медиа recovery повторён адресно и прошёл.72UI-группы Chromium320/390/599/600/768/1440 и WebKit320/390;66прежних групп форм и9резервных Chromium390 прошли. Резервные браузерные проверки с --disable-http2, прежняя проблема обычного соединения не объявлена исправленной. [HTTPS](https.json), [UI](ui-results.json), [регрессия](regression-results.json), [резерв](reserve-ui.json).

15API без авторизации401, установленные diary/checkins и health200 проверены. [API](api.json). Nginx до/после, прежний PM2PID, весь manifest, AI/наличные/конфигурация сохранены. Backend/миграций/рабочих тестовых записей/уведомлений/OpenAI0.

Private backup `/root/telo-backups/ui-JAPP158-2026-10-20T114846626Z`. Оба архива прочитаны; шесть прежних изменённых файлов сверены. [Проверка](backup-verification.json), [установка](activation-result.json).

Откат Beget: восстановить app-before.tar.gz в /var/www/telo-app и recovery-before.tar.gz в /var/www/telo-app/recovery/j293; nginx -t, сверить publicBefore. Новых файлов нет. Vercel вернуть к3593829226f2a882b1e2a57fde86ce2b26eab4f1. Backend не откатывать.

Физический Telegram отдельно. Следующий J-APP-159 — локальная доводка выбора дневника для AI; его исходники в этот выпуск не входят.
