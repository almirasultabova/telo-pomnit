const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('app/js/app.js','utf8');
const nodes={};
const element=()=>({value:'',style:{},options:[],disabled:false,setAttribute(){},append(node){nodes[node.id]=node;},addEventListener(){},add(option){this.options.push(option);}});
for(const id of ['ai-input','ai-input-bar','ai-send-btn','ai-history-select','ai-access-notice'])nodes[id]=element();
let draft='',clears=0,release,requests=0;
const ctx={window:{addEventListener(){}},document:{getElementById:id=>nodes[id]||null,createElement:element,addEventListener(){}},
  Storage:{_userId:'synthetic-owner',_generation:1,saveAiDraft:(_,text)=>{draft=text;return true;},getAiDraft:()=>draft,
    isAiDraftPersistent:()=>true,clearAiDraftIfMatches:()=>{clears++;draft='';},moveAiDraftIfMatches(){}},
  Api:{clubBlocked:false,aiChat:()=>{requests++;return new Promise((resolve,reject)=>{release={resolve,reject};});}},
  refreshProgramAccess:async()=>{},renderAccessNotice(){},hapticNotify(){},Option:function(text,value){this.text=text;this.value=value;}};
vm.createContext(ctx);
vm.runInContext(source.slice(source.indexOf('let aiSessionId ='),source.indexOf("document.addEventListener('visibilitychange'",source.indexOf('let aiSessionId ='))),ctx);
vm.runInContext("aiAccessGranted=true;renderAiMessages=()=>{};renderAiChat=()=>{renderAiDraftStatus();document.getElementById('ai-send-btn').disabled=aiPending;};",ctx);
(async()=>{
  nodes['ai-input'].value='Synthetic unsent message';
  const pending=ctx.sendAiMessage();await new Promise(setImmediate);
  assert.equal(requests,1);assert.equal(nodes['ai-send-btn'].disabled,true);
  assert.equal(nodes['ai-draft-status'].textContent,'Отправляем сообщение. Ожидаем ответ AI…');
  release.reject(Object.assign(new Error('Synthetic provider unavailable'),{status:503,code:'AI_RATE_LIMITED'}));await pending;
  assert.equal(nodes['ai-input'].value,'Synthetic unsent message');assert.equal(draft,'Synthetic unsent message');assert.equal(clears,0);
  assert.equal(nodes['ai-send-btn'].disabled,false);assert(nodes['ai-draft-status'].textContent.includes('Synthetic provider unavailable'));
  assert(nodes['ai-draft-status'].textContent.includes('Ваш текст остаётся в поле.'));
  const retried=ctx.sendAiMessage();await new Promise(setImmediate);release.resolve({reply:'Synthetic reply',sessionId:'synthetic-session'});await retried;
  assert.equal(clears,1);assert.equal(nodes['ai-input'].value,'');assert.equal(nodes['ai-send-btn'].disabled,false);
  console.log('PASS: visible pending/failure, 503 retains draft and enables retry; only acknowledgement clears input; synthetic transport only');
})().catch(error=>{console.error(error);process.exitCode=1;});
