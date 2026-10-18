"""Mobile/desktop admin workflow; synthetic API and Telegram bridge only."""
import json,threading,urllib.parse
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from functools import partial
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).parent/'published-ui';OUT.mkdir(exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=json.loads((Path(__file__).parent/'build.json').read_text(encoding='utf-8'))['isolatedBuild']+'/output/app'));threading.Thread(target=server.serve_forever,daemon=True).start()
uid='00000000-0000-4000-8000-000000000004';sid='00000000-0000-4000-8000-000000000005'
results=[]
try:
 with sync_playwright() as p:
  for engine in [p.chromium,p.webkit]:
   browser=engine.launch()
   for scenario,width in [('owner',390),('owner',1100),('admin',390),('denied',390),('retry',390)]:
    ctx=browser.new_context(viewport={'width':width,'height':844});ctx.add_init_script('window.TelegramWebviewProxy={postEvent:()=>{}}');page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));draft={};confirmed={'value':False};counts={'confirm':0,'open':0};fail={'active':scenario=='retry'}
    def route(r):
     path=urllib.parse.urlsplit(r.request.url).path;method=r.request.method;body=json.loads(r.request.post_data or '{}')
     data=None;status=200
     if path=='/api/auth/telegram':
      if scenario=='denied':status=403;data={'error':'Нет доступа'}
      else:data={'token':'synthetic'}
     elif path=='/api/access-admin/session':data={'id':'owner','owner':scenario!='admin'}
     elif path=='/api/access-admin/streams':data=[{'id':sid,'name':'Учебный поток','startDate':'2026-10-01','endDate':'2026-10-20','isActive':True}]
     elif path=='/api/access-admin/users':
      if fail['active']:status=503;data={'error':'Учебный сбой'}
      else:data={'items':[{'id':uid,'telegramId':'123','name':'<img src=x onerror=window.injected=true>','role':'PARTICIPANT','accessStatus':'pending','enrollments':[{'streamId':sid,'status':'active','accessBasis':'cash' if confirmed['value'] else 'free','paidAt':'2026-10-18T12:00:00Z' if confirmed['value'] else None,'stream':{'name':'Учебный поток'}}]}],'total':1,'page':1,'pageSize':30}
     elif path=='/api/access-admin/audit':data=[]
     elif path=='/api/access-admin/stats':data={k:0 for k in ['pending','approved','rejected','entered','paid','free','diary','checkins','triggers']};data['errors']=[]
     elif path=='/api/access-admin/actions':counts['open']+=1;draft.clear();draft.update({'id':'synthetic-draft','role':'PARTICIPANT','status':'approved','streamId':None,'basis':'none'});data=draft
     elif path.endswith('/confirm'):counts['confirm']+=1;confirmed['value']=True;data={'ok':True}
     elif method=='PATCH':draft.update(body);data=draft
     else:raise AssertionError(path)
     r.fulfill(status=status,content_type='application/json',body=json.dumps(data))
    page.route('**/api/**',route)
    page.goto('https://tg-app-telo-pomnit.vercel.app/access-admin.html#tgWebAppData=synthetic&tgWebAppPlatform=ios&tgWebAppVersion=8.0')
    if scenario=='denied':expect(page.locator('#notice')).to_have_text('Нет доступа');assert not page.locator('nav').is_visible()
    else:
     if scenario=='retry':expect(page.locator('#notice')).to_have_text('Учебный сбой');fail['active']=False;page.locator('#refresh').click()
     expect(page.locator('[data-person]')).to_be_visible();assert page.evaluate('!window.injected');assert page.locator('.person img').count()==0
     page.locator('[data-person]').click();expect(page.locator('#decision')).to_be_visible();assert page.locator('#admin-option').evaluate('e=>e.hidden')==(scenario=='admin')
     page.locator('#decision-role').select_option('HOST');page.locator('#decision-stream').select_option(sid);page.locator('#decision-basis').select_option('cash');page.locator('#submit-decision').click();expect(page.locator('#submit-decision')).to_have_text('Подтвердить изменения');assert counts['confirm']==0;assert not confirmed['value'];expect(page.locator('#decision-preview')).to_contain_text('Оплачено наличными · подтверждаю получение вручную')
     page.screenshot(path=str(OUT/f'{engine.name}-{scenario}-{width}-decision.png'))
     page.locator('#decision-role').select_option('PARTICIPANT');expect(page.locator('#submit-decision')).to_have_text('Проверить выбор');page.locator('#submit-decision').click();expect(page.locator('#submit-decision')).to_have_text('Подтвердить изменения');page.locator('#submit-decision').click();expect(page.locator('#decision')).not_to_be_visible();assert counts['confirm']==1;expect(page.locator('#content')).to_contain_text('оплачено наличными')
     for view in ['people','streams','audit','stats']:
      page.locator(f'[data-view="{view}"]').click();expect(page.locator('#notice')).to_have_text('');assert page.locator('main').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
     page.screenshot(path=str(OUT/f'{engine.name}-{scenario}-{width}-stats.png'))
    assert not errors,errors;results.append({'engine':engine.name,'scenario':scenario,'width':width,'passed':True});ctx.close()
   browser.close()
finally:server.shutdown();(OUT/'ui-results.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
print(json.dumps({'passed':len(results),'realWrites':0}))
