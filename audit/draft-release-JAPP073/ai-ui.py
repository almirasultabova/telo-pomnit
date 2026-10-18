from pathlib import Path
import json
from playwright.sync_api import sync_playwright, expect
HERE=Path(__file__).resolve().parent
answer=json.loads((HERE/'ai-result.json').read_text(encoding='utf-8'))
assert answer['status']=='PASS' and '\ufffd' not in answer['reply']
message='Это вымышленная проверка чата. После рабочего дня замечаю лёгкое напряжение в плечах. Помогите коротко назвать, что можно заметить в этом ощущении.'
records=[]
with sync_playwright() as p:
    for engine in [p.chromium,p.webkit]:
        browser=engine.launch();context=browser.new_context(viewport={'width':390,'height':844})
        api=[];errors=[]
        context.route('**/api/**',lambda r:(api.append(r.request.url),r.abort())[-1])
        page=context.new_page();page.set_default_timeout(18000)
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('https://tg-app-telo-pomnit.vercel.app/screen-review.html?view=stream-current&verify=AI-JAPP073',wait_until='domcontentloaded')
        page.wait_for_function("()=>qStatusVerified && programAccess?.ai?.canWrite && typeof persistCheckinDraft==='function'")
        page.evaluate('''({answer,message})=>{
          const fallback=window.fetch;let messages=[];window.AIReplayRequests=[];
          window.fetch=async(url,options={})=>{
            const pathname=new URL(typeof url==='string'?url:url.url,location.href).pathname;
            if(!pathname.startsWith('/api/ai/'))return fallback(url,options);
            AIReplayRequests.push({pathname,method:options.method||'GET'});
            let body;
            if(pathname==='/api/ai/chat'){
              const request=JSON.parse(options.body);if(request.message!==message || request.contextMode!=='none' || request.diaryEntryIds?.length)throw Error('Unexpected replay payload');
              messages=[{role:'user',content:message},{role:'assistant',content:answer.reply}];
              body={reply:answer.reply,sessionId:answer.sessionId,contextMode:'none',contextEntryCount:0,contextVersion:'diary-selection-v1'};
            }else if(pathname==='/api/ai/sessions')body=messages.length?[{sessionId:answer.sessionId,createdAt:new Date().toISOString(),contextMode:'none',contextEntryCount:0}]:[];
            else if(pathname==='/api/ai/sessions/'+answer.sessionId)body={sessionId:answer.sessionId,messages,contextMode:'none',contextEntryCount:0};
            else throw Error('Unexpected synthetic AI path');
            return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
          };
        }''',{'answer':answer,'message':message})
        page.locator('[data-assistant]').click()
        page.locator('#ai-input').fill(message)
        expect(page.locator('#ai-send-btn')).to_be_enabled()
        page.locator('#ai-send-btn').click()
        expect(page.locator('#ai-messages')).to_contain_text(answer['reply'])
        expect(page.locator('#ai-input')).to_have_value('')
        page.locator('.ai-history-disclosure summary').click()
        expect(page.locator('#ai-history-select option')).to_have_count(2)
        page.locator('#ai-history-select').select_option('')
        expect(page.locator('#ai-messages')).not_to_contain_text(answer['reply'])
        page.locator('#ai-history-select').select_option(answer['sessionId'])
        expect(page.locator('#ai-messages')).to_contain_text(answer['reply'])
        page.screenshot(path=str(HERE/f'ai-{engine.name}.png'))
        assert not api,api
        assert not errors,errors
        calls=page.evaluate('AIReplayRequests')
        assert len([x for x in calls if x['pathname']=='/api/ai/chat'])==1
        records.append({'engine':engine.name,'actualProviderReplyReplayed':True,'sendAndHistoryUI':True,'realApiRequests':0,'additionalProviderCalls':0,'pageErrors':errors})
        (HERE/'ai-ui.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
        print(engine.name,'synthetic replay of actual response and history PASS',flush=True)
        context.close();browser.close()
