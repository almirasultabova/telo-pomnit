// Execute only on the host, with its existing key. No listener or real DB.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),{randomUUID,randomBytes,createHash}=require('node:crypto');
const BASE='/var/www/telo-pomnit/backend';
const dotenv=require(BASE+'/node_modules/dotenv');
dotenv.config({path:BASE+'/.env',quiet:true});
const pm=spawnSync('pm2',['jlist'],{encoding:'utf8',maxBuffer:16e6});
assert.equal(pm.status,0,'Cannot inspect running configuration');
const running=JSON.parse(pm.stdout).find(p=>p.name==='telo-backend');
assert.equal(running?.pm2_env.status,'online');
const fileKey=process.env.OPENAI_API_KEY,processKey=running.pm2_env.OPENAI_API_KEY;
if(processKey)process.env.OPENAI_API_KEY=processKey;
const files=['src/routes/ai.js','src/routes/me.js','src/services/auth.js'];
const hashes=Object.fromEntries(files.map(f=>[f,createHash('sha256').update(fs.readFileSync(BASE+'/'+f,'utf8').replace(/\r\n/g,'\n')).digest('hex')]));
const credential={present:typeof process.env.OPENAI_API_KEY==='string'&&process.env.OPENAI_API_KEY.length>20,source:processKey?'running-process':'backend-env',consistent:!processKey||!fileKey||processKey===fileKey};
if(process.argv.includes('--inspect')){console.log(JSON.stringify({credential,hashes,providerCalls:0,realDbReads:0}));process.exit(0)}
assert(process.argv.includes('--live-confirmed'),'Live provider test requires explicit authorization and --live-confirmed');
assert(credential.present,'Existing application credential missing');
assert(credential.consistent,'Running and file credentials differ; stop before a paid call');
assert(!process.env.OPENAI_BASE_URL||process.env.OPENAI_BASE_URL.replace(/\/$/,'')==='https://api.openai.com/v1','Unexpected provider endpoint');
// Only the credential is reused. Probe JWTs cannot authenticate on production.
process.env.JWT_SECRET=randomBytes(32).toString('hex');
process.env.ADMIN_TELEGRAM_IDS='';delete process.env.BOT_TOKEN;
process.env.DATABASE_URL='postgresql://fictional:fictional@127.0.0.1:1/never-connect';
const U=randomUUID();
const user={id:U,telegramId:990099000n,name:'Искусственный тест AI',role:'HOST',accessStatus:'approved',tokenVersion:0,deletedAt:null};
let sessions=[],diaryReads=0,providerCalls=0,provider={},forbiddenNetwork=0;
const deny=new Proxy({}, {get:()=>async()=>{throw Error('Unexpected database operation')}});
const db=new Proxy({
 user:{findUnique:async({where})=>{assert.equal(where.id,U);return user}},
 enrollment:{findMany:async({where})=>{assert.equal(where.userId,U);return[]}},
 stream:{findMany:async()=>[]},
 diaryEntry:new Proxy({}, {get:()=>async()=>{diaryReads++;throw Error('Diary access forbidden')}}),
 aiChatSession:{
  create:async({data})=>{assert.equal(data.userId,U);assert.equal(data.contextMode,'none');assert.deepEqual(data.contextSnapshot,[]);const s={id:randomUUID(),createdAt:new Date(),...data};sessions.push(s);return s},
  findFirst:async({where})=>{assert.equal(where.userId,U);return sessions.find(s=>s.sessionId===where.sessionId&&s.userId===U)||null},
  update:async({where,data})=>{const s=sessions.find(s=>s.sessionId===where.sessionId);assert(s);Object.assign(s,data);return s},
 },
 $queryRawUnsafe:async(sql,id)=>{assert.equal(id,U);return[{id:U}]},
 $transaction:async fn=>fn(db),
},{get:(target,key)=>key in target?target[key]:deny});
require.cache[require.resolve(BASE+'/src/db.js')]={exports:db};
const message='Это вымышленная проверка чата. После рабочего дня замечаю лёгкое напряжение в плечах. Помогите коротко назвать, что можно заметить в этом ощущении.';
const nativeFetch=global.fetch;
async function safeFetch(input,init){
 const url=new URL(typeof input==='string'?input:input.url);
 if(url.origin!=='https://api.openai.com'||url.pathname!=='/v1/chat/completions'){forbiddenNetwork++;throw Error('Unexpected outbound endpoint')}
 assert.equal(++providerCalls,1,'Only one provider request is authorized for this probe');
 const body=JSON.parse(init?.body||await input.clone().text());
 assert.equal(body.model,'gpt-4o-mini');assert.equal(body.store,false);assert.equal(body.messages.length,2);
 assert.equal(body.messages[0].role,'system');assert.equal(body.messages[1].role,'user');assert.equal(body.messages[1].content,message);
 const response=await nativeFetch(input,init);
 const data=await response.clone().json();
 provider={status:response.status,requestId:response.headers.get('x-request-id'),model:data.model||body.model,usage:data.usage||null,errorCode:data.error?.code||null,errorType:data.error?.type||null};
 return response;
}
global.fetch=safeFetch;
const sdk=require.resolve('openai',{paths:[BASE]}),Original=require(sdk);
class ProbeOpenAI extends Original{constructor(opts){super({...opts,maxRetries:0,timeout:25000,fetch:safeFetch})}}
require.cache[sdk].exports=ProbeOpenAI;
async function main(){
 const app=require(BASE+'/node_modules/fastify')({logger:false});
 const auth=require(BASE+'/src/services/auth');
 await app.register(require(BASE+'/src/routes/ai'));
 const headers={authorization:'Bearer '+auth.createToken(U,0)};
 const unauth=await app.inject({method:'POST',url:'/ai/chat',payload:{message,contextMode:'none'}});
 assert.equal(unauth.statusCode,401);assert.equal(providerCalls,0);
 const answer=await app.inject({method:'POST',url:'/ai/chat',headers,payload:{message,contextMode:'none'}});
 const data=answer.json();let historyRestored=false;
 if(answer.statusCode===200){
  assert.equal(typeof data.reply,'string');assert(data.reply.length>0);assert.equal(data.contextMode,'none');assert.equal(data.contextEntryCount,0);
  const history=await app.inject({method:'GET',url:'/ai/sessions/'+data.sessionId,headers});
  assert.equal(history.statusCode,200);const saved=history.json();
  assert.equal(saved.messages.length,2);assert.equal(saved.messages[0].content,message);assert.equal(saved.messages[1].content,data.reply);
  historyRestored=true;
 }
 assert.equal(diaryReads,0);assert.equal(forbiddenNetwork,0);assert.equal(providerCalls,1);
 console.log(JSON.stringify({status:answer.statusCode===200?'PASS':'PROVIDER_FAILURE',routeStatus:answer.statusCode,credential,hashes,provider,providerCalls,diaryReads,realDbReads:0,realDbWrites:0,notifications:0,contextMode:'none',contextEntryCount:0,syntheticHistoryRestored:historyRestored,reply:data.reply||null,sessionId:data.sessionId||null,uiErrorCode:data.code||null}));
 await app.close();sessions=[];
 if(answer.statusCode!==200)process.exitCode=2;
}
main().catch(()=>{console.log(JSON.stringify({status:'PROBE_FAILED',provider,providerCalls,diaryReads,forbiddenNetwork,secretsPrinted:false}));process.exitCode=1});
