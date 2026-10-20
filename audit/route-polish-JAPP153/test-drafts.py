from fixture import boot,ROW
from pathlib import Path
from playwright.async_api import async_playwright,expect
import asyncio,json
HERE=Path(__file__).parent
ORIGIN='http://127.0.0.1:15353/'
SCOPE='step-edit-v1:'+ROW['id']
RESULTS=[]
async def reopen(p):
    await p.locator('#ps-back').click()
    await p.evaluate('(id)=>AfterMeeting.openStepById(id)',ROW['id'])
async def stored(p):return await p.evaluate('(scope)=>Storage.getFormDraft(scope)',SCOPE)
async def edit(p,text):
    if not await p.locator('#ps-edit-text').is_visible():await p.get_by_role('button',name='Изменить',exact=True).click()
    await p.locator('#ps-edit-text').fill(text)
async def run(browser,engine,width):
    p=await boot(browser,ORIGIN,width);groups=[]
    await edit(p,'Учебная правка: сначала спокойный выдох.')
    await expect(p.locator('#ps-edit-draft')).to_contain_text('на этом устройстве')
    assert (await stored(p))['text']=='Учебная правка: сначала спокойный выдох.'
    assert not p.writes
    await reopen(p)
    await expect(p.locator('#ps-edit-text')).to_have_value('Учебная правка: сначала спокойный выдох.')
    assert p.row['stepText']==ROW['stepText']and not p.writes
    groups.append('return-restores-edit-without-server-write')
    await p.reload();await p.wait_for_function("currentScreen==='home'&&qStatusVerified")
    await p.evaluate('LaunchSplash.cancel();Storage.setQSheetShown();clearTimeout(qInviteTimer)')
    await p.evaluate('(id)=>AfterMeeting.openStepById(id)',ROW['id'])
    await expect(p.locator('#ps-edit-text')).to_have_value('Учебная правка: сначала спокойный выдох.')
    groups.append('reload-restores-own-durable-edit')
    p.fault='fail';await p.locator('#ps-edit-save').click()
    await expect(p.locator('#ps-message')).to_contain_text('Не удалось подтвердить')
    assert (await stored(p))['text'].startswith('Учебная правка')
    await reopen(p);await expect(p.locator('#ps-edit-text')).to_have_value('Учебная правка: сначала спокойный выдох.')
    p.fault='ok';await p.locator('#ps-edit-save').click()
    await expect(p.locator('#ps-message')).to_have_text('Изменения сохранены.')
    assert await stored(p)is None
    await expect(p.locator('.ps-current .ps-step-copy')).to_have_text('Учебная правка: сначала спокойный выдох.')
    groups.append('failure-retains-edit-and-matching-ack-clears-only-edit')
    await edit(p,'Ещё одна учебная правка, которую я отменю.')
    await p.locator('#ps-edit-discard').click()
    assert await stored(p)is None
    await expect(p.get_by_role('button',name='Изменить',exact=True)).to_be_focused()
    await reopen(p);await expect(p.locator('#ps-edit-text')).not_to_be_visible()
    assert p.row['stepText']=='Учебная правка: сначала спокойный выдох.'
    groups.append('explicit-discard-preserves-server-step-and-restores-focus')
    await edit(p,'Старый локальный вариант правки.')
    p.row['revision']+=1;p.row['stepText']='Шаг, изменённый в другом окне.'
    count=len(p.writes);await reopen(p)
    await expect(p.locator('#ps-edit-save')).to_be_disabled()
    await expect(p.locator('.ps-edit-comparison')).to_contain_text('Шаг, изменённый в другом окне.')
    await expect(p.locator('#ps-edit-text')).to_have_value('Старый локальный вариант правки.')
    assert len(p.writes)==count
    if width==390:await p.screenshot(path=str(HERE/(engine+'-conflict.png')),animations='disabled')
    await p.locator('#ps-edit-continue').click();await expect(p.locator('#ps-edit-save')).to_be_enabled()
    assert len(p.writes)==count
    await p.locator('#ps-edit-save').click();await expect(p.locator('#ps-message')).to_have_text('Изменения сохранены.')
    groups.append('new-server-revision-needs-explicit-review-before-send')
    await edit(p,'Черновик с <img src=x onerror=alert(1)> и '+('длинноеслово'*30))
    await expect(p.locator('#ps-edit-draft')).to_be_visible()
    assert not await p.evaluate('document.documentElement.scrollWidth>innerWidth')
    await p.set_viewport_size({'width':width,'height':430})
    await p.locator('#ps-edit-save').scroll_into_view_if_needed();await expect(p.locator('#ps-edit-save')).to_be_in_viewport()
    await p.set_viewport_size({'width':width,'height':844})
    groups.append('long-safe-text-and-short-window-controls')
    # Quota/blocked writes retain the in-memory edit, with an honest status.
    await p.evaluate("()=>{Object.getPrototypeOf(window.localStorage).setItem=function(){throw new DOMException('Blocked','QuotaExceededError')}}")
    await p.locator('#ps-edit-text').fill('Учебная правка только в открытом окне.')
    await expect(p.locator('#ps-edit-draft')).to_contain_text('только в открытом приложении')
    await reopen(p);await expect(p.locator('#ps-edit-text')).to_have_value('Учебная правка только в открытом окне.')
    groups.append('blocked-storage-restores-memory-and-warns')
    # Switch owners: a different account does not read this user's local edit.
    await p.evaluate("Api.logout();Storage.bindUser('second-fictional-owner');Api.userId='second-fictional-owner';Api._token='synthetic';Api.clubBlocked=false;goTo('home')")
    await p.evaluate('(id)=>AfterMeeting.openStepById(id)',ROW['id'])
    await expect(p.locator('#ps-edit-text')).not_to_be_visible()
    groups.append('account-switch-does-not-restore-another-users-edit')
    assert not p.fixture_errors,p.fixture_errors
    assert not p.fixture_dialogs,p.fixture_dialogs
    RESULTS.append({'engine':engine,'width':width,'passed':True,'groups':groups,'syntheticWrites':len(p.writes),'pageErrors':p.fixture_errors})
    print(engine,width,'PASS',len(groups),'groups',flush=True);await p.close()
async def baseline(browser):
    p=await boot(browser,ORIGIN+'before/',390);await edit(p,'Вымышленная правка, которая теряется в прежней версии.')
    await reopen(p);await expect(p.locator('#ps-edit-text')).not_to_be_visible()
    await expect(p.locator('.ps-current .ps-step-copy')).to_have_text(ROW['stepText'])
    RESULTS.append({'oldUnsavedEditLossReproduced':True});await p.close()
async def edges(browser,engine):
    p=await boot(browser,ORIGIN,390);await edit(p,'Черновик при отказе версии.')
    p.row['revision']+=1;p.row['stepText']='Новая версия на сервере.'
    await p.locator('#ps-edit-save').click();await expect(p.locator('#ps-message')).to_contain_text('Шаг изменился')
    await p.get_by_role('button',name='Обновить запись',exact=True).click()
    await expect(p.locator('#ps-edit-continue')).to_be_visible()
    await expect(p.locator('#ps-edit-text')).to_have_value('Черновик при отказе версии.')
    assert (await stored(p))['baseRevision']==1
    RESULTS.append({'engine':engine,'edge':'409-refresh-preserves-edit-and-requires-review','passed':True});await p.close()
    p=await boot(browser,ORIGIN,390);await edit(p,'Правка с неподходящим подтверждением.');p.fault='bad-ack'
    await p.locator('#ps-edit-save').click();await expect(p.locator('#ps-message')).to_contain_text('Не удалось подтвердить')
    assert (await stored(p))['text']=='Правка с неподходящим подтверждением.'
    RESULTS.append({'engine':engine,'edge':'mismatched-ack-does-not-clear-edit','passed':True});await p.close()
    p=await boot(browser,ORIGIN,390);await edit(p,'Правка первого аккаунта.');p.gate=asyncio.Event()
    await p.locator('#ps-edit-save').click()
    for _ in range(100):
        if p.writes:break
        await asyncio.sleep(.01)
    assert p.writes
    await p.evaluate("Api.logout();Storage.bindUser('second-fictional-owner');Api.userId='second-fictional-owner';Api._token='synthetic';Api.clubBlocked=false;goTo('home')")
    await p.evaluate('(id)=>AfterMeeting.openStepById(id)',ROW['id']);await edit(p,'Правка второго аккаунта.')
    p.gate.set()
    await p.write_done.wait()
    await p.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    assert (await stored(p))['text']=='Правка второго аккаунта.'
    await expect(p.locator('#ps-edit-text')).to_have_value('Правка второго аккаунта.')
    first=await p.evaluate('(scope)=>JSON.parse(AppLocalStorage.getItem("tp_user:ui-consistency-preview:form_draft_v1:"+scope))',SCOPE)
    assert first['text']=='Правка первого аккаунта.'
    assert not p.fixture_errors,p.fixture_errors
    RESULTS.append({'engine':engine,'edge':'late-ack-does-not-clear-either-owners-edit','passed':True});await p.close()
async def main():
    async with async_playwright()as pw:
        for engine,widths in [('chromium',[320,390,1440]),('webkit',[390])]:
            browser=await getattr(pw,engine).launch()
            try:
                for width in widths:await run(browser,engine,width)
                await edges(browser,engine)
                if engine=='chromium':await baseline(browser)
            finally:await browser.close()
    (HERE/'draft-results.json').write_text(json.dumps(RESULTS,ensure_ascii=False,indent=2),encoding='utf-8')
asyncio.run(main())
