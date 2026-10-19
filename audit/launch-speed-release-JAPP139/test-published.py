from pathlib import Path
from playwright.async_api import async_playwright
import asyncio,json,time,sys
H=Path(__file__).parent;results=[]
async def run(browser,engine,origin,mode,variant='native'):
 p=await browser.new_page(viewport={'width':390,'height':950},is_mobile=True,device_scale_factor=1)
 errors=[];writes=[]
 p.on('pageerror',lambda e:errors.append(str(e)))
 script="""window.TelegramWebviewProxy={postEvent(){}};localStorage.setItem('tp_user:published-launch:tp_offer_seen','true');
 document.addEventListener('DOMContentLoaded',()=>{const v=document.getElementById('launch-video');window.__launch={};v.addEventListener('playing',()=>{window.__launch.playing=performance.now();window.__launch.src=v.currentSrc;});});"""
 if mode=='return':script+="localStorage.setItem('tp_user:published-launch:launch_seen_v3','1');"
 if variant=='blocked':script+="HTMLMediaElement.prototype.play=function(){return Promise.reject(new DOMException('fixture autoplay denied','NotAllowedError'))};"
 await p.add_init_script(script)
 async def api(route):
  path=route.request.url.split('/api',1)[1].split('?')[0]
  if route.request.method!='GET' and path!='/auth/telegram':writes.append(path)
  if variant=='denied':await route.fulfill(status=403,json={'code':'CLUB_ACCESS_PENDING','error':'Учебный отказ'});return
  user={'id':'published-launch','name':'Учебный просмотр','consentGivenAt':'2026-10-19T12:00:00Z'}
  data={'/auth/telegram':{'token':'fixture-not-a-real-token','user':user},'/me':{'user':user},'/me/enrollment/access':{'ai':{'allowed':False},'streams':[]},'/diary':[],'/diary/days':{'timeZone':'Europe/Moscow','days':[]},'/checkins':[],'/triggers':[]}.get(path,{})
  await route.fulfill(status=200,json=data)
 await p.route('**/api/**',api)
 await p.goto(origin+'index.html?verify=JAPP139#tgWebAppPlatform=ios&tgWebAppVersion=8.0',wait_until='domcontentloaded',timeout=45000)
 if variant=='native':
  await p.wait_for_function('window.__launch?.playing',timeout=10000)
  await p.wait_for_timeout(300)
  video=await p.locator('#launch-video').evaluate('v=>({time:v.currentTime,width:v.videoWidth,height:v.videoHeight,muted:v.muted,inline:v.playsInline,src:v.currentSrc,ready:v.readyState,error:v.error?.code})')
  assert video['time']>0 and video['width']>0 and video['muted'] and video['inline'],video
  assert await p.locator('#launch-overlay').get_attribute('data-mode')==mode
  assert await p.locator('#launch-video').evaluate("v=>getComputedStyle(v).objectFit==='cover'")
  await p.screenshot(path=str(H/f'{engine}-{("main"if"vercel"in origin else"reserve")}-{mode}.png'))
 elif variant=='blocked':await p.wait_for_function("document.getElementById('launch-overlay').dataset.media==='image'",timeout=10000)
 await p.locator('#launch-overlay').wait_for(state='hidden',timeout=16000)
 assert not await p.locator('#app').evaluate('e=>e.inert')
 home=await p.locator('#screen-home').evaluate("e=>e.classList.contains('screen--active')")
 assert home==(variant!='denied')
 if home:
  await p.locator('#main-body-btn').click()
  await p.locator('#screen-body-map').wait_for(state='visible')
 assert not errors,errors
 assert not writes,writes
 data={'engine':engine,'origin':origin,'mode':mode,'variant':variant,'passed':True,'source':await p.evaluate('window.__launch.src||null'),'video':video if variant=='native' else None,'realParticipantWrites':0,'apiMocked':True}
 results.append(data);(H/'published-ui.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(data),flush=True)
 await p.close()
async def main():
 async with async_playwright()as pw:
  for engine in [pw.chromium,pw.webkit]:
   if '--webkit' in sys.argv and engine.name!='webkit':continue
   b=await engine.launch(args=['--disable-http2']if engine.name=='chromium'else[])
   main='https://tg-app-telo-pomnit.vercel.app/'
   await asyncio.gather(run(b,engine.name,main,'first'),run(b,engine.name,main,'return'))
   if engine.name=='chromium':
    await asyncio.gather(run(b,engine.name,main,'return','blocked'),run(b,engine.name,main,'first','denied'))
    await asyncio.gather(run(b,engine.name,'https://app.telo-pomnit.ru/','first'),run(b,engine.name,'https://app.telo-pomnit.ru/','return'))
   await b.close()
 (H/'published-ui.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
asyncio.run(main())
