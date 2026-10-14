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
 cycle.setStatus('own',{pre:{answers:{successMeans:'Synthetic'}},post:null});cycle.refreshEntries();node('home-q-banner-wrap-entry').click();
 assert.equal(route,'post-questionnaire');node('post-next').onclick();assert(pending);assert.equal(stored.answers.anxietyScale,null);
 Api.userId='B';Api._authGeneration++;Storage._generation++;cycle.invalidate();
 pending({id:'one',type:'post',streamId:'own',answers:{bodyContactScale:6}});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(cleared,0);assert.notEqual(route,'post-thanks');assert.equal(node('comparison-body').innerHTML,'');
 Api.userId='A';Api._authGeneration++;Storage._generation++;cycle.setStatus('own',{pre:{answers:{}},post:null});
 cycle.refreshEntries();node('home-q-banner-wrap-entry').click();node('post-next').onclick();ctx.selectedProgramId='other';
 pending({id:'two',type:'post',streamId:'own',answers:{}});await new Promise(resolve=>setImmediate(resolve));assert.equal(cleared,0);assert.notEqual(route,'post-thanks');
 ctx.selectedProgramId='own';cycle.invalidate();cycle.setStatus('own',{pre:{answers:{}},post:null});
 cycle.refreshEntries();node('home-q-banner-wrap-entry').click();node('post-next').onclick();Storage._generation++;
 pending({id:'three',type:'post',streamId:'own',answers:{}});await new Promise(resolve=>setImmediate(resolve));assert.equal(cleared,0);assert.notEqual(route,'post-thanks');
 cycle.invalidate(); cycle.setStatus('own',{pre:{answers:{successMeans:'Synthetic'}},post:null});
 cycle.refreshEntries(); node('home-q-banner-wrap-entry').click(); node('post-next').onclick();
 cycle.leaving('post-questionnaire'); ctx.goTo('home');
 pending({id:'late-after-back',type:'post',streamId:'own',answers:{bodyContactScale:6}});
 await new Promise(resolve=>setImmediate(resolve));
 console.log(JSON.stringify({scenario:'native-back-before-post-ack',expected:'home',actual:route}));
 assert.equal(route,'home','Late server acknowledgement must not reopen a screen after native Back');

 cycle.invalidate(); cycle.setStatus('own',{pre:{answers:{successMeans:'Synthetic'}},post:null});
 cycle.refreshEntries();node('home-q-banner-wrap-entry').click();node('post-next').onclick();
 ctx.goTo=value=>{cycle.leaving(route);route=value};
 pending({id:'normal-ack',type:'post',streamId:'own',answers:{bodyContactScale:6}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(route,'post-thanks');assert.equal(cleared,1);
 console.log(JSON.stringify({scenario:'normal-post-ack',actual:route,draftCleared:cleared}));

})().catch(error=>{console.error(error);process.exitCode=1});
