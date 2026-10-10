"""Private-data acceptance: actual local UI, synthetic API/Telegram, no real writes."""
import hashlib, json, os, threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/stage3-ui'
OUT.mkdir(parents=True, exist_ok=True)
HASH = 'a' * 64
NOTE = 'SYNTHETIC_PRIVATE_NOTE'
PDF_PATH = ROOT / 'output/pdf/dnevnik-tela-fixture.pdf'

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

class Fixture:
    def __init__(self):
        self.blocked = False
        self.ai_fail = False
        self.preview_fail = False
        self.rights_fail = False
        self.export_revoked = False
        self.delete_fail = False
        self.deleted = False
        self.hold_diary = False
        self.diary_route = None
        self.calls = []
        self.ai_posts = []
        self.preview_posts = []
        self.deletes = []
        self.rights_auths = 0
        self.hold_rights = False
        self.rights_route = None
        self.rights_user = 'a'
        self.diary = [{'id': 'one', 'createdAt': '2026-10-08T12:00:00Z', 'zone': 'chest', 'sensations': ['tension'], 'note': NOTE},
                      {'id': 'two', 'createdAt': '2026-10-07T12:00:00Z', 'zone': 'belly', 'sensations': [], 'note': 'SECOND_NOTE'}]
        self.export = {'exportVersion': 'personal-data-v1', 'profile': {'id': 'a', 'name': 'Учебная участница'},
                       'diary': self.diary + [{'id': 'export-last', 'createdAt': '2026-10-06T12:00:00Z', 'zone': 'chest', 'sensations': [], 'note': 'EXPORT_LAST'}],
                       'triggers': [{'situation': 'EXPORTED_TRIGGER'}], 'checkins': [{'tension': 1, 'anxiety': 3, 'energy': 5, 'safety': 7, 'bodyContact': 9}],
                       'diagnostic': [], 'questionnaires': [], 'aiSessions': [{'sessionId': 'legacy', 'messages': [{'role': 'user', 'content': 'EXPORTED_AI'}]}],
                       'feedback': [{'text': 'EXPORTED_FEEDBACK'}], 'enrollments': [], 'paymentOrders': [], 'pendingEnrollments': []}
    def route(self, route):
        req = route.request
        path = req.url.split('/api', 1)[1]
        self.calls.append((req.method, path, req.headers.get('authorization')))
        status = 200
        if path == '/auth/telegram':
            if self.blocked: status, body = 403, {'code': 'CLUB_ACCESS_REJECTED', 'error': 'Fixture admission denied'}
            else: body = {'token': 'club-fixture', 'user': {'id': 'a', 'name': 'Учебная участница', 'consentGivenAt': '2026-10-06'}}
        elif path == '/auth/data-rights':
            self.rights_auths += 1
            if self.hold_rights:
                self.rights_route = route; self.hold_rights = False; return
            if self.rights_fail: status, body = 401, {'error': 'Fixture identity failed'}
            else: body = {'token': 'rights-fixture', 'purpose': 'data-rights', 'user': {'id': self.rights_user}, 'expiresIn': 600, 'accountDeleted': self.deleted}
        elif path.startswith('/diary?'):
            if self.hold_diary:
                self.diary_route = route; return
            body = self.diary
        elif path == '/diary' and req.method == 'POST':
            status, body = 500, {'error': 'Fixture pending diary unavailable'}
        elif path == '/ai/context-preview':
            ids = req.post_data_json['diaryEntryIds']; self.preview_posts.append(ids)
            if self.preview_fail: status, body = 403, {'code': 'AI_CONTEXT_UNAVAILABLE', 'error': 'Чужие записи недоступны'}
            else: body = {'contextMode': 'selected', 'contextVersion': 'diary-selection-v1', 'contextHash': HASH,
                          'contextSnapshot': [row for row in self.diary if row['id'] in ids],
                          'contextText': json.dumps([row for row in self.diary if row['id'] in ids], ensure_ascii=False, separators=(',', ':'))}
        elif path == '/ai/chat':
            data = req.post_data_json; self.ai_posts.append(data)
            if self.ai_fail: status, body = 503, {'error': 'AI временно недоступен. Текст остаётся в поле.'}
            else:
                selected = data.get('contextMode') == 'selected'
                body = {'reply': 'Учебный ответ', 'sessionId': data.get('sessionId') or 'new-fixture',
                        'contextMode': 'selected' if selected else 'none', 'contextSnapshot': self.diary if selected else [],
                        'contextText': NOTE+'\nSECOND_NOTE' if selected else '', 'contextVersion': 'diary-selection-v1'}
        elif path == '/ai/sessions':
            body = [{'sessionId': 'legacy', 'createdAt': '2026-10-01T12:00:00Z'}, {'sessionId': 'frozen', 'createdAt': '2026-10-02T12:00:00Z'}]
        elif path.startswith('/ai/sessions/'):
            frozen = path.endswith('/frozen')
            body = {'sessionId': 'frozen' if frozen else 'legacy', 'messages': [{'role': 'user', 'content': 'Старое учебное сообщение'}],
                    'contextMode': 'selected' if frozen else None, 'contextSnapshot': self.diary if frozen else []}
        elif path == '/gdpr/my-data':
            assert req.headers.get('authorization') == 'Bearer rights-fixture'
            if self.export_revoked: status,body = 401,{'error':'Проверка личности истекла'}
            else: body = self.export
        elif path == '/gdpr/diary.pdf':
            assert req.headers.get('authorization') == 'Bearer rights-fixture'
            route.fulfill(status=200,content_type='application/pdf',body=PDF_PATH.read_bytes())
            return
        elif path == '/gdpr/delete-me':
            assert req.headers.get('authorization') == 'Bearer rights-fixture'
            self.deletes.append(req.post_data_json)
            if self.delete_fail: status, body = 500, {'error': 'Удаление не выполнено. Можно повторить.'}
            else: self.deleted = True; body = {'success': True, 'message': 'Личные данные приложения удалены'}
        else:
            body = {'/me': {'name': 'Учебная участница'}, '/me/enrollment/access': {'ai': {'canWrite': True, 'message': 'Доступ к AI открыт'}, 'streams': []},
                    '/triggers?limit=90': [], '/checkins?limit=200': [], '/diagnostic/result': None}.get(path, {})
        route.fulfill(status=status, content_type='application/json', body=json.dumps(body, ensure_ascii=False))

def home(page):
    expect(page.locator('#screen-home')).to_have_class('screen screen--active', timeout=15000)
    page.locator('.nav-btn[data-tab="diary"]').click()
def open_ai(page):
    page.locator('#ai-chat-btn').click()
    expect(page.locator('#ai-context-mode')).to_have_value('none')
    expect(page.locator('#ai-send-btn')).to_be_enabled()
def rights(page, blocked=False):
    if not blocked: page.locator('.nav-btn[data-tab="profile"]').click()
    page.locator('#blocked-data-rights-btn' if blocked else '#data-rights-btn').click()
    expect(page.locator('#screen-data-rights')).to_have_class('screen screen--active')
def send(page, text='SYNTHETIC_MESSAGE'):
    page.locator('#ai-input').fill(text); page.locator('#ai-send-btn').click()
def selected(page):
    page.locator('#ai-context-mode').select_option('selected')
    expect(page.locator('#ai-context-choices input')).to_have_count(2)
    page.locator('#ai-context-choices input[value="one"]').check()
    page.locator('#ai-context-choices input[value="two"]').check()
    expect(page.locator('#ai-send-btn')).to_be_disabled()
    page.locator('#ai-context-preview-btn').click()
    page.locator('#ai-context-exact-details summary').click()
    expect(page.locator('#ai-context-preview')).to_contain_text(NOTE)
    assert json.loads(page.locator('#ai-context-preview').inner_text())[1]['id'] == 'two'
    expect(page.locator('#ai-context-review')).not_to_be_checked()
    expect(page.locator('#ai-send-btn')).to_be_disabled()
    page.locator('#ai-context-review').check()
def download(page, selector):
    with page.expect_download() as info: page.locator(selector).click()
    result = info.value
    return result.suggested_filename, Path(result.path()).read_text(encoding='utf-8')
def confirm_delete(page):
    page.locator('#data-delete-start').click()
    page.locator('#data-delete-confirm').scroll_into_view_if_needed()
    page.screenshot(path=str(OUT/f'{page.context.browser.browser_type.name}-delete-confirmation.png'))
    page.locator('#data-delete-phrase').fill('УДАЛИТЬ МОИ ДАННЫЕ')
    expect(page.locator('#data-delete-submit')).to_be_enabled()
    page.locator('#data-delete-submit').click()

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT/'output/app')))
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}/#tgWebAppPlatform=ios&tgWebAppVersion=8.0'
results = []
try:
    with sync_playwright() as playwright:
        for engine in (playwright.chromium, playwright.webkit):
            browser = engine.launch()
            scenarios = ['ai-default-none', 'ai-selected', 'ai-refusal', 'ai-failure', 'ai-legacy-frozen', 'ai-foreign-preview',
                         'rights-blocked', 'rights-identity-retry', 'rights-expiry', 'export-categories-pending', 'print-html',
                         'delete-cancel', 'delete-failure', 'delete-race-success', 'rights-auth-race', 'rights-startup-race', 'rights-revoked', 'desktop-privacy']
            if os.environ.get('STAGE3_TEST_SCENARIOS'): scenarios = os.environ['STAGE3_TEST_SCENARIOS'].split(',')
            for scenario in scenarios:
                print(f'Checking {engine.name}: {scenario}', flush=True)
                fixture = Fixture(); errors = []; logs = []
                viewport = {'width': 1280, 'height': 900} if scenario == 'desktop-privacy' else {'width': 375, 'height': 667}
                context = browser.new_context(viewport=viewport, is_mobile=scenario!='desktop-privacy', accept_downloads=True)
                page = context.new_page()
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('console', lambda msg: logs.append(msg.text))
                page.add_init_script("window.TelegramWebviewProxy={postEvent:()=>{}};Object.defineProperty(navigator,'canShare',{value:()=>false})")
                # Fixture-only owner A pending, foreign B and unowned legacy must stay isolated.
                if scenario in ('export-categories-pending', 'delete-race-success', 'delete-failure'):
                    page.add_init_script("""if(!localStorage.getItem('seeded')){
                      localStorage.setItem('tp_user:a:diary_v2',JSON.stringify([{id:'pending-a',clientId:'00000000-0000-4000-8000-000000000001',date:'2026-10-08T12:00:00Z',zone:'chest',sensations:[],note:'PENDING_A',syncStatus:'pending'}]));
                      localStorage.setItem('tp_user:b:diary_v2',JSON.stringify([{id:'foreign',note:'FOREIGN_B',syncStatus:'pending'}]));
                      localStorage.setItem('tp_diary_entries','UNOWNED_LEGACY');localStorage.setItem('seeded','1');}""")
                fixture.blocked = scenario in ('rights-blocked', 'rights-identity-retry', 'rights-startup-race')
                fixture.rights_fail = scenario == 'rights-identity-retry'
                fixture.ai_fail = scenario == 'ai-failure'
                fixture.preview_fail = scenario == 'ai-foreign-preview'
                fixture.delete_fail = scenario == 'delete-failure'
                if scenario == 'rights-expiry': page.clock.install()
                if scenario == 'rights-startup-race': page.clock.install(time='2026-10-08T11:00:00Z')
                if scenario == 'rights-startup-race': page.clock.pause_at('2026-10-08T12:00:00Z')
                page.route('**/api/**', fixture.route); page.goto(url)
                if fixture.blocked:
                    expect(page.locator('#blocked-data-rights-btn')).to_be_visible()
                    rights(page, True)
                else: home(page)
                if scenario.startswith('ai-') or scenario == 'desktop-privacy':
                    open_ai(page)
                    if scenario in ('ai-selected', 'ai-refusal', 'desktop-privacy'):
                        selected(page)
                        page.locator('#ai-context-preview').scroll_into_view_if_needed()
                        page.screenshot(path=str(OUT/f'{engine.name}-{scenario}-preview.png'))
                        if scenario == 'ai-refusal': page.locator('#ai-context-mode').select_option('none')
                    if scenario == 'ai-foreign-preview':
                        page.locator('#ai-context-mode').select_option('selected')
                        page.locator('#ai-context-choices input[value="one"]').check()
                        page.locator('#ai-context-preview-btn').click()
                        expect(page.locator('#ai-access-notice')).to_contain_text('Чужие записи недоступны')
                        expect(page.locator('#ai-send-btn')).to_be_disabled()
                        assert fixture.ai_posts == []
                    elif scenario == 'ai-legacy-frozen':
                        expect(page.locator('#ai-history-select option[value="legacy"]')).to_have_count(1)
                        page.locator('#ai-history-select').select_option('legacy')
                        expect(page.locator('#ai-context-status')).to_contain_text('Какие записи передавались в него раньше, не сохранено')
                        page.locator('#ai-history-select').select_option('frozen')
                        expect(page.locator('#ai-context-status')).to_contain_text('Другие записи можно выбрать в новом разговоре')
                        expect(page.locator('#ai-context-mode')).to_have_count(0)
                        expect(page.locator('#ai-context-preview')).to_contain_text(NOTE)
                    elif scenario == 'desktop-privacy':
                        assert page.locator('#ai-context-preview').evaluate('el=>el.getBoundingClientRect().right<=innerWidth')
                        page.evaluate("goTo('home',true)")
                        rights(page)
                        expect(page.locator('#data-rights-actions')).to_be_visible()
                    else:
                        send(page)
                        if scenario == 'ai-failure':
                            expect(page.locator('#ai-access-notice')).to_contain_text('временно недоступен')
                            expect(page.locator('#ai-input')).to_have_value('SYNTHETIC_MESSAGE')
                            assert page.evaluate('aiSessionId') is None
                        else:
                            expect(page.locator('#ai-input')).to_have_value('')
                            body = fixture.ai_posts[0]
                            if scenario == 'ai-selected':
                                assert body['contextMode']=='selected' and body['diaryEntryIds']==['one','two'] and body['contextPreviewHash']==HASH
                                expect(page.locator('#ai-context-status')).to_contain_text('Другие записи можно выбрать в новом разговоре')
                                send(page, 'SECOND_MESSAGE'); expect(page.locator('#ai-input')).to_have_value('')
                                assert fixture.ai_posts[1]['sessionId']=='new-fixture' and 'diaryEntryIds' not in fixture.ai_posts[1]
                            else: assert body['contextMode']=='none' and 'diaryEntryIds' not in body and 'contextPreviewHash' not in body
                else:
                    if not fixture.blocked: rights(page)
                    if scenario == 'rights-identity-retry':
                        expect(page.locator('#data-rights-status')).to_contain_text('Не удалось подтвердить')
                        expect(page.locator('#data-rights-actions')).to_be_hidden()
                        fixture.rights_fail=False;page.locator('#data-rights-retry').click()
                    expect(page.locator('#data-rights-actions')).to_be_visible()
                    if scenario == 'rights-startup-race':
                        page.clock.fast_forward(500)
                        expect(page.locator('#screen-data-rights')).to_have_class('screen screen--active')
                        assert not page.evaluate('Api.isAuthed()')
                    elif scenario in ('rights-blocked', 'rights-identity-retry'):
                        assert not page.evaluate('Api.isAuthed()') and page.evaluate('Storage._userId') is None
                        expect(page.locator('#screen-home')).not_to_have_class('screen screen--active')
                        assert page.evaluate("localStorage.getItem('tp_jwt')") is None
                    elif scenario == 'rights-expiry':
                        page.clock.fast_forward(601000)
                        download(page, '#data-export-json'); assert fixture.rights_auths==2
                    elif scenario == 'rights-auth-race':
                        fixture.hold_rights = True
                        with page.expect_request(lambda req: '/auth/data-rights' in req.url):
                            page.evaluate('window.oldAuthDone=false;DataRightsApi.auth().catch(()=>{}).finally(()=>window.oldAuthDone=true);void 0')
                        fixture.rights_user = 'b'
                        page.evaluate('DataRightsApi.auth()')
                        fixture.rights_route.fulfill(status=200,content_type='application/json',body=json.dumps({'token':'stale-rights-token','user':{'id':'a'},'expiresIn':600}))
                        page.wait_for_function('window.oldAuthDone')
                        assert page.evaluate('DataRightsApi.userId') == 'b'
                        assert page.evaluate('DataRightsApi._token') == 'rights-fixture'
                        assert page.evaluate('Storage._userId') == 'a' and page.evaluate('Api.isAuthed()')
                    elif scenario == 'rights-revoked':
                        fixture.export_revoked = True
                        page.locator('#data-export-json').click()
                        expect(page.locator('#data-rights-status')).to_contain_text('Проверка личности истекла')
                        assert page.evaluate('Storage.getDiaryEntries().length') > 0
                        fixture.export_revoked = False
                        page.locator('#data-rights-retry').click()
                        expect(page.locator('#data-rights-status')).to_contain_text('Личность подтверждена')
                        name,text=download(page,'#data-export-json')
                        assert 'EXPORT_LAST' in text and fixture.rights_auths == 2
                    elif scenario == 'export-categories-pending':
                        name, text = download(page, '#data-export-json'); data=json.loads(text)
                        assert name.endswith('.json') and {'diary','triggers','checkins','diagnostic','questionnaires','aiSessions','feedback','enrollments','paymentOrders'}<=set(data)
                        assert 'EXPORT_LAST' in text
                        name, text=download(page,'#data-export-local')
                        assert name.endswith('.json') and 'PENDING_A' in text and 'FOREIGN_B' not in text and 'UNOWNED_LEGACY' not in text
                    elif scenario == 'print-html':
                        page.locator('#data-rights-close').click()
                        page.locator('.nav-btn[data-tab="diary"]').click()
                        page.locator('#screen-home').get_by_role('button',name='История записей').click()
                        page.locator('#export-pdf-btn').click()
                        expect(page.locator('#pdf-download-file')).to_be_visible()
                        with page.expect_download() as download_info: page.locator('#pdf-download-file').click()
                        pdf=download_info.value
                        assert pdf.suggested_filename.endswith('.pdf')
                        assert Path(pdf.path()).read_bytes()==PDF_PATH.read_bytes()
                        assert Path(pdf.path()).read_bytes().startswith(b'%PDF-')
                    elif scenario == 'delete-cancel':
                        page.locator('#data-delete-start').click()
                        page.locator('#data-delete-phrase').fill('УДАЛИТЬ')
                        expect(page.locator('#data-delete-submit')).to_be_disabled()
                        page.locator('#data-delete-cancel').click()
                        expect(page.locator('#data-delete-confirm')).to_be_hidden();assert fixture.deletes==[]
                    elif scenario == 'delete-failure':
                        confirm_delete(page)
                        expect(page.locator('#data-rights-status')).to_contain_text('Удаление не выполнено')
                        assert page.evaluate('Api.isAuthed()') and page.evaluate('Storage.getDiaryEntries().length')>0
                        assert page.evaluate("localStorage.getItem('tp_user:a:diary_v2')")
                    elif scenario == 'delete-race-success':
                        fixture.hold_diary=True
                        with page.expect_request(lambda req:'/api/diary?' in req.url):
                            page.evaluate('window.lateDone=false;Storage.initFromApi().finally(()=>window.lateDone=true);void 0')
                        confirm_delete(page)
                        expect(page.locator('#data-rights-status')).to_contain_text('Аккаунт приложения и личные записи удалены')
                        assert fixture.deletes==[{'confirm':'DELETE_MY_DATA'}]
                        fixture.diary_route.fulfill(status=200,content_type='application/json',body=json.dumps(fixture.diary))
                        page.wait_for_function('window.lateDone')
                        assert page.evaluate('Storage.getDiaryEntries()')==[] and not page.evaluate('Api.isAuthed()')
                        assert page.evaluate("localStorage.getItem('tp_user:a:diary_v2')") is None
                        assert 'FOREIGN_B' in page.evaluate("localStorage.getItem('tp_user:b:diary_v2')")
                        assert page.evaluate("localStorage.getItem('tp_diary_entries')")=='UNOWNED_LEGACY'
                        assert NOTE not in page.locator('body').inner_text()
                        expect(page.locator('#data-export-local')).to_be_hidden()
                        expect(page.locator('#data-delete-start')).to_be_hidden()
                        expect(page.locator('#data-export-json')).to_be_visible()
                        fixture.export = {'exportVersion':'personal-data-v1','accountDeleted':True,'profile':{'id':'a'},'paymentOrders':[{'amount':12000}]}
                        name,text = download(page,'#data-export-json')
                        assert json.loads(text)['paymentOrders'][0]['amount'] == 12000
                assert not errors, errors
                assert not any(NOTE in line or 'SYNTHETIC_MESSAGE' in line for line in logs), 'Private content in console'
                page.wait_for_function("!document.querySelector('.screen--enter,.screen--enter-back,.screen--exit,.screen--exit-back')")
                page.screenshot(path=str(OUT/f'{engine.name}-{scenario}.png'))
                results.append({'engine':engine.name,'scenario':scenario,'passed':True,'viewport':viewport,'pageErrors':errors})
                context.close()
            browser.close()
finally:
    server.shutdown()
    payload={'bundleSha256':hashlib.sha256((ROOT/'output/app/index.html').read_bytes()).hexdigest(),'results':results}
    filename='results-focused.json' if os.environ.get('STAGE3_TEST_SCENARIOS') else 'results.json'
    (OUT/filename).write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(payload,ensure_ascii=False))
