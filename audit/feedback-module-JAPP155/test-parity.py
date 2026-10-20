from pathlib import Path
import sys,asyncio,json,re
from playwright.async_api import async_playwright,expect
H=Path(__file__).resolve().parent;R=H.parents[1]
sys.path.insert(0,str(R/'audit/ui-consistency-JAPP147'))
from fixture import boot,STREAM
RESULTS=[]
async def snap(p):
 return await p.locator('#screen-feedback').evaluate('''e=>({html:e.innerHTML.replace(/style="[^"]*"/g,m=>m),fields:[...e.querySelectorAll('input,textarea,select,button')].map(x=>({id:x.id,value:x.value,disabled:x.disabled,pressed:x.getAttribute('aria-pressed'),font:getComputedStyle(x).font,border:getComputedStyle(x).borderRadius,color:getComputedStyle(x).color,height:Math.round(x.getBoundingClientRect().height)}))})''')
async def run(browser,engine,width,variant):
 p=await boot(browser,'http://127.0.0.1:15355/'+('before/'if variant=='before'else''),width);groups=[]
 await p.evaluate('openFeedback()');await p.locator('#fb-text').fill('Учебное сообщение о расписании.')
 await p.locator('#fb-kind').select_option('technical');await p.locator('#fb-stream').select_option(STREAM);await p.locator('#fb-reply').select_option('yes')
 await p.locator('#fb-stars [data-star="4"]').click()
 await p.evaluate("goTo('profile');openFeedback()")
 await expect(p.locator('#fb-text')).to_have_value('Учебное сообщение о расписании.')
 assert not p.fixture_posts;groups.append('return-keeps-text-routing-rating-without-send')
 await p.reload();await p.wait_for_function("currentScreen==='home'&&qStatusVerified")
 await p.evaluate('LaunchSplash.cancel();Storage.setQSheetShown();clearTimeout(qInviteTimer);openFeedback()')
 await expect(p.locator('#fb-kind')).to_have_value('technical');await expect(p.locator('#fb-stream')).to_have_value(STREAM);await expect(p.locator('#fb-reply')).to_have_value('yes')
 await expect(p.locator('#fb-stars [data-star="4"]')).to_have_attribute('aria-pressed','true');groups.append('reload-restores-complete-draft')
 await p.locator('#fb-submit').click();await expect(p.locator('#fb-send-error')).to_be_focused();await expect(p.locator('#fb-submit')).to_have_text('Повторить отправку')
 first=p.fixture_posts[-1]['data'];assert first['rating']==4 and first['needsReply']and first['streamId']==STREAM and first['kind']=='technical'
 await p.wait_for_function("!document.querySelector('.screen--enter,.screen--exit,.screen--enter-back,.screen--exit-back')")
 error=await snap(p);groups.append('failure-keeps-complete-payload-and-focus')
 await p.locator('#fb-submit').click();await expect(p.locator('#fb-submit')).to_be_enabled();assert p.fixture_posts[-1]['data']==first;groups.append('retry-reuses-exact-operation')
 await p.evaluate('document.fonts.ready');await p.locator('#screen-feedback').screenshot(path=str(H/f'{engine}-{width}-{variant}.png'),animations='disabled')
 await p.locator('#fb-clear-rating').click();assert await p.locator('#fb-stars [aria-pressed="true"]').count()==0
 await p.locator('#fb-text').fill('Более новый учебный текст.');gate=asyncio.Event();p.fixture_gates['/feedback']=gate;p.fixture_modes['/feedback']='ok'
 n=len(p.fixture_posts);await p.locator('#fb-submit').click();await expect(p.locator('#fb-submit')).to_have_attribute('aria-busy','true')
 await p.evaluate('submitFeedback()');assert len(p.fixture_posts)==n+1
 await p.locator('#fb-text').fill('Правка во время отправки остаётся черновиком.');gate.set();await expect(p.locator('#fb-submit')).to_be_enabled()
 await expect(p.locator('#feedback-thanks')).not_to_be_visible();assert(await p.evaluate("Storage.getFormDraft('feedback').text")).startswith('Правка во время');groups.append('late-success-keeps-newer-draft')
 p.fixture_gates.clear();await p.locator('#fb-submit').click();await expect(p.locator('#feedback-thanks')).to_be_visible();assert await p.evaluate("Storage.getFormDraft('feedback')")is None
 assert p.fixture_posts[-1]['data']['rating']is None;groups.append('explicit-new-send-clears-only-current-draft')
 # A response from a previous identity must not clear either owner's new text.
 await p.evaluate('openFeedback()');await p.locator('#fb-text').fill('Учебный текст первого аккаунта.')
 gate=asyncio.Event();p.fixture_gates['/feedback']=gate;await p.locator('#fb-submit').click();await expect(p.locator('#fb-submit')).to_have_attribute('aria-busy','true')
 await p.evaluate("Api.logout();Storage.bindUser('feedback-second');Api.userId='feedback-second';Api._token='synthetic';Api.clubBlocked=false;goTo('home');openFeedback()")
 await p.locator('#fb-text').fill('Учебный текст второго аккаунта.');gate.set();await expect(p.locator('#fb-submit')).not_to_have_attribute('aria-busy','true')
 assert(await p.evaluate("Storage.getFormDraft('feedback').text"))=='Учебный текст второго аккаунта.'
 old=await p.evaluate("JSON.parse(AppLocalStorage.getItem('tp_user:ui-consistency-preview:form_draft_v1:feedback')).text")
 assert old=='Учебный текст первого аккаунта.';await expect(p.locator('#feedback-thanks')).not_to_be_visible();groups.append('late-success-keeps-both-owners-drafts')
 assert not p.fixture_errors and not p.fixture_dialogs
 await p.wait_for_function("!document.querySelector('.screen--enter,.screen--exit,.screen--enter-back,.screen--exit-back')")
 assert not await p.evaluate('document.documentElement.scrollWidth>innerWidth')
 payloads=[dict(x['data'],operationId='NORMALIZED')for x in p.fixture_posts]
 await p.close();return {'groups':groups,'errorState':error,'payloads':payloads}
async def main():
 async with async_playwright()as pw:
  for engine,widths in [('chromium',[320,390,1440]),('webkit',[390])]:
   b=await getattr(pw,engine).launch()
   try:
    for width in widths:
     before=await run(b,engine,width,'before');after=await run(b,engine,width,'after');assert before==after,(engine,width,'behavior/DOM/style mismatch')
     from PIL import Image,ImageChops
     a=Image.open(H/f'{engine}-{width}-before.png').convert('RGB');z=Image.open(H/f'{engine}-{width}-after.png').convert('RGB')
     assert a.size==z.size
     difference=ImageChops.difference(a,z);pixels=list(difference.getdata());different=sum(any(c)for c in pixels);largest=max(max(c)for c in pixels)
     # Rounded border antialiasing may differ by one shade after compositor capture.
     assert different<=a.width*a.height*.0005 and largest<=3,(engine,width,'visual mismatch',different,largest)
     RESULTS.append({'engine':engine,'width':width,'passed':True,'groups':after['groups'],'sameDOMStylesPayloads':True,'differentPixels':different,'maxChannelDifference':largest,'visualTolerance':'<=0.05% pixels, <=3/255 per channel'})
     (H/'parity-results.json').write_text(json.dumps(RESULTS,ensure_ascii=False,indent=2),encoding='utf-8')
     print(engine,width,'PASS seven parity groups and visual comparison',different,largest,flush=True)
   finally:await b.close()
 (H/'parity-results.json').write_text(json.dumps(RESULTS,ensure_ascii=False,indent=2),encoding='utf-8')
asyncio.run(main())
