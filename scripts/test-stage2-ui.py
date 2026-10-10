"""Stage 2 browser acceptance. Actual local bundle; exclusively synthetic API data."""
import hashlib
import json
import os
import threading
from datetime import datetime, timezone, timedelta
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/stage2-ui'
OUT.mkdir(parents=True, exist_ok=True)
SCALES = ['tension', 'anxiety', 'energy', 'safety', 'bodyContact']
VALUES = [1, 3, 5, 7, 9]


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def iso(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def day_key(value):
    return (iso(value) + timedelta(hours=3)).date().isoformat()


class Fixture:
    def __init__(self):
        self.fail = False
        self.posts = []
        self.checkins = []
        self.calls = []
        self.server_time = None
        self.fail_history = False
        self.streams = [
            {'id': 'oct', 'name': 'Октябрьский поток 2026', 'startDate': '2026-10-15T15:00:00Z',
             'endDate': '2026-11-12T15:00:00Z', 'phase': 'upcoming', 'canAttend': False,
             'meetings': [{'id': 'oct1', 'number': 1, 'date': '2026-10-15T15:00:00Z', 'topic': 'Встреча'},
                          {'id': 'oct9', 'number': 9, 'date': '2026-11-12T15:00:00Z', 'topic': 'Итог'}]},
            {'id': 'spring', 'name': 'Весенний архив', 'startDate': '2026-04-16T15:00:00Z',
             'endDate': '2026-05-14T15:00:00Z', 'phase': 'completed', 'canAttend': False,
             'meetings': [{'id': 'spring1', 'number': 1, 'date': '2026-04-16T15:00:00Z', 'topic': 'Архив'}]},
        ]
        self.diary = [
            {'id': 'oct-a', 'createdAt': '2026-10-15T21:30:00Z', 'zone': 'chest', 'sensations': ['tension'], 'note': 'ONLY_OCT_A'},
            {'id': 'oct-b', 'createdAt': '2026-10-17T12:00:00Z', 'zone': 'chest', 'sensations': ['tension'], 'note': 'ONLY_OCT_B'},
            {'id': 'spring-a', 'createdAt': '2026-04-17T12:00:00Z', 'zone': 'belly', 'sensations': ['warmth'], 'note': 'ONLY_SPRING_A'},
            {'id': 'spring-b', 'createdAt': '2026-04-18T12:00:00Z', 'zone': 'belly', 'sensations': ['warmth'], 'note': 'ONLY_SPRING_B'},
            {'id': 'spring-c', 'createdAt': '2026-04-19T12:00:00Z', 'zone': 'belly', 'sensations': ['warmth'], 'note': 'ONLY_SPRING_C'},
            {'id': 'outside', 'createdAt': '2026-09-01T12:00:00Z', 'zone': 'chest', 'sensations': [], 'note': 'OUTSIDE_BOTH'},
        ]

    def route(self, route):
        req = route.request
        path = req.url.split('/api', 1)[1]
        self.calls.append(path)
        if path == '/checkins' and req.method == 'POST':
            data = req.post_data_json
            self.posts.append(data)
            if self.fail:
                route.fulfill(status=500, content_type='application/json', body='{"error":"Fixture unavailable"}')
                return
            key = day_key(data['createdAt'])
            previous = next((r for r in self.checkins if r.get('dayKey') == key), None)
            assert all(data.get(k) is not None for k in SCALES), 'All five source values required'
            if previous and previous.get('clientUpdatedAt', '') > data['clientUpdatedAt']:
                row = previous
            else:
                row = {**data, 'id': 'checkin-' + key, 'dayKey': key, 'bodyScore': None}
                self.checkins = [r for r in self.checkins if r.get('dayKey') != key] + [row]
            body = row
        elif req.method == 'GET' and (path.startswith('/diary?') or path.startswith('/checkins?')):
            if self.fail_history:
                route.fulfill(status=500, content_type='application/json', body='{"error":"Fixture history unavailable"}')
                return
            query = parse_qs(urlsplit(req.url).query)
            start = int(query.get('offset', ['0'])[0])
            count = int(query['limit'][0])
            source = self.diary if path.startswith('/diary?') else self.checkins
            body = source[start:start+count]
        else:
            body = {
                '/auth/telegram': {'token': 'synthetic', 'user': {'id': 'fixture-stage2', 'name': 'Учебная участница', 'consentGivenAt': '2026-10-06'}},
                '/me': {'name': 'Учебная участница'},
                '/me/enrollment/access': {'ai': {'canWrite': False, 'message': 'Учебная проверка'}, 'streams': self.streams,
                                          **({'serverTime': self.server_time} if self.server_time else {})},
                '/diary?limit=90': self.diary, '/checkins?limit=200': self.checkins,
                '/triggers?limit=90': [], '/diagnostic/result': None,
            }.get(path, {})
        route.fulfill(status=200, content_type='application/json', body=json.dumps(body, ensure_ascii=False))


def home(page):
    expect(page.locator('#screen-home')).to_have_class('screen screen--active', timeout=15000)
    page.locator('.nav-btn[data-tab="diary"]').click()


def path_tab(page):
    page.locator('.nav-btn[data-tab="diag"]').click()
    expect(page.locator('#tab-diag')).to_have_class('tab-pane tab-pane--active')
    return page.locator('#diag-tab-content')


def checkin(page, values, text):
    if not page.locator('#screen-checkin').evaluate("el=>el.classList.contains('screen--active')"):
        page.locator('.nav-btn[data-tab="diary"]').click()
        page.locator('#checkin-btn').click()
    expect(page.locator('#screen-checkin')).to_have_class('screen screen--active')
    for key, value in zip(SCALES, values):
        page.locator('#slider-' + key).evaluate("(el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}))}", value)
    page.locator('#checkin-note').fill(text)
    page.locator('#checkin-save-btn').click()


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT / 'output/app')))
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}/#tgWebAppPlatform=ios&tgWebAppVersion=8.0'
results = []
try:
    with sync_playwright() as playwright:
        for engine in (playwright.chromium, playwright.webkit):
            browser = engine.launch()
            scenarios = ['upcoming', 'start-boundary', 'five-weeks', 'last-day', 'after-last-day', 'archive-isolation',
                         'no-stream', 'five-values-reload', 'same-day-update', 'legacy-average', 'offline-checkin-retry', 'independent-chart', 'unsaved-edit-status', 'history-pagination', 'server-clock', 'history-load-failure']
            if os.environ.get('STAGE2_TEST_SCENARIOS'):
                scenarios = os.environ['STAGE2_TEST_SCENARIOS'].split(',')
            for scenario in scenarios:
                print(f'Checking {engine.name}: {scenario}', flush=True)
                fixture = Fixture()
                when = {'upcoming': '2026-10-14T20:59:59Z', 'start-boundary': '2026-10-14T21:00:00Z',
                        'last-day': '2026-11-12T20:59:58Z', 'after-last-day': '2026-11-12T21:00:00Z'}.get(scenario, '2026-10-22T12:00:00Z')
                if scenario == 'no-stream':
                    fixture.streams = []
                if scenario == 'server-clock':
                    fixture.server_time = '2026-10-08T12:00:00Z'
                    when = '2026-12-01T12:00:00Z'
                if scenario == 'history-load-failure':
                    fixture.fail_history = True
                    fixture.checkins = [{'id': 'restore-five', 'createdAt': '2026-10-16T12:00:00Z',
                                         **dict(zip(SCALES, VALUES)), 'note': 'RESTORED_CHECKIN'}]
                if scenario == 'legacy-average':
                    fixture.checkins = [{'id': 'old-average', 'createdAt': '2026-10-16T12:00:00Z', 'bodyScore': 7, 'note': 'LEGACY_AVERAGE'}]
                if scenario == 'independent-chart':
                    fixture.checkins = [
                        {'id': 'first-five', 'createdAt': '2026-10-16T12:00:00Z', **dict(zip(SCALES, VALUES))},
                        {'id': 'second-five', 'createdAt': '2026-10-23T12:00:00Z', **dict(zip(SCALES, [2, 4, 6, 8, 10]))},
                        {'id': 'legacy-in-chart', 'createdAt': '2026-10-24T12:00:00Z', 'bodyScore': 1},
                        {'id': 'out-of-period', 'createdAt': '2026-04-18T12:00:00Z', **dict(zip(SCALES, [10]*5))},
                    ]
                if scenario == 'history-pagination':
                    fixture.diary = [{'id': f'diary-{i}', 'createdAt': '2026-10-16T12:00:00Z', 'zone': 'chest',
                                      'sensations': [], 'note': 'BEYOND_FIRST_PAGE' if i == 94 else f'fixture-{i}'} for i in range(95)]
                    fixture.checkins = [{'id': f'checkin-{i}', 'createdAt': (datetime(2026, 1, 1, tzinfo=timezone.utc)+timedelta(days=i)).isoformat(),
                                         **dict(zip(SCALES, VALUES))} for i in range(205)]
                context = browser.new_context(viewport={'width': 375, 'height': 667}, is_mobile=True,
                                              timezone_id='America/Los_Angeles')
                page = context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.add_init_script('window.TelegramWebviewProxy={postEvent:()=>{}}')
                page.route('**/api/**', fixture.route)
                page.clock.install(time=iso(when))
                page.clock.set_fixed_time(iso(when))
                page.goto(url)
                home(page)
                if scenario in ('upcoming', 'start-boundary', 'five-weeks', 'last-day', 'after-last-day', 'archive-isolation', 'no-stream', 'independent-chart', 'server-clock'):
                    content = path_tab(page)
                    if scenario == 'upcoming':
                        expect(content).to_contain_text('Поток скоро начнётся')
                        expect(content).not_to_contain_text('Поток завершён')
                    elif scenario in ('start-boundary', 'last-day'):
                        expect(content).to_contain_text('Поток идёт')
                    elif scenario == 'after-last-day':
                        expect(content).to_contain_text('Архив потока')
                    elif scenario == 'five-weeks':
                        for week, date in enumerate(['2026-10-15T00:00:00+03:00', '2026-10-22T00:00:00+03:00', '2026-10-29T00:00:00+03:00', '2026-11-05T00:00:00+03:00', '2026-11-12T00:00:00+03:00'], 1):
                            page.clock.set_fixed_time(iso(date)); page.evaluate('renderMyPathTab()')
                            expect(content).to_contain_text('Поток идёт')
                            assert page.evaluate('(date)=>getStreamWeek(date)', date) == week
                        assert page.evaluate("getStreamWeek('2026-10-14T20:59:59Z')") is None
                        assert page.evaluate("getStreamWeek('2026-11-12T21:00:00Z')") is None
                    elif scenario == 'archive-isolation':
                        page.evaluate("Storage.toggleAttended('oct1');Storage.toggleAttended('spring1');renderMyPathTab()")
                        expect(content.locator('.path-stat-num').first).to_have_text('2')
                        expect(content.locator('.path-stat-num').nth(1)).to_have_text('1/2')
                        expect(content).not_to_contain_text('ONLY_SPRING')
                        expect(content).not_to_contain_text('OUTSIDE_BOTH')
                        page.locator('#path-stream-select').select_option('spring')
                        expect(content).to_contain_text('Архив потока')
                        expect(content.locator('.path-stat-num').first).to_have_text('3')
                        expect(content.locator('.path-stat-num').nth(1)).to_have_text('1/1')
                        expect(content).not_to_contain_text('ONLY_OCT')
                        page.locator('#path-stream-select').select_option('oct')
                        expect(content.locator('.path-stat-num').first).to_have_text('2')
                        page.locator('.nav-btn[data-tab="profile"]').click()
                        expect(page.locator('#owned-stream-select')).to_have_value('oct')
                        page.locator('#owned-stream-select').select_option('spring')
                        page.locator('.nav-btn[data-tab="diag"]').click()
                        expect(page.locator('#path-stream-select')).to_have_value('spring')
                    elif scenario == 'no-stream':
                        expect(content).to_contain_text('Поток для наблюдений пока не выбран')
                        expect(content.locator('.path-stats')).to_have_count(0)
                        expect(content).not_to_contain_text('Поток завершён')
                    elif scenario == 'independent-chart':
                        expect(content.locator('.checkin-chart-svg g[data-scale]')).to_have_count(5)
                        for key, value in zip(SCALES, VALUES):
                            circles = content.locator(f'g[data-scale="{key}"] circle')
                            expect(circles).to_have_count(2)
                            expected_y = 8 + (10-value)/9*100
                            assert abs(float(circles.first.get_attribute('cy'))-expected_y) < 0.001
                        assert content.locator('.cchart-leg').evaluate_all("els=>els.every(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})"), 'Scale legend clips horizontally'
                    elif scenario == 'server-clock':
                        expect(content).to_contain_text('Поток скоро начнётся')
                        expect(content).not_to_contain_text('Архив потока')
                        assert page.evaluate('programNow()') == int(iso(fixture.server_time).timestamp()*1000)
                        page.clock.set_fixed_time(iso('2026-12-08T12:00:00Z'))
                        page.evaluate('renderMyPathTab()')
                        expect(content).to_contain_text('Поток идёт')
                        assert page.evaluate('programNow()') == int(iso('2026-10-15T12:00:00Z').timestamp()*1000)
                else:
                    if scenario == 'history-load-failure':
                        assert page.evaluate('Storage.getHistoryLoadStatus()') == {'diary': 'failed', 'checkins': 'failed'}
                        assert page.evaluate('Storage.getDiaryEntries().length') == 0
                        expect(page.locator('#screen-home #history-load-warning-diary')).to_be_visible()
                        expect(page.locator('#screen-home #history-load-warning-diary')).to_contain_text('не означает, что записей нет')
                        content = path_tab(page)
                        expect(content.locator('#history-load-warning-path')).to_be_visible()
                        page.locator('.nav-btn[data-tab="diary"]').click()
                        page.locator('#checkin-btn').click()
                        page.locator('#checkin-history-btn').click()
                        warning = page.locator('#checkin-history-list #history-load-warning-checkins')
                        expect(warning).to_be_visible()
                        fixture.fail_history = False
                        warning.get_by_role('button', name='Повторить загрузку истории').click()
                        page.wait_for_function("Storage.getHistoryLoadStatus().diary==='loaded'&&Storage.getHistoryLoadStatus().checkins==='loaded'")
                        expect(page.locator('#checkin-history-list')).to_contain_text('RESTORED_CHECKIN')
                        expect(page.locator('#checkin-history-list #history-load-warning-checkins')).to_have_count(0)
                        assert len(page.evaluate('Storage.getDiaryEntries()')) == len(fixture.diary)
                        page.evaluate("goTo('home');switchTab('diary')")
                        expect(page.locator('#screen-home #history-load-warning-diary')).to_have_count(0)
                        page.locator('#screen-home').get_by_role('button', name='История записей').click()
                        expect(page.locator('#history-list')).to_contain_text('ONLY_OCT_A')
                    elif scenario == 'history-pagination':
                        assert len(page.evaluate('Storage.getDiaryEntries()')) == 95
                        assert len(page.evaluate('Storage.getCheckins()')) == 205
                        assert any('&offset=90' in p for p in fixture.calls)
                        assert any('&offset=200' in p for p in fixture.calls)
                        page.locator('#screen-home').get_by_role('button', name='История записей').click()
                        expect(page.locator('#history-list')).to_contain_text('BEYOND_FIRST_PAGE')
                    elif scenario == 'legacy-average':
                        rows = page.evaluate('Storage.getCheckins()')
                        assert len(rows) == 1 and rows[0]['legacyScale']
                        assert all(rows[0].get(k) is None for k in SCALES)
                        page.locator('#checkin-btn').click()
                        page.locator('#checkin-history-btn').click()
                        expect(page.locator('#checkin-history-list')).to_contain_text('средн')
                        expect(page.locator('#checkin-history-list .checkin-mini-row')).to_have_count(0)
                    else:
                        fixture.fail = scenario == 'offline-checkin-retry'
                        checkin(page, VALUES, 'FIVE_ORIGINAL_VALUES')
                        if fixture.fail:
                            page.wait_for_function('Storage.getCheckins().some(r=>r.syncError)')
                            expect(page.locator('#checkin-sync-status')).to_have_attribute('data-sync-status', 'pending')
                            expect(page.locator('#checkin-sync-status')).to_contain_text('пока не удалось')
                            page.reload(); home(page)
                            assert [page.evaluate('Storage.getCheckins()')[0][k] for k in SCALES] == VALUES
                            fixture.fail = False
                            page.locator('#checkin-btn').click()
                            page.locator('#checkin-sync-retry').click()
                        page.wait_for_function('Storage.getCheckins().some(r=>r.syncStatus==="synced")')
                        if scenario == 'same-day-update':
                            checkin(page, list(reversed(VALUES)), 'UPDATED_SAME_DAY')
                            page.wait_for_function('Storage.getCheckins().some(r=>r.note==="UPDATED_SAME_DAY"&&r.syncStatus==="synced")')
                            assert len(fixture.checkins) == 1
                        page.reload(); home(page)
                        rows = page.evaluate('Storage.getCheckins()')
                        assert len(rows) == 1
                        expected = list(reversed(VALUES)) if scenario == 'same-day-update' else VALUES
                        assert [rows[0][k] for k in SCALES] == expected
                        assert len(fixture.checkins) == 1
                        page.locator('#checkin-btn').click()
                        for key, value in zip(SCALES, expected):
                            expect(page.locator('#slider-' + key)).to_have_value(str(value))
                        if scenario == 'unsaved-edit-status':
                            expect(page.locator('#checkin-sync-status')).to_have_attribute('data-sync-status', 'synced')
                            page.locator('#slider-tension').evaluate("el=>{el.value='2';el.dispatchEvent(new Event('input',{bubbles:true}))}")
                            expect(page.locator('#checkin-sync-status')).to_have_attribute('data-sync-status', 'draft')
                            expect(page.locator('#checkin-sync-status')).not_to_contain_text('сохранены на сервере')
                            page.locator('#checkin-note').fill('UNSAVED_NOTE')
                            expect(page.locator('#checkin-sync-status')).to_have_attribute('data-sync-status', 'draft')
                            assert fixture.checkins[0]['note'] == 'FIVE_ORIGINAL_VALUES'
                assert not errors, errors
                page.wait_for_function("!document.querySelector('.screen--enter,.screen--enter-back,.screen--exit,.screen--exit-back')")
                if scenario == 'independent-chart':
                    page.locator('.checkin-chart-wrap').scroll_into_view_if_needed()
                elif page.locator('#screen-checkin').evaluate("el=>el.classList.contains('screen--active')"):
                    page.locator('#checkin-sync-status').scroll_into_view_if_needed()
                page.screenshot(path=str(OUT / f'{engine.name}-{scenario}.png'))
                results.append({'engine': engine.name, 'scenario': scenario, 'passed': True,
                                'deviceTimezone': 'America/Los_Angeles', 'checkinPosts': len(fixture.posts), 'pageErrors': errors})
                context.close()
            browser.close()
finally:
    server.shutdown()
    payload = {'bundleSha256': hashlib.sha256((ROOT / 'output/app/index.html').read_bytes()).hexdigest(), 'results': results}
    filename = 'results-focused.json' if os.environ.get('STAGE2_TEST_SCENARIOS') else 'results.json'
    (OUT / filename).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(payload, ensure_ascii=False))
