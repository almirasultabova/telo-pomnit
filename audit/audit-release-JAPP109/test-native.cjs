// Isolated PostgreSQL only; two processes and mock provider, no external calls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID,randomBytes}=require('node:crypto'),{fork}=require('node:child_process');
const stage=__dirname,live='/var/www/telo-pomnit/backend';
const config=JSON.parse(fs.readFileSync(stage+'/test-private.json'));
assert(/^telo_japp109_[a-f0-9]{12}$/.test(config.name));
assert.equal(new URL(config.url).pathname,'/'+config.name);
Object.assign(process.env,{DATABASE_URL:config.url,DIRECT_URL:config.url,JWT_SECRET:'synthetic-japp109-process-test-only',BOT_TOKEN:'',ADMIN_TELEGRAM_IDS:'900003',OPENAI_API_KEY:'synthetic-unused'});
const {PrismaClient}=require(stage+'/test-client'),db=new PrismaClient({datasources:{db:{url:config.url}}});
const runtime=process.argv.includes('--installed')?live:stage+'/backend';
async function worker(){
 let calls=0;global.fetch=async()=>{throw Error('External fetch forbidden')};
 require.cache[require.resolve(runtime+'/src/db.js')]={exports:db};
 require.cache[require.resolve(runtime+'/src/routes/me.js')]={exports:{getProgramAccess:async()=>({ai:{canWrite:true,message:'synthetic'}})}};
 require.cache[require.resolve(live+'/node_modules/openai')]={exports:class{constructor(options){assert.equal(options.maxRetries,0);assert.equal(options.timeout,45000);this.chat={completions:{create:async payload=>{
  calls++;assert.equal(payload.model,'gpt-4.1-mini');assert.equal(payload.store,false);
  const text=payload.messages.at(-1).content;
  fs.appendFileSync(stage+'/provider-calls.txt',text+'\n');
  if(text==='crash synthetic')process.exit(72);
  if(text==='rejected synthetic')throw Object.assign(Error('synthetic rejection'),{status:429});
  if(text==='uncertain synthetic')throw Error('synthetic transport loss');
  await new Promise(r=>setTimeout(r,text==='delete synthetic'?700:180));
  return {choices:[{message:{content:'Synthetic reply'}}]};
 }}}}}};
 const app=require(live+'/node_modules/fastify')({logger:false});app.register(require(runtime+'/src/routes/ai.js'));
 app.register(require(runtime+'/src/routes/gdpr.js'),{prefix:'/gdpr'});
 await app.listen({port:0,host:'127.0.0.1'});process.send({port:app.server.address().port});
 process.on('message',async msg=>{if(msg==='stop'){await app.close();await db.$disconnect();process.exit(0)}});
}
async function main(){
 assert.equal((await db.$queryRawUnsafe('SELECT current_database() AS name'))[0].name,config.name);
 await db.aiChatOperation.deleteMany();await db.aiChatSession.deleteMany();await db.user.deleteMany();
 fs.writeFileSync(stage+'/provider-calls.txt','');
 const users=[];for(let i=0;i<4;i++)users.push(await db.user.create({data:{id:randomUUID(),telegramId:BigInt(900001+i),role:i===2?'HOST':'PARTICIPANT',accessStatus:i===3?'pending':'approved',consentGivenAt:new Date()}}));
 const jwt=require(live+'/node_modules/jsonwebtoken');
 const token=(i,rights=false)=>jwt.sign({userId:users[i].id,tokenVersion:0,purpose:rights?'data-rights':'club'},process.env.JWT_SECRET,{expiresIn:'5m',...(rights?{audience:'telo-personal-data'}:{})});
 const children=[];
 async function start(){let child=fork(__filename,['--worker',...(process.argv.includes('--installed')?['--installed']:[])],{stdio:['ignore','ignore','ignore','ipc']});children.push(child);return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('worker timeout')),15000);child.once('message',x=>{clearTimeout(timer);resolve({child,base:'http://127.0.0.1:'+x.port})});child.once('exit',code=>{clearTimeout(timer);reject(Error('worker exited '+code))})})}
 let a,b;const request=async(w,method,url,body,i=0)=>{const r=await fetch(w.base+url,{method,headers:{'Content-Type':'application/json',...(i===null?{}:{Authorization:'Bearer '+token(i,method==='DELETE')})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});return{status:r.status,headers:r.headers,body:await r.json()}};
 const payload=(message='concurrent synthetic')=>({operationId:randomUUID(),message,contextMode:'none'});
 const count=()=>fs.readFileSync(stage+'/provider-calls.txt','utf8').trim().split('\n').filter(Boolean).length;
 try{
  a=await start();b=await start();const p=payload();
  const replies=await Promise.all(Array.from({length:12},(_,i)=>request(i%2?a:b,'POST','/ai/chat',p)));
  assert(replies.every(x=>x.status===200),JSON.stringify(replies));assert.equal(count(),1);assert.equal(await db.aiChatOperation.count(),1);assert.equal(await db.aiChatSession.count(),1);
  let operation=await request(b,'GET','/ai/operations/'+p.operationId);assert.equal(operation.body.state,'completed');assert.equal(operation.headers.get('cache-control'),'private, no-store');
  assert.equal((await request(a,'POST','/ai/chat',{...p,message:'changed'})).status,409);assert.equal(count(),1);
  for(const i of [1,2]){assert.equal((await request(a,'GET','/ai/operations/'+p.operationId,null,i)).status,404);assert.equal((await request(a,'GET','/ai/sessions/'+operation.body.sessionId,null,i)).status,404)}
  assert.equal((await request(a,'POST','/ai/chat',payload(),null)).status,401);assert.equal((await request(a,'POST','/ai/chat',payload(),3)).status,403);
  let stored=await db.aiChatSession.findFirst({where:{sessionId:operation.body.sessionId}});assert.equal(stored.messages.length,2);
  const continuation={operationId:randomUUID(),message:'next synthetic',sessionId:stored.sessionId};await request(a,'POST','/ai/chat',continuation);await request(b,'POST','/ai/chat',continuation);assert.equal(count(),2);stored=await db.aiChatSession.findFirst({where:{sessionId:stored.sessionId}});assert.equal(stored.messages.length,4);
  for(const message of ['x'.repeat(1001),'😀'.repeat(1001),'   '])assert.equal((await request(a,'POST','/ai/chat',payload(message))).status,400);
  for(const [message,state]of [['rejected synthetic','failed'],['uncertain synthetic','uncertain']]){const p=payload(message);const result=await request(a,'POST','/ai/chat',p);assert.equal(result.body.state,state);const n=count();await request(b,'POST','/ai/chat',p);assert.equal(count(),n)}
  const crash=payload('crash synthetic');await request(a,'POST','/ai/chat',crash).catch(()=>{});if(a.child.exitCode===null)await new Promise(resolve=>a.child.once('exit',resolve));assert.equal(a.child.exitCode,72);await db.aiChatOperation.update({where:{userId_operationId:{userId:users[0].id,operationId:crash.operationId}},data:{createdAt:new Date(Date.now()-130000)}});const before=count();assert.equal((await request(b,'POST','/ai/chat',crash)).body.state,'uncertain');assert.equal(count(),before);a=await start();
  const exported=await request(b,'GET','/gdpr/my-data');assert.equal(exported.status,200);assert(exported.body.aiOperations.length>=4);assert(exported.body.aiOperations.every(x=>!('userId'in x)));
  const pending=payload('delete synthetic');const inFlight=request(a,'POST','/ai/chat',pending);for(let i=0;i<40&&!fs.readFileSync(stage+'/provider-calls.txt','utf8').includes('delete synthetic');i++)await new Promise(r=>setTimeout(r,30));assert(fs.readFileSync(stage+'/provider-calls.txt','utf8').includes('delete synthetic'));
  const deletion=await request(b,'DELETE','/gdpr/delete-me',{confirm:'DELETE_MY_DATA'});assert.equal(deletion.status,200);const late=await inFlight;assert.equal(late.status,503);assert.equal(await db.aiChatOperation.count({where:{userId:users[0].id}}),0);assert.equal(await db.aiChatSession.count({where:{userId:users[0].id}}),0);assert.equal((await request(b,'GET','/ai/operations/'+pending.operationId)).status,401);
  const result={passed:true,twoWorkerConcurrency:12,oneProviderPerOperation:true,immutablePayload:true,ownerAndHostIsolation:true,admissionEnforced:true,canonicalMessagePair:true,unicodeLimit:true,knownRejection:true,uncertainNotRetried:true,crashedWorkerNotReclaimed:true,ownExport:true,deletionDuringProvider:true,lateResultNotRestored:true,realOpenAI:0,productionRows:0};
  fs.writeFileSync(stage+(process.argv.includes('--installed')?'/installed-postgres-results.json':'/postgres-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{for(const c of children)if(c.exitCode===null)c.kill();await db.$disconnect()}
}
(process.argv.includes('--worker')?worker():main()).catch(e=>{fs.writeFileSync(stage+'/private-native-'+process.pid+'-error.log',e.stack||String(e),{mode:0o600});console.error('Native isolated test failed; private diagnostics saved');process.exit(1)});
