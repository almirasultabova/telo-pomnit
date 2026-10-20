from pathlib import Path
import sys,asyncio,json
from playwright.async_api import async_playwright,expect
H=Path(__file__).resolve().parent;sys.path.insert(0,str(H.parents[1]/'audit/ui-consistency-JAPP147'))
from fixture import boot,STREAM
RESULTS=[]
async def initial(p):
 await p.evaluate("openQuestionnaire();qStep=Q_BLOCKS.findIndex(b=>b.fields.some(f=>f.type==='scale'));renderQBlock();focusQuestionnaireBlock()")
async def geometry(p,selector,width):
 buttons=p.locator(selector).first.locator('.q-scale-btn');assert await buttons.count()==10
 rects=await buttons.evaluate_all('xs=>xs.map(x=>{const r=x.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})')
 assert min(x['width']for x in rects)>=44 and min(x['height']for x in rects)>=48,(width,rects)
 rows=len(set(round(x['y'])for x in rects));assert rows==(2 if width<600 else 1),(width,rows)
 assert await buttons.all_text_contents()==[str(i)for i in range(1,11)]
 return {'minWidth':min(x['width']for x in rects),'height':min(x['height']for x in rects),'rows':rows}
async def run(b,engine,width):
 p=await boot(b,'http://127.0.0.1:15357/',width);groups=[];await initial(p)
 pre=await geometry(p,'#screen-questionnaire .q-scale',width);groups.append('pre-ten-values-touch-geometry')
 pick=p.locator('#qscale-bodyContactScale [data-val="7"]');await pick.focus();await p.keyboard.press('Space')
 await expect(pick).to_have_attribute('aria-pressed','true');await expect(pick).to_be_focused();assert await p.evaluate('qAnswers.bodyContactScale')==7
 await p.keyboard.press('Space');await expect(pick).to_have_attribute('aria-pressed','false');assert await p.evaluate('qAnswers.bodyContactScale===undefined');groups.append('pre-keyboard-select-and-remove')
 await pick.click();await p.evaluate("goTo('home');openQuestionnaire()")
 await expect(p.locator('#qscale-bodyContactScale [data-val="7"]')).to_have_attribute('aria-pressed','true');groups.append('pre-return-keeps-own-answer')
 await p.reload();await p.wait_for_function("currentScreen==='home'&&qStatusVerified");await p.evaluate('LaunchSplash.cancel();Storage.setQSheetShown();clearTimeout(qInviteTimer);openQuestionnaire()')
 await expect(p.locator('#qscale-bodyContactScale [data-val="7"]')).to_have_attribute('aria-pressed','true');groups.append('pre-reload-keeps-own-answer')
 if width in[320,390]:
  await p.locator('#qscale-bodyContactScale').scroll_into_view_if_needed();await p.screenshot(path=str(H/f'{engine}-{width}-pre.png'),animations='disabled')
 await p.set_viewport_size({'width':width,'height':430});await p.locator('#qscale-bodyContactScale [data-val="10"]').click()
 await expect(p.locator('#q-next-btn')).to_be_in_viewport();groups.append('pre-short-window-selection-and-footer')
 await p.set_viewport_size({'width':width,'height':844})
 await p.evaluate("goTo('home');currentProgram().phase='completed';QuestionnaireCycle.setStatus(selectedProgramId,{pre:{answers:{successMeans:'Учебная цель'}},post:null});QuestionnaireCycle.refreshEntries();QuestionnaireCycle.openSummary()")
 await expect(p.locator('#screen-post-questionnaire')).to_have_class(__import__('re').compile('screen--active'))
 post=await geometry(p,'#post-body .q-scale',width);groups.append('post-ten-values-touch-geometry')
 postpick=p.locator('#post-body [data-scale="bodyContactScale"][data-value="8"]');await postpick.focus();await p.keyboard.press('Space')
 await expect(postpick).to_have_attribute('aria-pressed','true');await expect(postpick).to_be_focused();await p.keyboard.press('Space');await expect(postpick).to_have_attribute('aria-pressed','false')
 await p.locator('#post-body [data-scale="bodyContactScale"][data-value="unknown"]').click();await expect(p.locator('#post-body [data-value="unknown"]').first).to_have_attribute('aria-pressed','true');groups.append('post-selection-remove-and-unknown')
 await postpick.click();await p.locator('#post-next').click();await p.locator('#post-back').click();await expect(postpick).to_have_attribute('aria-pressed','true');groups.append('post-block-return-keeps-own-answer')
 if width in[320,390]:await p.screenshot(path=str(H/f'{engine}-{width}-post.png'),animations='disabled')
 await p.add_style_tag(content='.q-scale-btn{font-size:30px!important}.q-label,.q-field-hint{font-size:26px!important}')
 for btn in await p.locator('#post-body .q-scale').first.locator('button').all():
  assert await btn.evaluate('e=>e.scrollWidth<=e.clientWidth'),await btn.text_content()
 await p.wait_for_function("!document.querySelector('.screen--enter,.screen--exit,.screen--enter-back,.screen--exit-back')")
 assert not await p.evaluate('document.documentElement.scrollWidth>innerWidth');assert not p.fixture_posts and not p.fixture_errors and not p.fixture_dialogs
 groups.append('larger-text-no-overflow-no-auto-send');RESULTS.append({'engine':engine,'width':width,'passed':True,'groups':groups,'pre':pre,'post':post,'pageErrors':[],'realWrites':0})
 print(engine,width,'PASS',len(groups),'groups',pre,flush=True);await p.close()
async def main():
 async with async_playwright()as pw:
  for engine,widths in [('chromium',[320,390,599,600,768,1440]),('webkit',[320,390])]:
   b=await getattr(pw,engine).launch()
   try:
    for width in widths:await run(b,engine,width)
   finally:await b.close()
 (H/'ui-results.json').write_text(json.dumps(RESULTS,ensure_ascii=False,indent=2),encoding='utf-8')
asyncio.run(main())
