import sys,os
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'ai-picker-JAPP159'))
from fixture import boot,ENTRIES
from pathlib import Path
from playwright.async_api import async_playwright,expect
import asyncio,json
H=Path(__file__).parent;RESULTS=[]
async def run(b,engine):
 p=await boot(b,os.environ.get('ORIGIN','https://tg-app-telo-pomnit.vercel.app/'),320);groups=[];boxes=p.locator('#ai-context-choices input')
 # Literal rendering and larger text must not expand the page horizontally.
 p.picker_entries[0]['note']='<img src=x onerror=alert(1)>'+('А'*300)
 await p.locator('#ai-context-mode').select_option('none');await p.locator('#ai-context-mode').select_option('selected');await expect(boxes.first).to_be_visible()
 await expect(p.locator('#ai-context-choices img')).to_have_count(0);await p.add_style_tag(content='#ai-context-choices span{font-size:28px!important}');await boxes.first.click()
 await p.wait_for_function("!document.querySelector('.screen--enter,.screen--exit,.screen--enter-back,.screen--exit-back')");assert not await p.evaluate('document.documentElement.scrollWidth>innerWidth');groups.append('long-literal-text-larger-type-no-script-overflow')
 p.preview_gate=asyncio.Event();await p.locator('#ai-context-preview-btn').click();await boxes.nth(1).click();p.preview_gate.set();await p.preview_done.wait();await p.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
 await expect(p.locator('#ai-context-readable')).to_have_count(0);await expect(boxes.nth(1)).to_be_focused();await expect(p.locator('#ai-context-count')).to_have_text('Выбрано: 2 из 5');groups.append('late-preview-does-not-replace-new-selection-or-focus')
 p.preview_done=asyncio.Event();p.preview_gate=asyncio.Event();await p.locator('#ai-context-preview-btn').click();await p.evaluate("goTo('home')");p.preview_gate.set();await p.preview_done.wait();await p.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
 assert await p.evaluate("currentScreen==='home' && document.activeElement.id!=='ai-context-readable'");groups.append('late-preview-does-not-focus-hidden-ai-screen')
 # Revoke the original identity before a pending response is delivered.
 await p.evaluate("goTo('ai-chat');renderAiChat()");p.preview_done=asyncio.Event();p.preview_gate=asyncio.Event();await p.locator('#ai-context-preview-btn').click()
 await p.evaluate("Api.logout();Storage.bindUser('picker-second');Api.userId='picker-second';Api._token='synthetic';Api.clubBlocked=false;aiAccessGranted=true;programAccess.ai={canWrite:true,reason:'program'};goTo('ai-chat');renderAiChat()")
 p.preview_gate.set();await p.preview_done.wait();await p.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
 await expect(p.locator('#ai-context-readable')).to_have_count(0);assert await p.evaluate("aiContext.mode==='none' && aiContext.ids.length===0");groups.append('late-preview-does-not-enter-another-account')
 assert not p.ai_sends and not p.fixture_errors and not p.fixture_dialogs
 RESULTS.append({'engine':engine,'passed':True,'groups':groups,'realSends':0});print(engine,'PASS four edges',flush=True);await p.close()
async def main():
 async with async_playwright()as pw:
  for engine in['chromium','webkit']:
   b=await getattr(pw,engine).launch()
   try:await run(b,engine)
   finally:await b.close()
 (H/'edge-results.json').write_text(json.dumps(RESULTS,ensure_ascii=False,indent=2),encoding='utf-8')
asyncio.run(main())
