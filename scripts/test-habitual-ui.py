"""Actual bundle, synthetic accounts/API only. No participant data or production writes."""
import ast, json, threading, hashlib
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
tree=ast.parse((ROOT/'scripts/test-stage3-ui.py').read_text(encoding='utf-8'))
defs=[]
for statement in tree.body:
    if isinstance(statement,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='server' for t in statement.targets):break
    defs.append(statement)
exec(compile(ast.Module(body=defs,type_ignores=[]),'fixture','exec'),globals())
Base=Fixture
OUT=ROOT/'output/habitual-ui';OUT.mkdir(parents=True,exist_ok=True)
class Fixture(Base):
    def __init__(self):super().__init__();self.result=None;self.fail=False;self.posts=[]
    def route(self,route):
        request=route.request;path=request.url.split('/api',1)[1]
        if path=='/habitual/result':
            if request.method=='POST':
                body=request.post_data_json;self.posts.append(body)
                if self.fail:route.fulfill(status=503,content_type='application/json',body='{"error":"synthetic offline"}');return
                self.result={**body,'date':'2026-10-09T10:00:00Z'}
            route.fulfill(status=200,content_type='application/json',body=json.dumps(self.result));return
        super().route(route)
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT/'output/app')))
threading.Thread(target=server.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{server.server_port}/#tgWebAppPlatform=ios&tgWebAppVersion=8.0'
results=[]
try:
 with sync_playwright() as p:
  for engine in [p.chromium,p.webkit]:
   browser=engine.launch()
   for scenario in ['full','incomplete','draft','offline','legacy','states','owner']:
    fixture=Fixture();errors=[]
    context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True)
    page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
    page.route('**/api/**',fixture.route);page.goto(url);expect(page.locator('#screen-home')).to_have_class('screen screen--active',timeout=15000)
    page.evaluate("switchTab('diag')")
    expect(page.locator('#diag-tab-content')).to_contain_text('Ведущая привычная реакция')
    if scenario in ['full','incomplete','offline']:
      fixture.fail=scenario=='offline'
      page.locator('#diag-tab-content .btn--primary').click()
      for i in range(16):
        value=5 if scenario=='incomplete' else 4 if i%4==0 else 0
        page.locator('.diag-quiz-option').nth(value).click()
        assert page.locator('.diag-quiz-option[aria-pressed="true"]').count()==1
        page.locator('.habitual-controls .btn--primary').click()
      page.wait_for_function("Storage.getHabitualResult()!==null")
      page.wait_for_function("!Storage.getHabitualDraft()")
      if scenario=='incomplete':
        expect(page.locator('#diag-tab-content')).to_contain_text('Пока недостаточно ответов')
        page.get_by_text('Вернуться к вопросам',exact=True).click();expect(page.locator('.diag-quiz-counter')).to_have_text('Утверждение 1 из 16')
        page.locator('.diag-quiz-option').nth(2).click();page.evaluate('renderMyPathTab()')
      else:
        page.wait_for_function("document.querySelector('#diag-tab-content').textContent.includes('В ваших ответах чаще встречалось замирание')")
      if scenario=='offline':
        assert page.evaluate('Storage.getHabitualResult().syncStatus')=='pending'
        fixture.fail=False;page.get_by_text('Повторить сохранение',exact=True).click();page.wait_for_function("Storage.getHabitualResult().syncStatus==='synced'")
        assert fixture.posts[0]['clientId']==fixture.posts[-1]['clientId']
      elif scenario=='full':
        page.wait_for_function("Storage.getHabitualResult().syncStatus==='synced'")
        page.screenshot(path=str(OUT/f'{engine.name}-result.png'),full_page=True)
        page.reload();expect(page.locator('#screen-home')).to_have_class('screen screen--active',timeout=15000);page.evaluate("switchTab('diag')")
        expect(page.locator('#diag-tab-content')).to_contain_text('В ваших ответах чаще встречалось замирание')
      page.get_by_text('Посмотреть свои ответы',exact=True).click();assert page.locator('.habitual-answers li').count()==16
      page.evaluate('goBack()');assert page.locator('.habitual-answers').count()==0
    elif scenario=='draft':
      page.locator('#diag-tab-content .btn--primary').click();page.locator('.diag-quiz-option').nth(6).click();page.locator('.habitual-controls .btn--primary').click()
      page.locator('.diag-quiz-option').nth(2).click();page.locator('.habitual-controls .btn--primary').click()
      page.reload();expect(page.locator('#screen-home')).to_have_class('screen screen--active',timeout=15000);page.evaluate("switchTab('diag')")
      page.get_by_text('Продолжить опрос',exact=True).click();expect(page.locator('.diag-quiz-counter')).to_have_text('Утверждение 3 из 16')
      page.evaluate('goBack()');expect(page.locator('.diag-quiz-counter')).to_have_text('Утверждение 2 из 16')
      assert page.evaluate('diag.answers[0]')==6
      page.screenshot(path=str(OUT/f'{engine.name}-question.png'),full_page=True)
    elif scenario=='legacy':
      page.evaluate("Storage._set(KEYS.DIAG,JSON.stringify({patternId:'freeze',scores:{freeze:10}}));renderMyPathTab()")
      page.locator('.diag-legacy summary').click();expect(page.locator('.diag-legacy')).to_contain_text('предыдущим вопросам')
      assert page.evaluate('Storage.getDiagResult().scores.freeze')==10
    elif scenario=='owner':
      page.locator('#diag-tab-content .btn--primary').click();page.locator('.diag-quiz-option').nth(3).click()
      page.evaluate("Storage.bindUser('b');pickDiagAnswer(4,0);renderMyPathTab()")
      assert page.evaluate('Storage.getHabitualDraft()') is None
    elif scenario=='states':
      cases=[([0]*16,'ведущая не выделилась'),([1]*16,'Вы редко отмечали'),([4]*16,'одинаково часто'),([4]+[0]*15,'нельзя выделить')]
      for answers,text in cases:
        page.evaluate("a=>{Storage._set('habitual_result_v2',JSON.stringify({...Habitual.calculate(a),syncStatus:'synced'}));renderMyPathTab()}",answers)
        expect(page.locator('#diag-tab-content')).to_contain_text(text)
    assert not errors,errors
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    results.append({'engine':engine.name,'scenario':scenario,'passed':True});context.close()
   browser.close()
finally:server.shutdown()
(OUT/'results.json').write_text(json.dumps({'bundleSha256':hashlib.sha256((ROOT/'output/app/index.html').read_bytes()).hexdigest(),'results':results},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'passed':len(results),'engines':2,'synthetic':True}))
