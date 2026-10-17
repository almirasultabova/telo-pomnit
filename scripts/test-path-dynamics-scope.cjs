const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('app/js/app.js','utf8');
const core=source.slice(source.indexOf('function pathDynamicsContext()'),source.indexOf('// ─── 3. Итоговое'));
let resolve,rendered=0,owner='owner-a',generation=1,streamId='stream-a',operation;
const context={window:{},Date,Api:{get userId(){return owner;},clubBlocked:false,isAuthed:()=>true},
 Storage:{get _userId(){return owner;},get _generation(){return generation;},getHistoryLoadStatus:()=>({checkins:'loaded'}),initFromApi:()=>operation,flushCheckinsPending:()=>operation},
 get selectedProgramId(){return streamId;},currentProgram:()=>({id:streamId}),streamPeriod:()=>({start:0,end:100,weeks:1}),programNow:()=>50,CHECKIN_SCALES:[],selectedCheckins:()=>[],renderMyPathTab:()=>rendered++,currentScreen:'home',activeTab:'diag'};
vm.createContext(context);vm.runInContext(core,context);
async function delayed(change,sync=false){
 operation=new Promise(r=>resolve=r);const button={disabled:false,isConnected:true};
 const pending=context.refreshPathDynamics(button,sync);assert.equal(button.disabled,true);
 change();resolve();await pending;return button;
}
(async()=>{
 let button=await delayed(()=>{owner='owner-b';generation++;});assert.equal(rendered,0);assert.equal(button.disabled,true);
 button=await delayed(()=>{streamId='stream-b';},true);assert.equal(rendered,0);assert.equal(button.disabled,true);
 button=await delayed(()=>{context.activeTab='main';});assert.equal(rendered,0);assert.equal(button.disabled,false);
 context.activeTab='diag';button=await delayed(()=>{});assert.equal(rendered,1);assert.equal(button.disabled,false);
 // A detached old component must not dispatch actions after its scope changes.
 context.escapeAccessText=String;vm.runInContext(fs.readFileSync('app/js/path-dynamics.js','utf8'),context);
 const component={};let actions=0;
 const container={querySelector:()=>component};
 context.window.PathDynamics.bind(container,{context:()=>({allowed:true,scope:owner}),checkin:()=>actions++,retry:()=>actions++,sync:()=>actions++});
 owner='owner-c';component.onclick({target:{closest:selector=>selector==='[data-pd-sync]'?{}:null}});assert.equal(actions,0);
 console.log('PASS: late history/sync ack cannot update another account or stream; leaving the tab does not reopen it; stale component cannot dispatch.');
})().catch(e=>{console.error(e);process.exitCode=1;});
