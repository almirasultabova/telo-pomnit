from pathlib import Path
import subprocess,os,json
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent;S=R/'output/ai-history-ux-JAPP167/source'
s=(R/'backend/scripts/test-ai-delivery.js').read_text(encoding='utf-8')
a="  for (const message of ['x'.repeat(1001), '😀'.repeat(1001), '   ']) assert.equal((await post(body({ message }))).statusCode, 400)"
b="""  for (const message of ['x'.repeat(1001), '😀'.repeat(1001), 'Длинное описание. '.repeat(6000)+'Конец']) {
    const request=body({message}), beforeCalls=calls.length, response=await post(request);
    assert.equal(response.statusCode,200);assert.equal(response.json().state,'completed');
    assert.equal(calls.at(-1).messages.at(-1).content,message);
    assert.equal(state.aiChatSession.find(row=>row.sessionId===response.json().sessionId).messages[0].content,message);
    assert.equal((await post(request)).json().state,'completed');assert.equal(calls.length,beforeCalls+1);
  }
  assert.equal((await post(body({message:'   '}))).statusCode,400);
  const beforeLarge=calls.length,beforeOperations=state.aiChatOperation.length;
  assert.equal((await post(body({message:'x'.repeat(2*1024*1024)}))).statusCode,413);
  assert.equal(calls.length,beforeLarge);assert.equal(state.aiChatOperation.length,beforeOperations);"""
assert a in s;s=s.replace(a,b).replace('cases: 24','cases: 28');target=S/'backend/scripts/test-ai-long-message.cjs';target.parent.mkdir(parents=True,exist_ok=True);target.write_text(s,encoding='utf-8')
env=os.environ.copy();env['NODE_PATH']=str(R/'backend/node_modules');result=subprocess.run(['node',str(target)],cwd=S,env=env,text=True,encoding='utf-8',capture_output=True);print(result.stdout,end='');print(result.stderr,end='');assert result.returncode==0
(H/'long-api-results.json').write_text(json.dumps({'passed':True,'cases':28,'longMessagesPassed':[1001,'1001 Unicode symbols','~100000 Cyrillic characters'],'fullProviderPayloadAndStoredHistory':True,'idempotency':True,'existingTransportBoundary413BeforeProvider':True,'realProviderRequests':0,'database':'in-memory fixture','modelAndPromptUnchanged':True},indent=2),encoding='utf-8')
