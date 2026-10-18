from pathlib import Path
from playwright.sync_api import sync_playwright,expect
import json,sys,os,copy
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent
base=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8926/'
published=base.startswith('https:')
fixture=(R/'app/js/screen-review-fixture.js').read_text(encoding='utf-8')
fixture='\n'.join(line for line in fixture.splitlines()if "Object.defineProperty(window,'localStorage'" not in line)
fixture="const transportFetch=window.fetch;\n"+fixture+"\nconst fixtureFetch=window.fetch;window.fetch=(url,options={})=>new URL(url,location.href).pathname.includes('/diary-history')?transportFetch(url,options):fixtureFetch(url,options);window.ScreenReviewMode=false;"
samples=json.loads((H/'fictional-records.json').read_text(encoding='utf-8'));results=[]
with sync_playwright()as p:
 for engine,width in ([('chromium',390),('webkit',390)] if published else [('chromium',390),('chromium',320),('chromium',1440),('webkit',390)]):
  if os.getenv('UI_ENGINE') and engine!=os.getenv('UI_ENGINE'):continue
  browser=getattr(p,engine).launch();context=browser.new_context(viewport={'width':width,'height':844 if width<1000 else 1000},reduced_motion='reduce');context.add_init_script(fixture)
  rows=copy.deepcopy(samples);calls=[];errors=[];state={'failSearch':False,'failPut':False,'lostPut':False}
  def route(req):
   request=req.request;url=request.url;method=request.method;path=url.split('/api/',1)[-1].split('?')[0];calls.append((method,path))
   if not path.startswith('diary-history/'):raise AssertionError('Unexpected API request: '+path)
   if path.endswith('/search'):
    if state['failSearch']:req.fulfill(status=503,json={'error':'Синтетический сбой'});return
    d=request.post_data_json;norm=lambda s:s.lower().replace('ё','е');filtered=[r for r in rows if (not d['important'] or r['important']) and (d['kind']=='all' or r['kind']==d['kind']) and (d['period']!='custom' or (not d.get('from') or r['day']>=d['from']) and (not d.get('to') or r['day']<=d['to'])) and all(w in norm(r['title']+' '+r['text']+' '+' '.join(r.get('tags',[]))) for w in norm(d['query']).split())]
    req.fulfill(json={'entries':filtered[d['offset']:d['offset']+d['limit']],'total':len(filtered),'offset':d['offset'],'hasMore':d['offset']+d['limit']<len(filtered)});return
   source,rid=path.split('/')[1:3];row=next(r for r in rows if r['source']==source and r['id']==rid)
   if method=='GET':req.fulfill(json=row);return
   if state['failPut']:req.fulfill(status=503,json={'error':'Синтетический сбой'});return
   row['important']=request.post_data_json['important']
   if state['lostPut']:state['lostPut']=False;req.abort('failed');return
   req.fulfill(json={'source':source,'id':rid,'important':row['important']})
  context.route('**/api/**',route);page=context.new_page();page.set_default_timeout(15000);page.on('pageerror',lambda e:errors.append(str(e)))
  def enter():
   page.wait_for_function("()=>typeof currentScreen!=='undefined'&&currentScreen==='home'");page.evaluate("closeQInvite();switchTab('diary')");page.locator('#diary-history-btn').click();expect(page.locator('#hm-count')).to_have_text('110 записей')
  page.goto(base+'?fixture=JAPP094',wait_until='domcontentloaded');enter()
  expect(page.locator('.hm-card')).to_have_count(10);expect(page.locator('#export-pdf-btn')).to_be_visible()
  for selector in ['#hm-back','#export-pdf-btn','.hm-star','.hm-open']:
   b=page.locator(selector).first.bounding_box();assert b['height']>=44,(selector,b)
  assert page.locator('#screen-history').evaluate('e=>e.scrollWidth<=e.clientWidth')
  page.get_by_role('button',name='Показать ещё',exact=True).click();expect(page.locator('.hm-card')).to_have_count(20)
  page.locator('#hm-search').fill('елка пауза');expect(page.locator('.hm-card')).to_have_count(1);expect(page.locator('#hm-count')).to_have_text('1 запись');expect(page.locator('.hm-card')).to_contain_text('<img src=x');assert page.locator('.hm-card img').count()==0
  page.locator('.hm-open').click();expect(page.locator('.hm-full-text')).to_contain_text('ёлка');page.locator('#hm-detail-back').click();expect(page.locator('#hm-search')).to_have_value('елка пауза');expect(page.locator('.hm-card')).to_have_count(1)
  print(engine,width,'search/detail',flush=True)
  # Failed ACK never displays a saved favorite; ambiguous retry is explicit set, not inverse toggle.
  star=page.locator('#history-list .hm-star');expect(star).to_have_attribute('aria-pressed','false');state['failPut']=True;star.click();expect(page.locator('#hm-local-status')).to_contain_text('Не удалось подтвердить');expect(star).to_be_enabled();expect(star).to_have_attribute('aria-pressed','false')
  state['failPut']=False;state['lostPut']=True;star.click();expect(page.locator('#hm-local-status')).to_contain_text('Не удалось подтвердить');expect(star).to_be_enabled();expect(star).to_have_attribute('aria-pressed','false');star.click();expect(star).to_have_attribute('aria-pressed','true');expect(star).to_be_enabled()
  page.reload(wait_until='domcontentloaded');enter();page.locator('#hm-important').click();expect(page.locator('#hm-count')).to_have_text('3 записи');page.locator('#hm-search').fill('елка пауза');expect(page.locator('.hm-card')).to_have_count(1)
  page.locator('#history-list .hm-star').click();expect(page.locator('.hm-card')).to_have_count(0);expect(page.get_by_text('Записи не нашлись',exact=True)).to_be_visible()
  page.locator('#hm-reset').click();expect(page.locator('.hm-card')).to_have_count(2);page.locator('#hm-all').click();expect(page.locator('#hm-count')).to_have_text('110 записей')
  page.locator('#hm-kind').select_option('analysis');expect(page.locator('#hm-count')).to_have_text('2 записи');page.locator('.hm-open').first.click();expect(page.locator('.hm-detail-top h2')).to_have_text('После разбора');page.locator('#hm-detail-back').click();expect(page.locator('#hm-kind')).to_have_value('analysis')
  page.locator('#hm-period').select_option('custom');page.locator('#hm-from').fill('2026-10-18');page.locator('#hm-to').fill('2026-09-01');expect(page.locator('#hm-invalid')).to_be_visible();expect(page.get_by_text('Проверьте период',exact=True)).to_be_visible();page.locator('#hm-reset').click();expect(page.locator('#hm-count')).to_have_text('110 записей')
  print(engine,width,'favorite/filter',flush=True)
  # Server failure is not an empty history. Legacy own-device observations stay reachable.
  state['failSearch']=True;page.locator('#hm-search').fill('несуществующее');expect(page.get_by_text('История пока не загрузилась',exact=True)).to_be_visible();page.get_by_role('button',name='Открыть записи на устройстве').click();expect(page.locator('.hm-local-caption')).to_be_visible();state['failSearch']=False;page.get_by_role('button',name='Загрузить всю историю').click();expect(page.get_by_text('Записи не нашлись',exact=True)).to_be_visible();page.locator('#hm-reset').click();expect(page.locator('#hm-count')).to_have_text('110 записей')
  print(engine,width,'fallback',flush=True)
  # Older completed searches cannot overwrite the later query.
  page.evaluate("""()=>{window.nativeSearch=Api.searchDiaryHistory;window.heldSearches=[];Api.searchDiaryHistory=()=>new Promise(resolve=>heldSearches.push(resolve));}""")
  page.locator('#hm-search').fill('старый');page.wait_for_function('heldSearches.length===1');page.locator('#hm-search').fill('новый');page.wait_for_function('heldSearches.length===2')
  page.evaluate("heldSearches[1]({entries:[],total:0,hasMore:false})");expect(page.get_by_text('Записи не нашлись',exact=True)).to_be_visible();page.evaluate('heldSearches[0]({entries:[],total:99,hasMore:false})');expect(page.locator('#hm-count')).to_have_text('0 записей');page.evaluate('()=>{Api.searchDiaryHistory=nativeSearch;}');page.locator('#hm-reset').click();expect(page.locator('#hm-count')).to_have_text('110 записей')
  page.screenshot(path=str(H/f'{"published" if published else "local"}-{engine}-{width}.png'),full_page=True)
  # An in-flight response and visible records are both invalidated at logout.
  page.evaluate("()=>{Api.searchDiaryHistory=()=>new Promise(resolve=>window.pendingLogoutSearch=resolve);}");page.locator('#hm-search').fill('выход');page.wait_for_function("typeof pendingLogoutSearch==='function'");page.evaluate("()=>{Api.logout();pendingLogoutSearch({entries:[],total:42,hasMore:false});}");expect(page.locator('#hm-count')).to_have_text('');expect(page.locator('.hm-card')).to_have_count(0)
  assert not errors,errors
  results.append({'engine':engine,'width':width,'allServerHistory':True,'pagination':True,'safeText':True,'detailFilterReturn':True,'favoriteAckOnly':True,'lostAckExplicitRetry':True,'favoriteReload':True,'removeFromImportant':True,'invalidDates':True,'serverErrorNotEmpty':True,'localFallback':True,'staleSearchGuard':True,'logoutGuard':True,'pdfPreserved':True,'touch44':True,'pageErrors':errors,'realPeople':0,'openai':0,'notifications':0})
  (H/('published-ui.json' if published else 'ui-results.json')).write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8');context.close();browser.close();print(engine,width,'PASS',flush=True)
