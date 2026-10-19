"""Current UI + local fictional HTTP only. No production data, AI or notifications."""
import argparse
import json
import threading
import uuid
import hashlib
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit, parse_qs, unquote
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output' / 'observation-reliability-JAPP102'


class Fixture:
    def __init__(self):
        self.diary = {}
        self.triggers = {}
        self.calls = []
        self.reject_next = False
        self.hold_next = None
        self.request_started = threading.Event()


def serve(fixture):
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(ROOT), **kwargs)

        def log_message(self, *args):
            pass

        def send_json(self, value, status=200):
            data = json.dumps(value, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            path = unquote(urlsplit(self.path).path)
            resolved = (ROOT / path.lstrip('/')).resolve()
            public_file = any(resolved.is_relative_to((ROOT / base).resolve()) for base in ['app', 'media/app', 'media/shared'])
            if path == '/app/js/telegram-web-app.js':
                data = b"window.Telegram={WebApp:{initData:new URLSearchParams(location.search).get('owner')||'A',ready(){},expand(){},onEvent(){},BackButton:{show(){},hide(){},onClick(){},offClick(){}},HapticFeedback:{impactOccurred(){},notificationOccurred(){}}}};"
                self.send_response(200)
                self.send_header('Content-Type', 'text/javascript')
                self.end_headers()
                self.wfile.write(data)
            elif path.startswith('/api/'):
                self.api('GET')
            elif public_file and Path(path).suffix.lower() in {'.html', '.js', '.css', '.woff2', '.png', '.jpg', '.webp', '.svg', '.mp4'}:
                try:
                    super().do_GET()
                except ConnectionError:
                    pass  # The launch layer deliberately cancels its video request.
            else:
                self.send_error(403)

        def do_POST(self):
            self.api('POST')

        def api(self, method):
            path = urlsplit(self.path).path
            data = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))) or '{}') if method == 'POST' else {}
            owner = self.headers.get('Authorization', '').removeprefix('Bearer ')
            fixture.calls.append((method, path))
            if path == '/api/auth/telegram':
                owner = data.get('initData', 'A')
                return self.send_json({'token': owner, 'user': {'id': owner, 'name': 'Учебная участница', 'consentGivenAt': '2026-10-01'}})
            if not owner:
                return self.send_json({'error': 'fixture auth'}, 401)
            if path == '/api/me':
                return self.send_json({'user': {'id': owner, 'name': 'Учебная участница'}})
            if path == '/api/me/enrollment/access':
                return self.send_json({'serverTime': datetime.now(timezone.utc).isoformat(), 'streams': [], 'ai': {'canWrite': False, 'reason': 'ended', 'message': 'Учебный режим без AI'}})
            if path == '/api/me/profile-stats':
                return self.send_json({'visitStreak': 1, 'savedObservations': len(fixture.diary.get(owner, {}))})
            if path == '/api/me/visit':
                return self.send_json({'ok': True})
            if path in ['/api/access-admin/session', '/api/stream-overview/session']:
                return self.send_json({'error': 'Нет служебных прав'}, 403)
            if path in ['/api/diagnostic/result', '/api/habitual/result']:
                return self.send_json(None)
            if path == '/api/diary':
                rows = fixture.diary.setdefault(owner, {})
                if method == 'POST':
                    if fixture.hold_next is not None:
                        gate, fixture.hold_next = fixture.hold_next, None
                        fixture.request_started.set()
                        gate.wait(10)
                    if fixture.reject_next or len(data.get('note', '')) > 20000:
                        fixture.reject_next = False
                        return self.send_json({'error': 'Учебный отказ валидации'}, 400)
                    rows.setdefault(data['clientId'], {**data, 'id': str(uuid.uuid4())})
                    return self.send_json(rows[data['clientId']])
                values = list(rows.values())
                query = parse_qs(urlsplit(self.path).query)
                offset, limit = int(query.get('offset', [0])[0]), int(query.get('limit', [90])[0])
                return self.send_json(values[offset:offset+limit])
            if path == '/api/triggers':
                rows = fixture.triggers.setdefault(owner, {})
                if method == 'POST':
                    rows.setdefault(data['clientId'], {**data, 'id': str(uuid.uuid4())})
                    return self.send_json(rows[data['clientId']])
                return self.send_json(list(rows.values()))
            if path in ['/api/checkins', '/api/after-meeting-notes', '/api/discussion-notes', '/api/ai/sessions']:
                return self.send_json([])
            return self.send_json({'error': 'Unimplemented fixture route'}, 403)
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def run(engine_name, width):
    fixture = Fixture()
    server = serve(fixture)
    origin = f'http://127.0.0.1:{server.server_port}'
    results = []
    with sync_playwright() as playwright:
        browser = getattr(playwright, engine_name).launch()
        context = browser.new_context(viewport={'width': width, 'height': 844})
        context.route('https://**/*', lambda route: route.abort())
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))

        def boot(owner='A'):
            page.goto(origin + '/app/index.html?owner=' + owner)
            page.wait_for_selector('#screen-home.screen--active')
            page.evaluate('LaunchSplash.cancel()')
            page.wait_for_function('Storage.getHistoryLoadStatus().diary === "loaded"')

        def begin(zone='chest'):
            page.evaluate('startDiaryEntry();document.querySelector(".body-zone-disclosure").open=true')
            page.locator(f'#body-zone-list [data-zone="{zone}"]').click()
            page.locator('#zone-continue-btn').click()
            page.locator('#sensations-grid [data-sensation="tension"]').click()
            page.locator('#sensations-continue-btn').click()

        boot()
        begin()
        page.locator('#note-textarea').fill('Учебный черновик тела')
        boot()
        page.evaluate('startDiaryEntry()')
        assert page.evaluate('draft.zone') == 'chest'
        page.locator('#zone-continue-btn').click()
        assert page.locator('[data-sensation="tension"]').get_attribute('aria-pressed') == 'true'
        page.locator('#sensations-continue-btn').click()
        expect(page.locator('#note-textarea')).to_have_value('Учебный черновик тела')
        page.evaluate('goBack();goBack()')
        page.locator('#zone-continue-btn').click()
        assert page.evaluate('draft.sensations') == ['tension']
        page.locator('#sensations-continue-btn').click()
        results.append('body draft survives reload and backward/forward navigation')
        page.locator('#note-save-btn').click()
        page.wait_for_function('Storage.getDiaryEntries().some(r=>r.syncStatus==="synced")')
        page.evaluate('startDiaryEntry()')
        assert page.evaluate('draft.zone') is None
        expect(page.locator('#note-textarea')).to_have_value('')
        results.append('successful save clears draft; new entry has no previous text')

        begin()
        page.locator('#note-textarea').fill('Учебная запись с поздним ответом')
        gate = threading.Event()
        fixture.hold_next = gate
        fixture.request_started.clear()
        page.locator('#note-save-btn').click()
        assert fixture.request_started.wait(5)
        begin('belly')
        page.locator('#note-textarea').fill('Новый черновик во время отправки')
        gate.set()
        page.wait_for_function('Storage.getDiaryEntries().some(r=>r.note==="Учебная запись с поздним ответом"&&r.syncStatus==="synced")')
        expect(page.locator('#note-textarea')).to_have_value('Новый черновик во время отправки')
        assert page.evaluate('Storage.getFormDraft("body-observation-v1").note') == 'Новый черновик во время отправки'
        page.locator('#body-draft-note button').click()
        results.append('late ACK cannot clear the next body draft')

        begin('belly')
        page.locator('#note-textarea').fill('Личный черновик A')
        boot('B')
        page.evaluate('startDiaryEntry()')
        expect(page.locator('#note-textarea')).to_have_value('')
        boot('A')
        page.evaluate('startDiaryEntry()')
        expect(page.locator('#note-textarea')).to_have_value('Личный черновик A')
        page.locator('#body-draft-body-map button').click()
        assert page.evaluate('draft.zone') is None
        expect(page.locator('#note-textarea')).to_have_value('')
        results.append('account isolation and explicit draft deletion')

        page.evaluate('goTo("home",true);switchTab("diary")')
        page.locator('#stop-reaction-btn').click()
        page.locator('#trigger-situation').fill('Временно')
        page.locator('#trigger-situation').fill('')
        assert page.evaluate('Storage.getFormDraft("reaction-observation-v1")') is None
        page.locator('#trigger-situation').fill('Учебная ситуация')
        page.locator('[data-reaction="fight"]').click()
        page.locator('#trigger-intensity').fill('8')
        page.locator('#trigger-zone-chips [data-zone="chest"]').click()
        page.locator('#trigger-note').fill('Учебное пояснение')
        boot()
        page.evaluate('goTo("home",true);switchTab("diary")')
        page.locator('#stop-reaction-btn').click()
        expect(page.locator('#trigger-situation')).to_have_value('Учебная ситуация')
        expect(page.locator('#trigger-note')).to_have_value('Учебное пояснение')
        expect(page.locator('#trigger-intensity')).to_have_value('8')
        assert page.locator('[data-reaction="fight"]').get_attribute('aria-pressed') == 'true'
        page.locator('#trigger-save-btn').click()
        page.wait_for_function('Storage.getTriggerEntries().some(r=>r.syncStatus==="synced")')
        page.locator('#stop-reaction-btn').click()
        expect(page.locator('#trigger-situation')).to_have_value('')
        results.append('reaction draft restores text/type/intensity/zone and clears after queueing')

        begin()
        page.locator('#note-textarea').fill('Отклонённая учебная запись')
        fixture.reject_next = True
        page.locator('#note-save-btn').click()
        page.wait_for_selector('#saved-repair-btn')
        rejected = page.evaluate('Storage.getDiaryEntries().find(r=>r.retryBlocked)')
        boot()
        assert page.evaluate('Storage.getDiaryEntries().some(r=>r.retryBlocked)')
        page.evaluate('startDiaryEntry()')
        page.evaluate('document.querySelector(".body-zone-disclosure").open=true')
        page.locator('#body-zone-list [data-zone="belly"]').click()
        page.locator('#zone-continue-btn').click()
        page.locator('[data-sensation="warmth"]').click() if page.locator('[data-sensation="warmth"]').count() else page.locator('[data-sensation="tension"]').click()
        page.locator('#sensations-continue-btn').click()
        page.locator('#note-textarea').fill('Корректная запись после отказа')
        page.locator('#note-save-btn').click()
        page.wait_for_function('Storage.getDiaryEntries().some(r=>r.note==="Корректная запись после отказа"&&r.syncStatus==="synced")')
        page.evaluate('goTo("home",true);switchTab("diary")')
        page.locator('#diary-sync-status button').filter(has_text='Исправить запись').first.click()
        page.locator('#zone-continue-btn').click()
        page.locator('#sensations-continue-btn').click()
        page.locator('#note-textarea').fill('Исправленная учебная запись')
        page.wait_for_function('!document.querySelector(".screen--enter,.screen--enter-back,.screen--exit,.screen--exit-back")')
        page.screenshot(path=str(OUT / f'{engine_name}-{width}-repair.png'))
        page.locator('#note-save-btn').click()
        page.wait_for_function('Storage.getDiaryEntries().some(r=>r.note==="Исправленная учебная запись"&&r.syncStatus==="synced")')
        repaired = page.evaluate('(id)=>Storage.getDiaryEntries().find(r=>r.clientId===id)', rejected['clientId'])
        assert repaired['date'] == rejected['date']
        results.append('400 does not block next save; correction retains clientId/date')

        begin()
        page.evaluate('()=>{const n=document.querySelector("#note-textarea");n.value="x".repeat(20001);n.dispatchEvent(new Event("input",{bubbles:true}));}')
        expect(page.locator('#note-save-btn')).to_be_disabled()
        assert '20 000' in page.locator('#body-draft-note').inner_text()
        results.append('over-limit legacy draft is preserved and cannot be submitted')
        assert page.locator('#screen-note .screen-scroll').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
        page.locator('#body-draft-note button').click()
        page.evaluate('goTo("home",true);switchTab("diary")')
        page.locator('#checkin-btn').click()
        page.evaluate('()=>{const n=document.querySelector("#checkin-note");n.value="x".repeat(20001);n.dispatchEvent(new Event("input",{bubbles:true}));}')
        page.locator('#checkin-save-btn').click()
        assert page.evaluate('Storage.getCheckins().length') == 0
        assert '20 000' in page.locator('#checkin-sync-status').inner_text()
        results.append('over-limit check-in note stays in the form and is not queued')
        page.evaluate('Api.logout()')
        expect(page.locator('#note-textarea')).to_have_value('')
        expect(page.locator('#trigger-situation')).to_have_value('')
        results.append('logout clears private form DOM')

        blocked = browser.new_context(viewport={'width': width, 'height': 844})
        blocked.route('https://**/*', lambda route: route.abort())
        blocked.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new DOMException('test','SecurityError')}})")
        offline = blocked.new_page()
        offline.goto(origin + '/app/index.html?owner=C')
        offline.wait_for_selector('#screen-home.screen--active')
        offline.evaluate('LaunchSplash.cancel();startDiaryEntry();selectZone("chest")')
        offline.locator('#zone-continue-btn').click()
        assert 'только в открытом приложении' in offline.locator('#body-draft-sensations').inner_text()
        results.append('blocked storage is explicitly memory-only')
        assert not errors, errors
        assert not any(path.startswith('/api/ai/chat') for _, path in fixture.calls)
        browser.close()
    server.shutdown()
    server.server_close()
    return {'engine': engine_name, 'width': width, 'passed': results, 'pageErrors': errors}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--engine', default='chromium', choices=['chromium', 'webkit'])
    parser.add_argument('--width', default=390, type=int)
    parser.add_argument('--preview', action='store_true')
    args = parser.parse_args()
    if args.preview:
        preview_server = serve(Fixture())
        print(f'LOCAL_FICTIONAL_PREVIEW http://127.0.0.1:{preview_server.server_port}/app/index.html?owner=preview', flush=True)
        try:
            threading.Event().wait()
        except KeyboardInterrupt:
            preview_server.shutdown()
            preview_server.server_close()
        raise SystemExit
    OUT.mkdir(parents=True, exist_ok=True)
    result_path = OUT / f'{args.engine}-{args.width}.json'
    source_hashes = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in ['app/index.html','app/js/app.js','app/js/storage.js','app/js/api.js','app/js/observation-drafts.js']}
    result_path.write_text(json.dumps({'status': 'running', 'sourceHashes': source_hashes}), encoding='utf-8')
    try:
        result = {**run(args.engine, args.width), 'status': 'passed', 'sourceHashes': source_hashes}
    except Exception as error:
        result_path.write_text(json.dumps({'status': 'failed', 'error': str(error), 'sourceHashes': source_hashes}), encoding='utf-8')
        raise
    result_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False, indent=2))
