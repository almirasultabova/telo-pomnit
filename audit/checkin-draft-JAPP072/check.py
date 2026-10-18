from pathlib import Path
import json, re, traceback, sys
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/checkin-draft-JAPP072'
URL = 'http://127.0.0.1:8919'
results = json.loads((OUT/'results.json').read_text(encoding='utf-8')) if '--resume' in sys.argv else []

def run(engine, blocked_storage=False):
    browser = engine.launch()
    context = browser.new_context(viewport={'width':390, 'height':844})
    external, errors, phases = [], [], []
    context.route('**/*', lambda r: r.continue_() if r.request.url.startswith(URL + '/') else (external.append(r.request.url), r.abort())[-1])
    if blocked_storage:
        context.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Synthetic unavailable','SecurityError')}})")
    page = context.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_default_timeout(14000)
    page.request.post(URL + '/lab/reset')
    def state(): return page.request.get(URL + '/lab/state').json()
    def open_tracker():
        page.evaluate("renderCheckinScales(); renderCheckinSyncStatus(); goTo('checkin')")
        expect(page.locator('#screen-checkin')).to_have_class(re.compile(r'\bscreen--active\b'))
    def start():
        page.goto(URL)
        page.wait_for_function("()=>Storage._userId && !Api.clubBlocked && currentScreen!=='splash'")
        if page.locator('#screen-onboarding').evaluate("e=>e.classList.contains('screen--active')"):
            page.locator('#consent-cb').check()
            page.locator('#onboarding-start-btn').click()
        page.wait_for_function("()=>currentScreen==='home'")
        page.evaluate("closeQInvite()")
        # No questionnaire reminder may steal focus during the targeted test.
        page.evaluate("Storage._set(KEYS.Q_SHEET_SHOWN,'1')")
    def change(note):
        page.locator('#checkin-note').fill(note)
        for key, val in [('tension',2),('anxiety',8),('energy',4),('safety',7),('bodyContact',9)]:
            page.locator('#slider-'+key).evaluate('(e,v)=>{e.value=v;e.dispatchEvent(new Event("input",{bubbles:true}))}', val)
    def restored(note):
        expect(page.locator('#checkin-note')).to_have_value(note)
        for key, val in [('tension',2),('anxiety',8),('energy',4),('safety',7),('bodyContact',9)]:
            expect(page.locator('#slider-'+key)).to_have_value(str(val))
    try:
        start(); open_tracker()
        # Reproduce the original failure on baseline: render loses unsaved input.
        change('Учебный черновик <не HTML>')
        page.evaluate("goTo('home')")
        open_tracker(); restored('Учебный черновик <не HTML>')
        assert not state()['checkins']
        expect(page.locator('#checkin-sync-status')).to_contain_text('только в открытом приложении' if blocked_storage else 'сохранён на этом устройстве')
        phases.append('leave-return-five-scales-note-no-server-write')
        page.screenshot(path=str(OUT / f'{engine.name}-draft-{blocked_storage}.png'))
        if not blocked_storage:
            page.reload(); page.wait_for_function("()=>Storage._userId && currentScreen==='home'")
            open_tracker(); restored('Учебный черновик <не HTML>')
            assert not state()['checkins']
            phases.append('reload-restores-no-auto-submit')
        # Namespaced owner and stale controls cannot save A's content as B.
        owner = page.evaluate('Storage._userId')
        page.evaluate("Storage.bindUser('fictional-B'); renderCheckinScales(); renderCheckinSyncStatus()")
        expect(page.locator('#checkin-note')).to_have_value('')
        change('Черновик Б')
        page.evaluate('(id)=>{Storage.bindUser(id);renderCheckinScales();renderCheckinSyncStatus()}', owner)
        restored('Учебный черновик <не HTML>')
        page.evaluate("Storage.bindUser('fictional-B')")
        page.locator('#checkin-save-btn').click()
        expect(page.locator('#checkin-note')).to_have_value('Черновик Б')
        assert not state()['checkins']
        page.evaluate('(id)=>{Storage.bindUser(id);renderCheckinScales();renderCheckinSyncStatus()}', owner)
        phases.append('account-isolation-and-stale-submit')
        # Discard must leave saved history alone and not resurrect on re-entry.
        page.locator('#checkin-draft-discard').click()
        expect(page.locator('#checkin-note')).to_have_value('')
        open_tracker()
        expect(page.locator('#checkin-note')).to_have_value('')
        assert not state()['checkins']
        phases.append('explicit-discard-no-record-write')
        change('Сохранить только по кнопке')
        page.locator('#checkin-save-btn').click()
        expect(page.locator('#checkin-sync-status')).to_contain_text('Все пять оценок сохранены на сервере')
        assert len(state()['checkins']) == 1
        assert page.evaluate("Storage.getFormDraft('checkin')") is None
        # After saving, returning shows confirmed values, no draft status.
        open_tracker(); restored('Сохранить только по кнопке')
        expect(page.locator('#checkin-draft-discard')).to_have_count(0)
        phases.append('explicit-save-ack-clears-draft-history-preserved')
        # New unsaved edit wins over the older saved row.
        change('Изменение поверх сохранённой записи')
        open_tracker(); restored('Изменение поверх сохранённой записи')
        assert state()['checkins'][0]['note'] == 'Сохранить только по кнопке'
        page.locator('#checkin-draft-discard').click()
        restored('Сохранить только по кнопке')
        phases.append('unsaved-edit-over-existing-discard-restores-saved')
        # Purge clears only the verified account, including tracker draft.
        change('Удаляемый учебный черновик')
        page.evaluate('(id)=>Storage.purgeUser(id)', owner)
        assert page.evaluate("AppLocalStorage.getItem(Storage.key('form_draft_v1:checkin',"+json.dumps(owner)+"))") is None
        page.evaluate("Storage.bindUser('fictional-B');renderCheckinScales();renderCheckinSyncStatus()")
        restored('Черновик Б')
        phases.append('own-deletion-purges-draft-keeps-other-account')
        assert state()['externalCalls'] == state()['providerCalls'] == 0
        assert not external, external
        assert not errors, errors
        results.append({'engine':engine.name,'blockedStorage':blocked_storage,'passed':phases,'status':'PASS','externalCalls':0,'providerCalls':0})
    except Exception:
        results.append({'engine':engine.name,'blockedStorage':blocked_storage,'passed':phases,'status':'FAIL','error':traceback.format_exc(),'pageErrors':errors})
        raise
    finally:
        (OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
        context.close(); browser.close()

with sync_playwright() as p:
    for engine in [p.chromium,p.webkit]:
        for blocked in [False,True]:
            if any(r['engine']==engine.name and r['blockedStorage']==blocked and r['status']=='PASS' for r in results): continue
            results[:] = [r for r in results if not (r['engine']==engine.name and r['blockedStorage']==blocked)]
            run(engine,blocked)
print(json.dumps(results,ensure_ascii=False,indent=2))
