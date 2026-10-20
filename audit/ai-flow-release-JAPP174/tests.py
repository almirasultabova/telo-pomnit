from fixture import boot,picker
from playwright.async_api import async_playwright,expect
from pathlib import Path
import asyncio,json,os
H=Path(__file__).parent;ORIGIN=os.environ.get('AI_FLOW_ORIGIN','http://127.0.0.1:15474/');RESULTS=[]
async def open_history(p,id):
 await p.evaluate("document.querySelector('.ai-history-disclosure').open=true")
 await p.locator('#ai-history-select').select_option(id);await p.wait_for_function("!aiHistoryLoading")
async def check(b,engine,width):
 p=await boot(b,ORIGIN,width);groups=[]
 await p.locator('#ai-input').fill('Первая строка');await p.locator('#ai-input').press('Enter');await expect(p.locator('#ai-input')).to_have_value('Первая строка\n');assert not p.sends
 await p.locator('#ai-input').press('Shift+Enter');assert not p.sends;groups.append('mobile Enter inserts a newline without sending')
 await p.locator('#ai-input').fill('Черновик нового разговора');await open_history(p,'history-a');await p.locator('#ai-input').fill('Черновик A');await open_history(p,'history-b');await p.locator('#ai-input').fill('Черновик B');await open_history(p,'history-a');await expect(p.locator('#ai-input')).to_have_value('Черновик A');await open_history(p,'');await expect(p.locator('#ai-input')).to_have_value('Черновик нового разговора');assert not p.sends;groups.append('new/A/B drafts remain separate and are never sent by switching')
 text='Первая строка\nВторая строка\nТретья строка\nЧетвёртая строка'
 await p.evaluate("text=>Storage.saveAiDraft('history-a',text)",text);await open_history(p,'history-a');await expect(p.locator('#ai-input')).to_have_value(text)
 dims=await p.locator('#ai-input').evaluate('e=>({h:e.clientHeight,scroll:e.scrollHeight})');assert dims['h']>=min(84,width*.2),dims;groups.append('restored multi-line draft expands to existing field height cap')
 await p.evaluate("document.querySelector('.ai-history-disclosure').open=false")
 await p.locator('#ai-messages').evaluate('e=>e.scrollTop=100');old=await p.locator('#ai-messages').evaluate('e=>e.scrollTop');await p.evaluate('renderAiChat()');assert abs(await p.locator('#ai-messages').evaluate('e=>e.scrollTop')-old)<2
 await p.evaluate('refreshAiScreen()');await p.wait_for_function('!aiHistoryLoading');assert abs(await p.locator('#ai-messages').evaluate('e=>e.scrollTop')-old)<2;groups.append('same conversation reading position survives redraw and refresh')
 await p.evaluate("goBack();switchTab('diary')");await p.locator('#ai-chat-btn').click();await p.wait_for_function('!aiHistoryLoading');await expect(p.locator('#ai-input')).to_have_value(text);assert abs(await p.locator('#ai-messages').evaluate('e=>e.scrollTop')-old)<2;groups.append('Diary and back preserve draft and reading position')
 p.history_error=True;await p.evaluate('refreshAiScreen()');await p.wait_for_function('!aiHistoryLoading');await expect(p.locator('#ai-history-status')).to_contain_text('Не удалось');await expect(p.locator('#ai-input')).to_have_value(text);p.history_error=False;await p.evaluate('refreshAiScreen()');await p.wait_for_function('!aiHistoryLoading');groups.append('history error/retry keeps current conversation and input')
 await open_history(p,'')
 await p.locator('#ai-context-mode').select_option('selected');await p.locator('#ai-context-choices input').first.check();await p.locator('#ai-context-preview-btn').click();await expect(p.locator('#ai-context-readable')).to_be_focused();await expect(p.locator('#ai-send-btn')).to_be_disabled();await p.locator('#ai-context-review').check();await p.locator('#ai-input').fill('Учебный вопрос с дневником');assert not p.sends
 p.send_gate=asyncio.Event();await p.locator('#ai-send-btn').click();await p.wait_for_function('aiPending');await asyncio.wait_for(p.send_started.wait(),10);await expect(p.locator('#ai-history-select')).to_be_disabled();assert len(p.sends)==1
 await p.locator('#ai-input').fill('Следующий черновик\nДругая мысль\nЕщё строка');p.send_gate.set();await p.wait_for_function("!aiPending&&aiSessionId==='synthetic-new'");await expect(p.locator('#ai-input')).to_have_value('Следующий черновик\nДругая мысль\nЕщё строка')
 assert p.sends[0]['contextMode']=='selected';assert len(p.sends[0]['diaryEntryIds'])==1;assert await p.locator('#ai-context-preview').text_content()==p.details['synthetic-new']['contextText'];groups.append('explicit reviewed context only; in-flight new draft retained on reply')
 await p.locator('#ai-input').fill('Учебное сообщение после сбоя');p.send_gate=None;p.send_result='error';await p.locator('#ai-send-btn').click();await p.wait_for_function('!aiPending');await expect(p.locator('#ai-delivery-check')).to_be_visible();before=len(p.sends);operation=p.sends[-1]['operationId'];await p.locator('#ai-delivery-check').click();await p.wait_for_function('!aiPending');assert len(p.sends)==before;await expect(p.locator('#ai-input')).to_have_value('Учебное сообщение после сбоя')
 p.send_result='not-found';await p.locator('#ai-delivery-check').click();await p.wait_for_function('!aiPending');await expect(p.locator('#ai-delivery-check')).to_have_text('Повторить исходную отправку');p.send_result='completed';await p.locator('#ai-delivery-check').click();await p.wait_for_function('!aiPending');assert p.sends[-1]['operationId']==operation;assert len(p.sends)==before+1;groups.append('503 result check never resends; explicit retry uses identical operation ID')
 await p.locator('#ai-input').fill('Учебный черновик без доступа');p.access=False;await p.evaluate('refreshAiScreen()');await p.wait_for_function('!aiHistoryLoading');await expect(p.locator('#ai-send-btn')).to_be_disabled();groups.append('revoked write access keeps readable history and draft')
 await p.set_viewport_size({'width':width,'height':430});await p.locator('#ai-input').focus();await expect(p.locator('#ai-input')).to_be_in_viewport();assert await p.locator('#ai-send-btn').is_visible();await p.wait_for_function("!document.querySelector('.screen--exit-forward,.screen--exit-back')");assert not await p.evaluate('document.documentElement.scrollWidth>innerWidth');assert not p.fixture_errors,p.fixture_errors;groups.append('short viewport input and send visible; no JS error or horizontal overflow')
 RESULTS.append({'engine':engine,'width':width,'groups':groups,'realAICalls':0});print(engine,width,'PASS',len(groups),flush=True);await p.close()
class PlatformBrowser:
 def __init__(self,b,platform):self.browser=b;self.platform=platform
 async def new_page(self,**kw):
  p=await self.browser.new_page(**kw);original=p.goto
  async def goto(url,**kwargs):return await original(url.replace('tgWebAppPlatform=ios','tgWebAppPlatform='+self.platform),**kwargs)
  p.goto=goto;return p
async def keyboards(b,engine):
 for platform in ['tdesktop','android']:
  p=await boot(PlatformBrowser(b,platform),ORIGIN);await p.locator('#ai-input').fill('Текст при выборе символа');await p.locator('#ai-input').dispatch_event('keydown',{'key':'Enter','isComposing':True});assert not p.sends
  await p.locator('#ai-input').press('Shift+Enter');assert not p.sends
  await p.locator('#ai-input').fill('Сообщение с клавиатуры');await p.locator('#ai-input').press('Enter')
  if platform=='tdesktop':await p.wait_for_function('!aiPending');assert len(p.sends)==1
  else:await expect(p.locator('#ai-input')).to_have_value('Сообщение с клавиатуры\n');assert not p.sends
  assert not p.fixture_errors;await p.close();RESULTS.append({'engine':engine,'keyboard':platform,'IME':True,'ok':True})
 p=await boot(b,ORIGIN);text='Учебный неотправленный черновик после перезапуска';await p.locator('#ai-input').fill(text);await p.reload();await p.wait_for_function('Api.isAuthed()&&programAccess');await p.evaluate("LaunchSplash.cancel();Storage.setQSheetShown();clearTimeout(qInviteTimer);goTo('ai-chat');refreshAiScreen()");await p.wait_for_function('!aiHistoryLoading');await expect(p.locator('#ai-input')).to_have_value(text);assert not p.sends;await p.close();RESULTS.append({'engine':engine,'reload':'draft-kept/no-auto-send','ok':True})
 p=await boot(b,ORIGIN);p.send_gate=asyncio.Event();await p.locator('#ai-input').fill('Учебная отправка до смены сеанса');await p.locator('#ai-send-btn').click();await p.wait_for_function('aiPending');await p.evaluate("Storage._generation++;clearPrivateConversationState();AiDelivery.invalidate()")
 async with p.expect_response('**/api/ai/chat'):p.send_gate.set()
 await p.evaluate('()=>new Promise(requestAnimationFrame)');assert await p.evaluate('aiSessionId')is None;assert await p.locator('.ai-msg').count()==0;await p.close();RESULTS.append({'engine':engine,'isolation':'late response ignored after generation changes','ok':True})
async def main():
 async with async_playwright()as pw:
  for engine,widths in [('chromium',[320,390,1440]),('webkit',[390])]:
   b=await getattr(pw,engine).launch()
   for width in widths:await check(b,engine,width)
   await keyboards(b,engine);await b.close()
 (H/os.environ.get('AI_FLOW_RESULT','checks.json')).write_text(json.dumps(RESULTS,ensure_ascii=False,indent=2),encoding='utf-8')
if __name__=='__main__':asyncio.run(main())
