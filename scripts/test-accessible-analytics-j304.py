"""Accessible state and truthful analytics, isolated API and actual browser clicks."""
import ast,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'output/app-2-refinement'
p=ROOT/'scripts/test-app-2-refinement.py';nodes=[]
for n in ast.parse(p.read_text(encoding='utf-8')).body:
 if isinstance(n,ast.Try):break
 nodes.append(n)
ns={'__file__':str(p)};exec(compile(ast.Module(body=nodes,type_ignores=[]),'fixture','exec'),ns)
results=[]
try:
 with ns['sync_playwright']() as pw:
  for engine in [pw.chromium,pw.webkit]:
   browser=engine.launch()
   for width in [320,390,430]:
    page=browser.new_page(viewport={'width':width,'height':844},reduced_motion='reduce');fixture=ns['Fixture']('active');calls=[];errors=[]
    page.add_init_script('window.TelegramWebviewProxy={postEvent:()=>{}}');page.on('pageerror',lambda e:errors.append(str(e)))
    def route(r):
     if '/api/' in r.request.url:calls.append([r.request.method,r.request.url.split('/api',1)[1]]);fixture.route(r)
     elif r.request.url.startswith('http://127.0.0.1:'):r.continue_()
     else:r.abort()
    page.route('**/*',route);page.goto(f"http://127.0.0.1:{ns['server'].server_port}/#tgWebAppPlatform=ios&tgWebAppVersion=8.0");ns['expect'](page.locator('#screen-home')).to_have_class('screen screen--active',timeout=15000)
    page.locator('.nav-btn[data-tab=diary]').click()
    assert 'подряд' in page.locator('#streak-days-sub').inner_text()
    assert page.evaluate('[1,2,5,11,21].map(pluralStreakDays)')==['день подряд','дня подряд','дней подряд','дней подряд','день подряд']
    page.locator('#stop-reaction-btn').click();zones=page.locator('#trigger-zone-chips .zone-chip');zones.nth(0).click();ns['expect'](zones.nth(0)).to_have_attribute('aria-pressed','true');zones.nth(1).click();ns['expect'](zones.nth(0)).to_have_attribute('aria-pressed','false');zones.nth(1).click();assert zones.filter(has=page.locator('[aria-pressed=true]')).count()==0;assert page.locator('#trigger-zone-chips [aria-pressed=true]').count()==0;ns['back'](page)
    page.evaluate("""Storage._diaries.set(Storage._userId,[{id:'d1',zone:'chest',sensations:['tension'],date:'2026-10-08T12:00:00Z',note:'Тест'}]);Storage._checkins.set(Storage._userId,[{id:'c1',date:'2026-10-08T12:00:00Z',legacyScale:false,tension:2,anxiety:3,energy:4,safety:5,bodyContact:6},{id:'c2',date:'2026-10-09T12:00:00Z',legacyScale:false,tension:4,anxiety:5,energy:6,safety:7,bodyContact:8},{id:'c3',date:'2026-10-22T12:00:00Z',legacyScale:false,tension:8,anxiety:7,energy:6,safety:5,bodyContact:4},{id:'old',date:'2026-10-08T12:00:00Z',legacyScale:true,tension:10}])""")
    page.locator('.nav-btn[data-tab=diag]').click();page.locator('.hmap-week-btn[data-week="2"]').click();ns['expect'](page.locator('.hmap-week-btn[data-week="2"]')).to_have_attribute('aria-pressed','true');assert page.locator('.hmap-week-btn[aria-pressed=true]').count()==1
    assert page.locator('.hmap-week-btn').first.bounding_box()['height']>=44
    assert page.locator('.nav-btn').first.evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')>=11
    assert page.locator('.checkin-chart-svg circle').count()==10;assert page.locator('.checkin-chart-svg g[data-scale] line').count()==0
    table=page.locator('.checkin-values');assert not table.evaluate('e=>e.open');table.locator('summary').focus();page.keyboard.press('Enter');ns['expect'](table).to_have_attribute('open','')
    assert table.locator('tbody tr').count()==5
    assert table.locator('tbody tr').first.locator('td').all_text_contents()==['Нет данных','3','Нет данных','8','Нет данных']
    assert table.locator('tbody tr').nth(4).locator('td').nth(1).inner_text()=='7'
    region=page.locator('.checkin-values-scroll');assert region.get_attribute('tabindex')=='0';assert region.evaluate('e=>e.scrollWidth>e.clientWidth');region.focus();page.keyboard.press('ArrowRight');ns['base'].settled(page)
    assert page.locator('#tab-diag').evaluate('e=>e.scrollWidth<=e.clientWidth+1');table.scroll_into_view_if_needed();page.screenshot(path=str(OUT/'screens'/f'j304-{engine.name}-{width}-values.png'))
    page.locator('.nav-btn[data-tab=profile]').click();attendance=page.locator('.meeting-attendance').first;label=page.locator('.meeting-attendance-label').first;ns['expect'](label).to_have_text('Отметить участие');attendance.click();ns['expect'](page.locator('.meeting-attendance').first).to_have_attribute('aria-pressed','true');ns['expect'](page.locator('.meeting-attendance-label').first).to_have_text('Участвовала');page.locator('.meeting-attendance-control').first.scroll_into_view_if_needed();page.screenshot(path=str(OUT/'screens'/f'j304-{engine.name}-{width}-participation.png'))
    assert not errors,errors;assert all(m=='GET' or path.startswith('/auth/') for m,path in calls),calls
    results.append({'engine':engine.name,'width':width,'passed':True,'rows':5,'points':10,'gapLines':0});page.close()
   browser.close()
finally:ns['server'].shutdown()
(OUT/'j304-results.json').write_text(json.dumps(results,indent=2),encoding='utf-8');print('J304:',len(results),'cases passed')
