from fixture import boot,detail
from playwright.async_api import async_playwright,expect
from pathlib import Path
import asyncio,json,copy
H=Path(__file__).parent;ORIGIN='http://127.0.0.1:15367/'
async def main():
 results=[]
 async with async_playwright()as pw:
  for engine in['chromium','webkit']:
   b=await getattr(pw,engine).launch();p=await boot(b,ORIGIN);posts=[];text=('Подробное описание без сокращения.\n'*400)+'Последняя строка';input=p.locator('#ai-input')
   await p.locator('#ai-history-select').select_option('history-a');await p.wait_for_function("aiSessionId==='history-a'&&!aiHistoryLoading")
   async def send(route):
    posts.append(route.request.post_data_json);await route.abort()
   async def operation(route):
    await route.fulfill(json={'state':'completed','operationId':posts[0]['operationId'],'sessionId':'history-a','reply':'Учебный ответ на длинное сообщение'})
   async def conversation(route):
    value=copy.deepcopy(detail('history-a'))
    if posts:value['messages']+=[{'role':'user','content':posts[0]['message']},{'role':'assistant','content':'Учебный ответ на длинное сообщение'}]
    await route.fulfill(json=value)
   await p.route('**/api/ai/chat',send);await p.route('**/api/ai/operations/*',operation);await p.route('**/api/ai/sessions/history-a',conversation)
   await input.fill(text);await p.locator('#ai-send-btn').click();await p.wait_for_function('!aiPending');assert len(posts)==1 and posts[0]['message']==text;await expect(input).to_have_value(text);await expect(p.locator('#ai-delivery-check')).to_be_visible()
   await p.reload();await p.wait_for_function("typeof currentScreen!=='undefined'&&currentScreen==='home'&&qStatusVerified");await p.evaluate("LaunchSplash.cancel();Storage.setQSheetShown();clearTimeout(qInviteTimer);goTo('ai-chat');refreshAiScreen()");await p.wait_for_function('!aiHistoryLoading');assert len(posts)==1;await expect(p.locator('#ai-delivery-check')).to_be_visible();assert await p.evaluate("Storage.getAiDraft('history-a')")==text
   await p.locator('#ai-delivery-check').click();await p.wait_for_function('!aiPending');assert len(posts)==1;assert await p.locator('.ai-msg--user .ai-msg-text').last.text_content()==text;await expect(input).to_have_value('');await expect(p.locator('#ai-delivery-actions')).to_be_hidden()
   await input.fill(text+' Новый черновик');await p.locator('.ai-history-disclosure summary').click();await p.locator('#ai-history-select').select_option('');await p.locator('#ai-history-select').select_option('history-a');await p.wait_for_function("aiSessionId==='history-a'&&!aiHistoryLoading");await expect(input).to_have_value(text+' Новый черновик');assert len(posts)==1;assert not p.fixture_errors,p.fixture_errors
   results.append({'engine':engine,'longTextLength':len(text),'fullRequest':True,'draftSurvivesFailureAndReload':True,'recoveryReadsOnly':True,'postCount':len(posts),'historyContainsWholeText':True,'draftClearedOnlyAfterConfirmation':True,'newDraftIndependent':True});await b.close()
 (H/'long-ui-results.json').write_text(json.dumps(results,indent=2),encoding='utf-8');print('PASS Chromium/WebKit: full long-message delivery, retained draft, reload and recovery without duplicate POST')
asyncio.run(main())
