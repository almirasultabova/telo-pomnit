const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const code=fs.readFileSync(path.join(root,'app/js/screen-review-fixture.js'),'utf8');
function context(view) {
 const ctx={window:{},URLSearchParams,URL,DOMException,Response,structuredClone,location:{search:'?view='+view,href:'https://example.test/screen-review.html?view='+view}};
 vm.createContext(ctx);vm.runInContext(code,ctx);return ctx;
}
(async()=>{
 for(const view of ['pre','pre-thanks','post','post-thanks','compared','home-pending','q-invite','profile-pending','path-empty','path-example']){
  const ctx=context(view),request=(url,method='GET',body)=>ctx.window.fetch(url,{method,body:body?JSON.stringify(body):undefined});
  assert.throws(()=>ctx.window.localStorage,error=>error.name==='SecurityError');
  assert.equal((await request('/api/ai/chat','POST',{text:'synthetic'})).status,403);
  assert.equal((await request('https://external.test/api/ai/chat','POST')).status,403);
  assert.equal((await request('/api/feedback','POST',{text:'synthetic'})).status,403);
  assert.equal((await request('/api/me','PATCH',{name:'synthetic'})).status,403);
  const access=await (await request('/api/me/enrollment/access')).json();assert.equal(access.ai.canWrite,false);
  const before=await (await request('/api/questionnaires/fictional-stream')).json();
  if(['home-pending','q-invite','profile-pending'].includes(view))assert.equal(before.pre,null);
  const checkins=await(await request('/api/checkins')).json();
  assert.equal(checkins.length,view==='path-example'?4:0);
  if(view==='path-example')assert(checkins.every(row=>['tension','anxiety','energy','safety','bodyContact'].every(key=>Number.isInteger(row[key]))));
  const answer={bodyContactScale:7,anxietyScale:null,currentSituation:'Synthetic typed answer'};
  const saved=await (await request('/api/questionnaires/post','POST',{answers:answer})).json();assert.deepEqual(saved.answers,answer);
  const after=await (await request('/api/questionnaires/fictional-stream')).json();assert.deepEqual(after.pre,before.pre);
  const fresh=context(view),reset=await (await fresh.window.fetch('/api/questionnaires/fictional-stream')).json();assert.deepEqual(reset,before);
 }
 const html=fs.readFileSync(path.join(root,'output/app/screen-review.html'),'utf8');
 const main=fs.readFileSync(path.join(root,'output/app/index.html'),'utf8');
 assert(html.includes("connect-src 'none'"));assert(html.includes('data:font/woff2;base64,'));
 assert(html.indexOf('Object.defineProperty(window')<html.indexOf('const AppLocalStorage'));
 assert(!html.includes('window.LaunchSplash ='));assert(!html.includes('Telegram.WebView ='));
 assert(!main.includes("token:'fictional-review-only'"));assert(!main.includes('Object.defineProperty(window'));
 console.log('PASS: ten views, device storage denied, no AI/feedback, memory-only answers/reset, real pre preserved, CSP and fonts, fixture absent from main app');
})().catch(error=>{console.error(error);process.exitCode=1});
