from model import Model
import asyncio
async def boot(browser,width=390,side='after',count=65,owner=True,streams=None):
 p=await browser.new_page(viewport={'width':width,'height':844});p.model=Model(count,owner);p.errors=[];p.gates={};p.started={k:asyncio.Event()for k in ['open','patch','confirm','list','streams','audit','stats']}
 if streams is not None:p.model.streams=streams
 p.on('pageerror',lambda e:p.errors.append(str(e)))
 async def boundary(route):
  if route.request.method not in ['GET','HEAD']:p.errors.append('unexpected real mutation');return await route.abort()
  await route.continue_()
 async def api(route):
  r=route.request;kind='confirm'if r.url.endswith('/confirm')else'patch'if r.method=='PATCH'else'open'if r.method=='POST'else'list'if'/users?'in r.url else'streams'if r.url.endswith('/streams')else'audit'if r.url.endswith('/audit')else'stats'if r.url.endswith('/stats')else None
  if kind:
   p.started[kind].set()
   if kind in p.gates:await p.gates[kind].wait()
  status,data=p.model.respond(r.url,r.method,r.post_data_json if r.method in ['POST','PATCH']else None);await route.fulfill(status=status,json=data)
 await p.route('**/*',boundary);await p.route('**/api/**',api)
 await p.goto('http://127.0.0.1:16181/harness?side='+side);f=p.frame_locator('iframe');await f.locator('#workspace').wait_for();await f.locator('[data-person]').first.wait_for();return p,f
