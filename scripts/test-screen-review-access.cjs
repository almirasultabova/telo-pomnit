const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync(path.resolve(__dirname,'../app/js/screen-review.js'),'utf8');
const elements=new Map(),events={};let route='home',frames=0;
const make=tag=>({tag,hidden:false,value:'pre',contentWindow:{},setAttribute(key,value){this[key]=value},addEventListener(){},remove(){this.removed=true},
append(node){if(node.id)elements.set(node.id,node);if(node.tag==='iframe')frames++}});
for(const id of ['app','profile-account-actions','screen-review-choice','screen-review-stage','screen-review-status','screen-review-retry','screen-review-close'])elements.set(id,make('div'));
const Api={userId:'owner',_authGeneration:1,clubBlocked:false,userRole:'PARTICIPANT',isClubAdmin:false,isAuthed:()=>true};
const ctx={window:{addEventListener:(name,fn)=>events[name]=fn},Api,document:{readyState:'complete',createElement:make,getElementById:id=>elements.get(id)||null},
goTo:value=>route=value,switchTab(){},setTimeout:()=>1,clearTimeout(){}};
vm.createContext(ctx);vm.runInContext(code,ctx);const review=ctx.window.ScreenReview;
review.renderEntry();assert(!elements.has('screen-review-entry'));
Api.userRole='HOST';review.renderEntry();const entry=elements.get('screen-review-entry');assert(entry&&!entry.hidden);entry.onclick();assert.equal(route,'screen-review');
let frame=elements.get('screen-review-frame');assert.equal(frame.sandbox,'allow-scripts');assert(!frame.src.includes('owner'));assert(!frame.src.includes('token'));assert(frame.hidden);
events.message({source:{},data:{type:'telo-screen-review-ready'}});assert(frame.hidden);
events.message({source:frame.contentWindow,data:{type:'telo-screen-review-ready'}});assert(!frame.hidden);
const old=frame;elements.get('screen-review-choice').value='compared';elements.get('screen-review-choice').onchange({target:{value:'compared'}});frame=elements.get('screen-review-frame');assert(old.removed);
events.message({source:old.contentWindow,data:{type:'telo-screen-review-exit'}});assert.equal(route,'screen-review');
Api._authGeneration++;events.message({source:frame.contentWindow,data:{type:'telo-screen-review-ready'}});assert(frame.hidden);review.invalidate();assert(frame.removed);
Api.userRole='PARTICIPANT';review.renderEntry();assert(entry.hidden);const count=frames;entry.onclick();assert.equal(frames,count);
Api.userRole='ADMIN';review.renderEntry();assert(!entry.hidden);Api.clubBlocked=true;review.renderEntry();assert(entry.hidden);
console.log('PASS: participant/blocked denied, HOST/ADMIN review, opaque sandbox, no identity transfer, stale/foreign messages ignored, auth cleanup');
