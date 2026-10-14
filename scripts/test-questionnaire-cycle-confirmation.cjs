// Identity/late-ack checks for the production module, with minimal DOM ports.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),code=fs.readFileSync(path.join(root,'app/js/questionnaire-cycle.js'),'utf8');
let pending,route='home',stored=null,cleared=0;
const nodes=new Map();
function node(id){if(!nodes.has(id)) nodes.set(id,{id,innerHTML:'',textContent:'',dataset:{},style:{},hidden:false,scrollTop:0,
 classList:{add(){},remove(){}},replaceChildren(){this.innerHTML=''},setAttribute(){},focus(){},scrollIntoView(){},insertAdjacentHTML(){},
 addEventListener(type,fn){this[type]=fn},querySelector(selector){if(selector==='[data-post-entry]')return node(id+'-entry');return null},closest(){return null}});return nodes.get(id)}
const Api={userId:'A',_authGeneration:1,isAuthed:()=>true,clubBlocked:false,userRole:'PARTICIPANT',saveQuestionnairePost:()=>new Promise(resolve=>pending=resolve)};
const Storage={_generation:1,getFormDraft:()=>({version:2,step:7,answers:{bodyContactScale:6,anxietyScale:null}}),saveFormDraft:(key,value)=>{stored=structuredClone(value);return true},clearFormDraft:()=>cleared++};
const document={readyState:'complete',getElementById:node,querySelector:()=>null,querySelectorAll:()=>[]};
const ctx={window:{},document,Api,Storage,selectedProgramId:'own',qFormIdentity:null,MutationObserver:class{observe(){}},
currentProgram:()=>({id:'own',phase:'completed'}),closeQInvite(){},goTo:value=>route=value,console};
vm.createContext(ctx);vm.runInContext(code,ctx);
const cycle=ctx.window.QuestionnaireCycle;

(async()=>{
 Storage.getFormDraft=()=>({version:2,step:7,answers:{currentSituation:'   '}});
 cycle.setStatus('own',{pre:{submittedAt:'2026-09-01T10:00:00Z',answers:{successMeans:'Synthetic'}},post:null});
 cycle.refreshEntries();node('home-q-banner-wrap-entry').click();
 assert(node('post-body').innerHTML.includes('В анкете пока нет ответов'));assert.equal(node('post-next').disabled,true);
 node('post-next').onclick();assert.equal(pending,undefined,'Empty form must not reach API before confirmation');
 node('post-body').change({target:{id:'post-empty-confirm',checked:true}});
 assert.equal(node('post-next').disabled,false);
 node('post-body').change({target:{id:'post-empty-confirm',checked:false}});assert.equal(node('post-next').disabled,true);
 node('post-body').change({target:{id:'post-empty-confirm',checked:true}});
 node('post-back').onclick();node('post-next').onclick();assert.equal(node('post-next').disabled,true,'Consent must reset on review re-entry');
 node('post-body').change({target:{id:'post-empty-confirm',checked:true}});node('post-next').onclick();assert(pending);
 pending({id:'empty-confirmed',type:'post',streamId:'own',submittedAt:'2026-10-02T10:00:00Z',answers:{}});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(route,'post-thanks');
 assert(node('post-thanks-body').innerHTML.includes('Анкета отправлена без ответов'));
 cycle.invalidate();pending=undefined;
 Storage.getFormDraft=()=>({version:2,step:7,answers:{anxietyScale:null}});
 cycle.setStatus('own',{pre:{answers:{successMeans:'Synthetic'}},post:null});cycle.refreshEntries();node('home-q-banner-wrap-entry').click();
 assert.equal(node('post-next').disabled,false);assert(!node('post-body').innerHTML.includes('В анкете пока нет ответов'));
 cycle.invalidate();cycle.setStatus('own',{pre:{submittedAt:'2026-09-01T10:00:00Z',answers:{currentSituation:'Synthetic initial request'}},post:{id:'one',submittedAt:'2026-10-02T10:00:00Z',answers:{currentSituation:'Synthetic final'}}});
 cycle.refreshEntries();node('home-q-banner-wrap-entry').click();
 const rendered=node('comparison-body').innerHTML;assert(rendered.includes('01.09.2026')&&rendered.includes('02.10.2026'));
 console.log('PASS: empty/whitespace blocked, explicit confirmation/reset, null counts as answer, real submittedAt dates');
})().catch(error=>{console.error(error);process.exitCode=1});
