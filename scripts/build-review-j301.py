"""Static screenshot review only: no API, real user data, or app deployment."""
from pathlib import Path
import shutil, html
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/app-2-refinement/review-j301'
OUT.mkdir(parents=True,exist_ok=True)
screens=ROOT/'output/app-2-refinement/screens'
items=[
 ('Главная: меньше текста', 'j301-webkit-390-main-top.png'),
 ('Дневник: основное действие и отдельные разделы', 'j301-preview-webkit-390-diary-full.png'),
 ('Мой путь: реакция и пять шкал', 'j301-preview-webkit-390-path-data-full.png'),
 ('Мой путь: без оценок состояния', 'j301-preview-webkit-390-path-empty-full.png'),
 ('Профиль: встречи, контакты, настройки', 'j301-webkit-390-profile-active-full.png'),
 ('Профиль: служебная роль', 'j301-webkit-390-profile-staff-full.png'),
 ('AI: ввод и управление контекстом', 'webkit-390-ai.png'),
 ('AI: короткий экран с клавиатурой', 'webkit-390-ai-keyboard.png'),
 ('Загрузка без emoji', 'j301-webkit-390-splash.png'),
 ('Профиль — 320 px', 'j301-webkit-320-profile-active-full.png'),
 ('Профиль — 430 px', 'j301-webkit-430-profile-active-full.png'),
 ('Дневник — 320 px', 'j301-preview-webkit-320-diary-full.png'),
 ('Дневник — 430 px', 'j301-preview-webkit-430-diary-full.png'),
 ]
cards=[]
for title,name in items:
 shutil.copy2(screens/name,OUT/name)
 cards.append(f'<details><summary>{html.escape(title)}</summary><img src="{name}" alt="{html.escape(title)}" loading="lazy"></details>')
(OUT/'index.html').write_text('''<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Тело помнит — J301</title><style>body{margin:0;background:#f7f4ef;color:#1a211a;font:15px/1.5 system-ui,sans-serif}main{max-width:650px;margin:auto;padding:24px 16px}h1{font:32px/1.1 Georgia,serif}p{color:#5e6257}details{margin:14px 0;border:1px solid #d6cfc3;border-radius:14px;background:#fffdfa;overflow:hidden}summary{padding:16px;cursor:pointer;font-weight:600;min-height:24px}img{display:block;width:100%;max-width:430px;height:auto;margin:auto}</style><main><h1>Новая иерархия приложения</h1><p>Локальный кандидат J301. Здесь снимки работающего интерфейса, а не интерактивное приложение. Рабочая версия ещё не обновлена.</p><p>Все имена, записи, встречи и диаграммы на снимках — тестовые. Текстура вместо аватара на Главной проверяет загрузку фото; это не фотография пользователя. Длинные экраны сняты полностью, поэтому нижняя навигация находится в конце изображения.</p>'''+''.join(cards)+'</main></html>',encoding='utf-8')
print(OUT)
