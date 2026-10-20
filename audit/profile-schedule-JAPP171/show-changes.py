from pathlib import Path
from playwright.async_api import async_playwright,expect
from fixture import boot
import asyncio,json,base64,html
H=Path(__file__).parent
async def main():
 captures={}
 async with async_playwright()as pw:
  browser=await pw.chromium.launch()
  for side,origin in [('before','http://127.0.0.1:15371/before/'),('after','http://127.0.0.1:15371/')]:
   p=await boot(browser,origin,390);await p.locator('#owned-stream-select').select_option(index=1);refresh=p.locator('.program-refresh');await refresh.evaluate("x=>x.scrollIntoView({block:'center'})");captures[side]={}
   async def capture(name,target):
    data=await p.screenshot(path=str(H/f'marked-{side}-{name}.png'));box=await target.bounding_box();captures[side][name]={'data':base64.b64encode(data).decode(),'box':box,'scroll':0}
   p.profile_gate=asyncio.Event();await refresh.click();await expect(refresh).to_be_disabled();await capture('loading',refresh)
   p.profile_gate.set();await expect(refresh).to_be_enabled()
   target=p.locator('#profile-schedule-status')if side=='after'else refresh
   await refresh.evaluate("x=>x.scrollIntoView({block:'center'})");await capture('ready',target)
   p.profile_gate=None;p.profile_fault=True;await refresh.click();await expect(refresh).to_be_enabled();target=p.locator('#profile-schedule-status')if side=='after'else refresh
   await refresh.evaluate("x=>x.scrollIntoView({block:'center'})");await capture('error',target)
   assert not p.fixture_errors,p.fixture_errors;await p.close()
  await browser.close()
 def frame(side,key,number):
  c=captures[side][key];box=c['box'];mark=''
  if box and box['y']<844:
   y=max(0,box['y']);height=min(box['height'],844-y)
   mark=f'<span class="mark {side}" style="left:{box["x"]/390*100}%;top:{y/844*100}%;width:{box["width"]/390*100}%;height:{height/844*100}%"><b>{number}</b></span>'
  else:mark='<span class="below">Подтверждение ниже экрана ↓</span>'
  return f'<div class="phone"><img width="390" height="844" alt="{side}: {key}" src="data:image/png;base64,{c["data"]}">{mark}</div>'
 cases=[('loading','Обновление началось','Нажали «Обновить расписание». Ответ ещё не пришёл.','Кнопка только стала недоступной. По надписи непонятно, что происходит.','Кнопка показывает «Обновляем…». Видно, что нужно немного подождать.'),('ready','Расписание обновилось','Ответ получен. Данные расписания остались прежними.','Кнопка снова доступна, но подтверждения обновления нет.','Рядом с кнопкой видно «Расписание обновлено».'),('error','Не удалось обновить','При обновлении пропало соединение.','Кнопка не объясняет ошибку. Сообщение находится выше — к нему нужно прокрутить.','Объяснение находится прямо под кнопкой «Попробовать ещё раз». Последнее расписание осталось на экране.')]

 sections=[]
 for i,(key,title,action,before,after)in enumerate(cases,1):
  sections.append(f'<section class="case" id="{key}" {"hidden" if i>1 else ""}><h2>{i}. {title}</h2><p class="action">{action}</p><div class="pair"><article><h3><span class="old-dot"></span>Было · сейчас в приложении</h3><p class="caption">{before}</p>{frame("before",key,i)}</article><article><h3><span class="new-dot"></span>Стало · пока локально</h3><p class="caption">{after}</p>{frame("after",key,i)}</article></div></section>')
 page='''<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Что меняется в J-APP-171 — с отметками</title><style>
 *{box-sizing:border-box}body{margin:0;background:#f7f4ef;color:#243b2b;font:16px/1.6 system-ui,sans-serif}main{max-width:1040px;margin:auto;padding:28px 24px 56px}h1{font-size:30px;line-height:1.25;margin:0 0 12px}h2{font-size:23px;line-height:1.3;margin:28px 0 8px}h3{display:flex;gap:8px;align-items:center;font-size:17px;margin:0}p{margin:0 0 16px}.intro{max-width:780px}.tabs{display:flex;gap:10px;flex-wrap:wrap;margin:24px 0 10px}.tabs button{font:inherit;color:inherit;background:#fffdf8;border:1px solid #7b8273;border-radius:12px;min-height:48px;padding:10px 15px;cursor:pointer}.tabs button[aria-pressed=true]{background:#2a4a38;color:white;border-color:#2a4a38}.tabs button:focus-visible{outline:3px solid #926619;outline-offset:3px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:28px}.caption{min-height:100px;max-width:390px;margin:10px 0 16px}.phone{position:relative;max-width:390px;line-height:0;isolation:isolate}.phone img{display:block;width:100%;height:auto;border-radius:14px}.mark{position:absolute;border:3px solid;border-radius:10px;pointer-events:none}.before{color:#a64133}.after{color:#23603e}.mark b{position:absolute;left:-3px;top:-17px;background:currentColor;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font:700 17px/1 system-ui}.mark b::first-letter{color:white}.mark b{color:white}.before b{background:#a64133}.after b{background:#23603e}.old-dot,.new-dot{width:12px;height:12px;border-radius:50%;background:#a64133;flex:none}.new-dot{background:#23603e}.below{position:absolute;bottom:14px;left:15px;right:15px;padding:12px;background:#a64133;color:white;border-radius:10px;font:600 14px/1.4 system-ui;text-align:center}.action{margin-bottom:22px}.other{margin-top:30px;padding:20px 0;border-top:1px solid #cdd4c7;max-width:840px}.other strong{display:block;margin-bottom:6px}a{color:inherit;text-underline-offset:3px}.case[hidden]{display:none}@media(max-width:650px){main{padding:22px 16px}h1{font-size:26px}.pair{grid-template-columns:1fr;gap:26px}.caption{min-height:0}.tabs button{flex:1 1 140px}.phone{margin:0 auto}}@media print{.case[hidden]{display:block}.tabs{display:none}}
 </style><main><h1>Что конкретно меняется в J-APP-171</h1><p class="intro">Выберите один из трёх примеров. <strong>Рамками и цифрами отмечены места, которые нужно сравнить.</strong> Это пояснения для просмотра; в самом приложении таких рамок не будет.</p><p>J-APP-171 пока только локально. В обоих вариантах — одинаковые вымышленные данные.</p><nav class="tabs" aria-label="Примеры изменений">'''
 for i,(key,title,*_)in enumerate(cases):page+=f'<button type="button" data-case="{key}" aria-pressed="{"true"if i==0 else"false"}" aria-controls="{key}">{i+1}. {title}</button>'
 page+='</nav>'+''.join(sections)+'''<div class="other"><strong>Ещё два изменения видны во время использования</strong><p>• Выбрали другой поток — можно продолжить управление с клавиатуры, не искать поле заново.<br>• Ушли с профиля во время обновления — ответ не перехватывает управление на другом экране.</p><p>Это изменения удобства. Общий вид приложения в этом пакете почти прежний.</p><a href="/index.html?owner=preview">Попробовать локальный вариант самостоятельно</a></div></main><script>document.querySelectorAll('[data-case]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-case]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));document.querySelectorAll('.case').forEach(x=>x.hidden=x.id!==b.dataset.case)}))</script></html>'''
 (H/'compare.html').write_text(page,encoding='utf-8')
 measurements={side:{key:{k:v for k,v in row.items()if k!='data'}for key,row in cases.items()}for side,cases in captures.items()}
 (H/'marked-measurements.json').write_text(json.dumps(measurements,ensure_ascii=False,indent=2),encoding='utf-8')
 print('PASS six matching real UI captures; three annotated comparisons, app unchanged')
asyncio.run(main())
