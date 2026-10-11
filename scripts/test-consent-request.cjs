// Actual API client and /me/consent route against Fastify; isolated user store.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const Fastify = require(path.join(root, 'backend/node_modules/fastify'));
const routeFile = path.join(root, 'backend/src/routes/me.js');
let consent = null, writes = 0, denied = false, failWrite = false;
const db = { user: {
  findUnique: async () => ({consentGivenAt: consent}),
  update: async ({data}) => { if(failWrite) throw Object.assign(new Error('Synthetic failure'), {statusCode:503}); writes++; consent=data.consentGivenAt; return {}; }
}};
const routeScope = {module:{exports:{}},require:name=> {
  if(name==='../db') return db;
  if(name==='../services/consent') return {CONSENT_VERSION:'test',CONSENT_SOURCE:'test',CONSENT_TEXT:'Synthetic consent'};
  if(name==='../services/auth') return {
    requireAuth:async(req,reply)=>{if(!req.headers.authorization)return reply.code(401).send({error:'Auth required'});if(denied)return reply.code(403).send({code:'CLUB_ACCESS_REJECTED',error:'Denied'});req.user={id:'synthetic'}},
    withActiveUser:async(req,callback)=>callback(db)
  };
  return {};
},Date};
vm.runInNewContext(fs.readFileSync(routeFile,'utf8'),routeScope);
const app=Fastify();
(async()=>{
 await app.register(routeScope.module.exports);
 const old=await app.inject({method:'PATCH',url:'/me/consent',headers:{'content-type':'application/json',authorization:'Bearer synthetic'}});
 assert.equal(old.statusCode,400);assert.equal(old.json().code,'FST_ERR_CTP_EMPTY_JSON_BODY');assert.equal(writes,0);
 const storage={setItem(){},removeItem(){}};
 const scope={AppLocalStorage:storage,AbortController,setTimeout,clearTimeout,console:{error(){}},Storage:{clearUser(){}},showAccessDenied(){},fetch:async(url,opts)=>{
   assert.equal(url,'/api/me/consent');assert.equal(opts.body,'{}');
   const res=await app.inject({method:opts.method,url:'/me/consent',headers:opts.headers,payload:opts.body});
   return {ok:res.statusCode<400,status:res.statusCode,json:async()=>res.json()};
 }};
 vm.runInNewContext(fs.readFileSync(path.join(root,'app/js/api.js'),'utf8')+'\nglobalThis.client=Api;',scope);
 const client=scope.client;client._token='synthetic';
 assert.equal((await client.giveConsent()).ok,true);assert.equal(writes,1);assert(consent);
 assert.equal((await client.giveConsent()).ok,true);assert.equal(writes,1);
 client._token=null;await assert.rejects(client.giveConsent(),e=>e.status===401);assert.equal(writes,1);
 client._token='synthetic';denied=true;await assert.rejects(client.giveConsent(),e=>e.status===403);assert.equal(writes,1);
 denied=false;consent=null;failWrite=true;client._token='synthetic';await assert.rejects(client.giveConsent(),e=>e.status===503);assert.equal(writes,1);
 await app.close();console.log(JSON.stringify({passed:6,oldEmptyJsonReproduced:true,realDbWrites:0}));
})().catch(async e=>{console.error(e);await app.close();process.exitCode=1});
