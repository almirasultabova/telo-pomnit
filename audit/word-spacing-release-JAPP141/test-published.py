from pathlib import Path
from playwright.async_api import async_playwright,expect
import asyncio,json
H=Path(__file__).parent;results=[]
async def check(browser,engine,origin,width):
 p=await browser.new_page(viewport={'width':width,'height':950},device_scale_factor=1)
 errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
 await p.add_init_script("window.TelegramWebviewProxy={postEvent(){}};localStorage.setItem('tp_user:published-spacing:tp_offer_seen','true');localStorage.setItem('tp_user:published-spacing:launch_seen_v3','1');")
 async def api(route):
  path=route.request.url.split('/api',1)[1].split('?')[0]
  user={'id':'published-spacing','name':'Учебный просмотр','consentGivenAt':'2026-10-19T12:00:00Z'}
  data={'/auth/telegram':{'token':'fixture-not-a-real-token','user':user},'/me':{'user':user},'/me/enrollment/access':{'ai':{'allowed':False},'streams':[]},'/diary':[],'/diary/days':{'timeZone':'Europe/Moscow','days':[]},'/checkins':[],'/triggers':[]}.get(path,{})
  await route.fulfill(status=200,json=data)
 await p.route('**/api/**',api)
 await p.goto(origin+'index.html?verify=JAPP141#tgWebAppPlatform=ios&tgWebAppVersion=8.0',wait_until='domcontentloaded',timeout=45000)
 await expect(p.locator('#screen-home')).to_have_class('screen screen--active')
 await p.evaluate('window.LaunchSplash.cancel();document.fonts.ready')
 await p.locator('.home-action-pair').scroll_into_view_if_needed()
 titles=await p.locator('.home-action-pair strong').evaluate_all('es=>es.map(e=>({text:e.textContent,width:e.clientWidth,scrollWidth:e.scrollWidth,font:getComputedStyle(e).fontSize}))')
 assert [r['text']for r in titles]==['Отметить состояние','Заметить реакцию'],titles
 assert all(r['scrollWidth']<=r['width'] and r['font']=='14px'for r in titles),titles
 assert not await p.evaluate('document.documentElement.scrollWidth>innerWidth')
 await p.locator('.home-action-pair').screenshot(path=str(H/f'{engine}-{("main"if"vercel"in origin else"reserve")}-{width}.png'))
 await p.locator('#main-state-btn').click();await expect(p.locator('#screen-checkin')).to_have_class('screen screen--active')
 await p.evaluate("goTo('home')")
 await p.locator('#main-reaction-btn').click();await expect(p.locator('#screen-trigger')).to_have_class('screen screen--active')
 assert not errors,errors
 row={'engine':engine,'origin':origin,'width':width,'titles':titles,'buttonsPassed':True,'overflow':False,'pageErrors':errors,'apiMocked':True,'realParticipantWrites':0}
 results.append(row);print(json.dumps(row,ensure_ascii=False),flush=True)
 (H/'published-ui.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
 await p.close()
async def main():
 async with async_playwright()as pw:
  for engine in [pw.chromium,pw.webkit]:
   b=await engine.launch(args=['--disable-http2']if engine.name=='chromium'else[])
   main='https://tg-app-telo-pomnit.vercel.app/'
   await check(b,engine.name,main,390)
   if engine.name=='chromium':
    await check(b,engine.name,main,320)
    await check(b,engine.name,'https://app.telo-pomnit.ru/',390)
   await b.close()
asyncio.run(main())
