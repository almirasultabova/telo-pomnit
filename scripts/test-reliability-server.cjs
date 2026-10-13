// Actual Fastify/auth, serialized in-memory DB; no SMTP, Telegram or production DB.
const path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const backend=path.resolve(__dirname,'../backend'),local=p=>require(path.join(backend,p));
process.env.JWT_SECRET='reliability-synthetic-test';
const user={id:'A',telegramId:123n,tokenVersion:0,deletedAt:null,accessStatus:'approved'},rows={feedback:[],triggerEntry:[],questionnaire:[]};let notices=0;
const db={user:{findUnique:async()=>user},enrollment:{findFirst:async({where})=>where.streamId==='own'?{id:'e'}:null},$queryRawUnsafe:async()=>[]};
for(const [name,list] of Object.entries(rows))db[name]={findUnique:async({where})=>{const key=Object.values(where)[0];return list.find(r=>Object.entries(key).every(([k,v])=>r[k]===v));},findFirst:async({where})=>list.find(r=>Object.entries(where).every(([k,v])=>r[k]===v)),create:async({data})=>{const row={id:randomUUID(),createdAt:new Date(),...data};list.push(row);return row;}};
let queue=Promise.resolve();db.$transaction=async fn=>{const prev=queue;let release;queue=new Promise(r=>release=r);await prev;try{return await fn(db)}finally{release();}};
require.cache[require.resolve(path.join(backend,'src/db'))]={exports:db};require.cache[require.resolve(path.join(backend,'src/bot'))]={exports:{notifyAdminsAboutFeedback:async()=>{notices++;}}};
(async()=>{
 const app=local('node_modules/fastify')({logger:false});for(const name of ['feedback','triggers','questionnaires'])app.register(local('src/routes/'+name));const headers={authorization:'Bearer '+local('src/services/auth').createToken(user.id,0)};
 const post=(url,payload)=>app.inject({method:'POST',url,headers,payload});
 assert.equal((await post('/feedback',{text:'   '})).statusCode,400);
 const feedback={text:'synthetic',rating:4,operationId:randomUUID()};const responses=await Promise.all([post('/feedback',feedback),post('/feedback',feedback)]);assert(responses.every(r=>r.statusCode===200));assert.equal(rows.feedback.length,1);assert.equal(notices,1);assert.equal((await post('/feedback',{...feedback,text:'changed'})).statusCode,409);
 const trigger={situation:'synthetic',reactionType:'freeze',intensity:3,sensations:[],clientId:randomUUID(),createdAt:new Date().toISOString()};assert.equal((await post('/triggers',trigger)).statusCode,200);assert.equal((await post('/triggers',trigger)).statusCode,200);assert.equal(rows.triggerEntry.length,1);assert.equal((await post('/triggers',{...trigger,intensity:5})).statusCode,409);
 assert.equal((await post('/questionnaires/pre',{streamId:'own',answers:{}})).statusCode,400);
 const schema=local('src/questionnaire-pre-schema.json'),answers=Object.fromEntries(schema.required.map(k=>[k,schema.properties[k].enum?.[0]||'Synthetic']));
 assert.equal((await post('/questionnaires/pre',{streamId:'other',answers})).statusCode,403);assert.equal((await post('/questionnaires/pre',{streamId:'own',answers:{...answers,anxietyScale:999}})).statusCode,400);assert.equal((await post('/questionnaires/pre',{streamId:'own',answers})).statusCode,200);assert.equal((await post('/questionnaires/pre',{streamId:'own',answers})).statusCode,200);assert.equal(rows.questionnaire.length,1);
 await app.close();console.log('PASS feedback/trigger retries and conflicts, whitespace, required questionnaire/scales/own cohort');
})().catch(e=>{console.error(e);process.exitCode=1});
