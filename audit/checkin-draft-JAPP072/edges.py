from pathlib import Path
import json
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/checkin-draft-JAPP072'
URL = 'http://127.0.0.1:8919'
results = []

with sync_playwright() as p:
    browser = p.chromium.launch()
    for baseline, blocked in [(True,False),(False,False),(False,True)]:
        context = browser.new_context(viewport={'width':390,'height':844})
        external, errors = [], []
        context.route('**/*',lambda r:r.continue_() if r.request.url.startswith(URL+'/') else (external.append(r.request.url),r.abort())[-1])
        if blocked: context.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Test','SecurityError')}})")
        if baseline:
            source = (ROOT/'output/silk-launch-release/app/js/app.js').read_text(encoding='utf-8')
            context.route('**/js/app.js*',lambda r:r.fulfill(status=200,content_type='application/javascript',body=source))
        page = context.new_page(); page.set_default_timeout(12000)
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.request.post(URL+'/lab/reset')
        page.goto(URL)
        page.wait_for_function("()=>Storage._userId && currentScreen==='onboarding'")
        page.locator('#consent-cb').check(); page.locator('#onboarding-start-btn').click()
        page.wait_for_function("()=>currentScreen==='home'")
        page.evaluate("closeQInvite();Storage._set(KEYS.Q_SHEET_SHOWN,'1');switchTab('main')")
        # The ordinary entry button is used, not just a test-only renderer.
        page.locator('#main-state-btn').click()
        if baseline:
            page.locator('#checkin-note').fill('Пропадавший учебный черновик')
            page.locator('#slider-energy').evaluate('e=>{e.value=2;e.dispatchEvent(new Event("input"))}')
            page.evaluate("goTo('home');switchTab('main')")
            page.locator('#main-state-btn').click()
            expect(page.locator('#checkin-note')).to_have_value('')
            expect(page.locator('#slider-energy')).to_have_value('5')
            results.append({'case':'baseline-before-patch','reproduced':'note and scale reset on ordinary return','status':'PASS'})
        else:
            # Invalid stored values must never be rendered as user input.
            page.evaluate("Storage.saveFormDraft('checkin',{version:1,date:'not-a-date',note:'bad',tension:999});renderCheckinScales();renderCheckinSyncStatus()")
            expect(page.locator('#checkin-note')).to_have_value('')
            expect(page.locator('#slider-tension')).to_have_value('5')
            # A previous-day draft keeps its original Moscow day when saved.
            page.evaluate("Storage.saveFormDraft('checkin',{version:1,date:'2026-10-17T20:59:00Z',note:'Вчерашний черновик',tension:2,anxiety:3,energy:4,safety:6,bodyContact:7});renderCheckinScales();renderCheckinSyncStatus()")
            expect(page.locator('#checkin-sync-status')).to_contain_text('17.10.2026')
            page.locator('#checkin-save-btn').click()
            expect(page.locator('#checkin-sync-status')).to_contain_text('Все пять оценок сохранены на сервере')
            state = page.request.get(URL+'/lab/state').json()
            assert state['checkins'][0]['dayKey']=='2026-10-17'
            # A delayed acknowledgement must not clear text typed after Save.
            page.evaluate('renderCheckinScales();renderCheckinSyncStatus()')
            page.locator('#checkin-note').fill('Первая отправка')
            pending = []
            def hold(r):
                if r.request.method=='POST': pending.append((r,r.fetch()))
                else: r.continue_()
            page.route('**/api/checkins',hold)
            page.locator('#checkin-save-btn').click()
            expect(page.locator('#checkin-save-btn')).to_be_disabled()
            page.wait_for_function("()=>document.getElementById('checkin-sync-status').dataset.syncStatus!=='draft'")
            assert len(pending)==1
            page.locator('#checkin-note').fill('Новый ввод во время отправки')
            route,response = pending.pop(); route.fulfill(response=response)
            expect(page.locator('#checkin-save-btn')).to_be_enabled()
            expect(page.locator('#checkin-note')).to_have_value('Новый ввод во время отправки')
            assert page.evaluate("Storage.getFormDraft('checkin').note")=='Новый ввод во время отправки'
            # Failure to send preserves the durable queue and does not claim ACK.
            page.unroute('**/api/checkins',hold)
            page.route('**/api/checkins',lambda r:r.fulfill(status=503,content_type='application/json',body='{"error":"Synthetic offline"}') if r.request.method=='POST' else r.continue_())
            page.locator('#checkin-save-btn').click()
            expect(page.locator('#checkin-save-btn')).to_be_enabled()
            expect(page.locator('#checkin-sync-status')).not_to_contain_text('Все пять оценок сохранены на сервере')
            assert page.evaluate("Storage.getCheckins().some(r=>r.note==='Новый ввод во время отправки' && r.syncStatus!=='synced')")
            if blocked: assert page.evaluate("Storage.getFormDraft('checkin').note")=='Новый ввод во время отправки'
            results.append({'case':'edges','blockedStorage':blocked,'status':'PASS','checks':['invalid-draft-ignored','previous-day-preserved','late-ack-keeps-new-draft','offline-no-false-success']})
        state = page.request.get(URL+'/lab/state').json()
        assert not errors,errors
        assert not external,external
        assert state['providerCalls']==state['externalCalls']==0
        context.close()
    browser.close()
(OUT/'edges.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(results,ensure_ascii=False,indent=2))
