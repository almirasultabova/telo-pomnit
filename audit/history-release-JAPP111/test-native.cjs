// Native signed auth and real PostgreSQL, disposable schema-only database only.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {randomUUID,createHmac}=require('node:crypto');
const stage=__dirname,live='/var/www/telo-pomnit/backend',c=JSON.parse(fs.readFileSync(stage+'/test-private.json'));
assert(/^telo_japp111_[a-f0-9]{12}$/.test(c.name));assert.equal(new URL(c.url).pathname,'/'+c.name);
Object.assign(process.env,{DATABASE_URL:c.url,DIRECT_URL:c.url,JWT_SECRET:'synthetic-japp111-only',BOT_TOKEN:'synthetic-token-no-network',ADMIN_TELEGRAM_IDS:'900003'});
const runtime=process.argv.includes('--installed')?live:stage+'/backend';
const {PrismaClient}=require(stage+'/test-client'),db=new PrismaClient({datasources:{db:{url:c.url}}});
require.cache[require.resolve(runtime+'/src/db.js')]={exports:db};
const admission=require(runtime+'/src/services/admission.js');
// Admission decisions/auth remain real; explicitly disable new-request notifications.
require.cache[require.resolve(runtime+'/src/services/admission.js')]={exports:{...admission,requestAdmission:async()=>{}}};
let external=0;global.fetch=async()=>{external++;throw Error('External network forbidden')};
function signed(id,extra={}){
 const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id,first_name:'Synthetic'}),...extra});
 const text=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
 const key=createHmac('sha256','WebAppData').update(process.env.BOT_TOKEN).digest();p.set('hash',createHmac('sha256',key).update(text).digest('hex'));return p.toString();
}
(async()=>{
 assert.equal((await db.$queryRawUnsafe('SELECT current_database() AS name'))[0].name,c.name);
 await db.user.deleteMany();
 const app=require(live+'/node_modules/fastify')({logger:false});app.register(require(runtime+'/src/routes/auth.js'));
 const auth=require(runtime+'/src/services/auth.js');app.get('/admin-test',{preHandler:auth.requireAdmin},async()=>({ok:true}));await app.ready();
 const post=(id,extra={})=>app.inject({method:'POST',url:'/telegram',payload:{initData:signed(id),role:'HOST',isClubAdmin:true,...extra}});
 try{
  for(const [id,role]of [[900001,'HOST'],[900002,'PARTICIPANT'],[900003,'HOST']])await db.user.create({data:{id:randomUUID(),telegramId:BigInt(id),role,accessStatus:'approved',consentGivenAt:new Date()}});
  for(const [id,role,admin]of [[900001,'HOST',false],[900002,'PARTICIPANT',false],[900003,'HOST',true]]){
   const r=await post(id);assert.equal(r.statusCode,200,r.body);assert.equal(r.json().user.role,role);assert.equal(r.json().user.isClubAdmin,admin);
   const claims=require(live+'/node_modules/jsonwebtoken').verify(r.json().token,process.env.JWT_SECRET);assert.equal(claims.userId,r.json().user.id);
   const access=await app.inject({url:'/admin-test',headers:{authorization:'Bearer '+r.json().token}});assert.equal(access.statusCode,admin?200:403);
  }
  const id=900002;await db.user.update({where:{telegramId:BigInt(id)},data:{accessStatus:'pending'}});assert.equal((await post(id)).statusCode,403);
  await db.user.update({where:{telegramId:BigInt(id)},data:{accessStatus:'rejected'}});assert.equal((await post(id)).statusCode,403);
  await db.user.update({where:{telegramId:BigInt(id)},data:{deletedAt:new Date()}});assert.equal((await post(id)).statusCode,403);
  assert.equal((await post(900001,{initData:'invalid'})).statusCode,401);assert.equal((await post(900001,{initData:signed(900001,{auth_date:'1'})})).statusCode,401);
  assert.equal(external,0);assert.equal(await db.user.count(),3);
  const result={passed:true,nativePostgres:true,signedSyntheticTelegram:true,serverOwnedRole:true,spoofIgnored:true,hostNotAdmin:true,adminRechecked:true,pendingRejectedDeletedDenied:true,invalidAndExpiredDenied:true,externalCalls:0,productionRows:0,noMigration:true};
  fs.writeFileSync(stage+(process.argv.includes('--installed')?'/installed-postgres-results.json':'/postgres-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await app.close();await db.$disconnect()}
})().catch(e=>{fs.writeFileSync(stage+'/private-native-error.log',e.stack||String(e),{mode:0o600});console.error('Isolated auth test failed; diagnostics private');process.exit(1)});
