from fixture import boot,detail
from playwright.async_api import async_playwright,expect
from pathlib import Path
import asyncio,json
H=Path(__file__).parent;ORIGIN='https://tg-app-telo-pomnit.vercel.app/'
async def main():
 rows=[]
 async with async_playwright()as pw:
  for engine,width in[('chromium',320),('chromium',390),('chromium',1440),('webkit',320),('webkit',390)]:
   b=await getattr(pw,engine).launch();p=await boot(b,ORIGIN,width);await p.locator('#ai-history-select').select_option('history-a');await p.wait_for_function("aiSessionId==='history-a'&&!aiHistoryLoading");groups=[]
   boxes=await p.evaluate("(()=>{const m=document.getElementById('ai-messages'),a=document.querySelector('.ai-msg--assistant .ai-msg-text'),u=document.querySelector('.ai-msg--user .ai-msg-text'),s=getComputedStyle(m);return {available:m.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight),assistant:a.getBoundingClientRect().width,user:u.getBoundingClientRect().width}})()");assert abs(boxes['assistant']-boxes['available'])<2;assert boxes['user']<boxes['assistant'];groups.append('assistant full reading width and user compact')
   assert await p.locator('#ai-message-limit').count()==0;await p.locator('#ai-input').fill(('Длинное описание ситуации.\n'*160)+'Конец');text=await p.locator('#ai-input').input_value();await expect(p.locator('#ai-send-btn')).to_be_enabled();assert len(text)>1000;assert await p.evaluate('Storage.getAiDraft(aiSessionId)')==text;groups.append('long draft accepted without counter or truncation')
   for selector in['#ai-input','#ai-messages','#screen-ai-chat .screen-header']:
    assert await p.locator(selector).evaluate("x=>getComputedStyle(x).scrollbarWidth==='none'||getComputedStyle(x,'::-webkit-scrollbar').display==='none'")
   await p.locator('#ai-input').focus();await p.keyboard.press('Control+Home'if engine=='chromium'else'Meta+ArrowUp');await p.keyboard.press('PageDown');await p.wait_for_function("document.getElementById('ai-input').scrollTop>0");assert await p.locator('#ai-input').input_value()==text;groups.append('hidden scrollbar keeps keyboard text scrolling')
   messages=p.locator('#ai-messages');await messages.evaluate('x=>x.scrollTop=0');await messages.hover();await p.mouse.wheel(0,250);await p.wait_for_function("document.getElementById('ai-messages').scrollTop>0");groups.append('hidden scrollbar keeps message wheel scrolling');await p.screenshot(path=str(H/f'{engine}-{width}-wide-reading.png'))
   posts=[];failed=False
   async def send(route):
    data=route.request.post_data_json;posts.append(data)
    return await route.fulfill(status=413,json={'error':'transport fixture too large'})
   await p.route('**/api/ai/chat',send);await p.locator('#ai-send-btn').click();await p.wait_for_function('!aiPending');assert posts[0]['message']==text;await expect(p.locator('#ai-input')).to_have_value(text);await expect(p.locator('#ai-draft-status')).to_contain_text('Разделите его на части. Текст сохранён.');await expect(p.locator('#ai-delivery-actions')).to_be_hidden();groups.append('413 is rejected before generation and whole draft retained')
   assert not p.fixture_errors,p.fixture_errors;assert not await p.evaluate('document.documentElement.scrollWidth>innerWidth');rows.append({'engine':engine,'width':width,'groups':groups,'boxes':boxes,'longTextLength':len(text),'pageErrors':p.fixture_errors});print(engine,width,'PASS reading/scroll/long-message',flush=True);await b.close()
 (H/'reading-results.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
asyncio.run(main())
