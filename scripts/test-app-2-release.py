"""Published assets with isolated synthetic API; no production user writes."""
import ast,json,hashlib,urllib.request,ssl,certifi
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output/app-2-body';URL='https://tg-app-telo-pomnit.vercel.app'
manifest={str(p.relative_to(ROOT/'output/app')).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in (ROOT/'output/app').rglob('*') if p.is_file()};http=[]
for name,sha in manifest.items():
 with urllib.request.urlopen(URL+'/'+name+'?release=J276',timeout=20,context=ssl.create_default_context(cafile=certifi.where())) as response:
  content=response.read();actual=hashlib.sha256(content).hexdigest();normalized=False
  if actual!=sha and Path(name).suffix in ['.html','.css','.js','.txt']:
   normalized=content.replace(b'\r\n',b'\n')==(ROOT/'output/app'/name).read_bytes().replace(b'\r\n',b'\n')
  assert actual==sha or normalized,name
  http.append({'file':name,'status':response.status,'sha256':actual,'line_endings_only':normalized})
tree=ast.parse((ROOT/'scripts/test-app-2-stream.py').read_text(encoding='utf-8'));defs=[]
for item in tree.body:
 if isinstance(item,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='server' for t in item.targets):break
 defs.append(item)
ns={'__file__':str(ROOT/'scripts/test-app-2-stream.py')};exec(compile(ast.Module(body=defs,type_ignores=[]),'fixture','exec'),ns);Fixture,base=ns['Fixture'],ns['base'];cases=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch()
 for state,width in [('new',390),('active',390),('between',390),('active',320),('active',430)]:
  ctx=browser.new_context(viewport={'width':width,'height':844},reduced_motion='reduce');page=ctx.new_page();fixture=Fixture(state);errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)));page.add_init_script('window.TelegramWebviewProxy={postEvent:()=>{}}')
  def route(r):
   if '/api/' in r.request.url:fixture.route(r)
   elif r.request.url.startswith(URL+'/'):r.continue_()
   else:r.abort()
  page.route('**/*',route);page.goto(URL+'/?release=J276#tgWebAppPlatform=ios&tgWebAppVersion=8.0');expect(page.locator('#screen-home')).to_have_class('screen screen--active',timeout=15000);base.settled(page)
  for tab in ['main','diary','diag','profile']:
   page.locator(f'.nav-btn[data-tab="{tab}"]').click();base.settled(page);expect(page.locator(f'#tab-{tab}')).to_have_class('tab-pane tab-pane--active')
   assert page.locator(f'#tab-{tab}').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
   page.screenshot(path=str(OUT/'screens'/f'published-{state}-{width}-{tab}.png'))
  page.locator('.nav-btn[data-tab="main"]').click();page.locator('#main-body-btn').click();base.settled(page)
  assert page.locator('#body-figure-svg image').evaluate('e=>e.href.baseVal').endswith('body-front-owner.png')
  page.screenshot(path=str(OUT/'screens'/f'published-{state}-{width}-body.png'))
  assert not errors,errors
  assert all(method=='GET' or path.startswith('/auth/') for method,path in fixture.requests),fixture.requests
  cases.append({'state':state,'width':width,'passed':True,'errors':errors});ctx.close()
 browser.close()
(OUT/'published-results.json').write_text(json.dumps({'public_files':http,'cases':cases,'scope':'Published bundle; synthetic API, no production user writes'},indent=2),encoding='utf-8');print('Published verification passed:',len(http),'HTTP content-verified files (text line endings normalized);',len(cases),'browser cases, 20 tabs + 5 body screens')
