from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import json, sys
HERE=Path(__file__).resolve().parent
PATH=HERE/'published-ui.json'
records=json.loads(PATH.read_text(encoding='utf-8')) if '--resume' in sys.argv and PATH.exists() else []
origins=['https://tg-app-telo-pomnit.vercel.app/','https://app.telo-pomnit.ru/','https://app.telo-pomnit.ru/recovery/j293/']
with sync_playwright() as p:
    for name in ['chromium','webkit']:
        browser=getattr(p,name).launch()
        for base in origins if name=='chromium' else origins[:1]:
            if any(r['origin']==base and r['engine']==name for r in records):continue
            context=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce')
            api=[];errors=[]
            context.route('**/api/**',lambda r:(api.append(r.request.url),r.abort())[-1])
            page=context.new_page();page.set_default_timeout(18000)
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(base+'screen-review.html?view=home-pending&verify=JAPP073',wait_until='domcontentloaded',timeout=40000)
            page.wait_for_function("()=>typeof qStatusVerified!=='undefined' && qStatusVerified && currentScreen==='home' && typeof persistCheckinDraft==='function'")
            page.evaluate("closeQInvite();switchTab('main')")
            page.locator('#main-state-btn').click()
            page.locator('#checkin-note').fill('Учебный черновик опубликованной версии')
            page.locator('#slider-energy').evaluate('e=>{e.value=3;e.dispatchEvent(new Event("input"))}')
            expect(page.locator('#checkin-sync-status')).to_contain_text('Учебный черновик')
            page.evaluate("goTo('home');switchTab('main')")
            page.locator('#main-state-btn').click()
            expect(page.locator('#checkin-note')).to_have_value('Учебный черновик опубликованной версии')
            expect(page.locator('#slider-energy')).to_have_value('3')
            page.locator('#checkin-draft-discard').click()
            expect(page.locator('#checkin-note')).to_have_value('')
            page.locator('#checkin-note').fill('Учебное сохранение без настоящего аккаунта')
            page.locator('#checkin-save-btn').click()
            expect(page.locator('#checkin-sync-status')).to_contain_text('Учебный пример сохранён только в этом просмотре')
            expect(page.locator('#checkin-draft-discard')).to_have_count(0)
            assert page.locator('#screen-checkin').evaluate('e=>e.scrollWidth<=e.clientWidth')
            assert not api,api
            assert not errors,errors
            records.append({'engine':name,'origin':base,'draftReturn':True,'discard':True,'syntheticSave':True,'realApiRequests':0,'pageErrors':errors})
            PATH.write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
            print(name,base,'PASS',flush=True)
            context.close()
        browser.close()
