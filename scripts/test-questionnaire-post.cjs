// Real Fastify and auth, synthetic isolated persistence; never connects to production.
const path=require('node:path'),assert=require('node:assert/strict'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),backend=path.join(root,'backend');
process.env.NODE_PATH=path.join(root,'backend/node_modules');Module._initPaths();
process.env.JWT_SECRET='post-questionnaire-isolated-fixture';process.env.ADMIN_TELEGRAM_IDS='100';
let user={id:'A',telegramId:200n,role:'PARTICIPANT',accessStatus:'approved',tokenVersion:0,createdAt:new Date('2026-10-01')};
let status='active',endDate='2026-09-30T12:00:00Z',rows=[],fail=false;
const db={user:{findUnique:async()=>user},$queryRawUnsafe:async()=>[],$transaction:async fn=>fn(db),
enrollment:{findFirst:async({where})=>where.userId==='A' && where.streamId==='own' && (typeof where.status==='string' ? where.status===status : where.status.in.includes(status)) ? {accessBasis:'free',status,createdAt:new Date('2026-10-01'),stream:{endDate}} : null},
questionnaire:{findFirst:async({where})=>rows.find(row=>row.userId===where.userId&&row.streamId===where.streamId&&row.type===where.type),
findMany:async({where})=>rows.filter(row=>row.userId===where.userId&&row.streamId===where.streamId),
create:async({data})=>{if(fail){fail=false;throw new Error('synthetic persistence unavailable')} const row={...data,id:'form-'+rows.length,createdAt:new Date().toISOString()};rows.push(row);return row}}};
require.cache[require.resolve(path.join(backend,'src/db'))]={exports:db};
(async()=>{
 const app=require('fastify')({logger:false});app.register(require(path.join(backend,'src/routes/questionnaires')));
 const auth=require(path.join(backend,'src/services/auth')),headers={authorization:'Bearer '+auth.createToken('A',0)};
 const post=(answers={},streamId='own')=>app.inject({method:'POST',url:'/questionnaires/post',headers,payload:{streamId,answers,formVersion:2}});
 assert.equal((await app.inject({method:'POST',url:'/questionnaires/post',payload:{streamId:'own',answers:{}}})).statusCode,401);
 assert.equal((await post({},'other')).statusCode,403);
 for(const answer of [{bodyContactScale:0},{anxietyScale:11},{anxietyScale:'5'},{unknown:'private'},{benefit_app:'made up'},{lifeExample:'x'.repeat(4001)}]) assert.equal((await post(answer)).statusCode,400,Object.keys(answer).join(','));
 endDate='2030-01-01';assert.equal((await post()).statusCode,403);
 endDate='2026-09-30';status='cancelled';assert.equal((await post()).statusCode,403);status='completed';
 const answer={bodyContactScale:6,anxietyScale:null,currentSituation:'Synthetic own answer',situationChange:'Примерно так же'};
 fail=true;assert.equal((await post(answer)).statusCode,503);assert.equal(rows.length,0);
 const saved=await post(answer);assert.equal(saved.statusCode,200);assert.equal(saved.json().formVersion,2);assert.equal(saved.json().answers.anxietyScale,null);
 assert.equal((await post(answer)).statusCode,200);assert.equal(rows.length,1);
 assert.equal((await post({...answer,bodyContactScale:7})).statusCode,409);assert.equal(rows[0].answers.bodyContactScale,6);
 rows.push({id:'foreign',userId:'B',streamId:'own',type:'pre',answers:{currentSituation:'foreign'}});
 const get=await app.inject({method:'GET',url:'/questionnaires/own',headers});assert.equal(get.json().pre,null);assert.equal(get.json().post.id,saved.json().id);
 user={...user,deletedAt:new Date()};assert.equal((await post(answer)).statusCode,401);
 await app.close();console.log('PASS: own completed stream, auth, schema/null, safe retry/conflict, own reads, deleted account');
})().catch(error=>{console.error(error);process.exitCode=1});
