// Real Fastify routes; all DB/SMTP/payment/Telegram dependencies are isolated.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),Module=require('node:module'),{EventEmitter}=require('node:events'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'../backend'),local=p=>require(path.join(root,p));
const NativeDate=Date;let clock=NativeDate.parse('2026-10-10T12:00:00Z');
global.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}};
Object.assign(process.env,{JWT_SECRET:'welcome-fixture-secret-not-real',SMTP_USER:'sender@example.invalid',YUKASSA_SHOP_ID:'fixture-shop',YUKASSA_SECRET_KEY:'fixture-provider-secret',APP_URL:'https://example.invalid'});
global.fetch=()=>{throw Error('Unexpected network fetch');};require('node:net').connect=()=>{throw Error('Unexpected network connection');};require('node:tls').connect=()=>{throw Error('Unexpected TLS connection');};
const orders=new Map();let smtp=[],telegram=[],smtpFail=false,smtpWait=null,failSentUpdate=false,providerCalls=0,creationPayload,providerPatch={},providerFail=false;
const clone=row=>row?{...row}:null;
const db={paymentOrder:{
 create:async({data})=>{const row={id:randomUUID(),createdAt:new Date(),processedAt:null,paymentId:null,welcomeEmailStatus:'pending',...data};orders.set(row.id,row);return clone(row);},
 findUnique:async({where})=>clone([...orders.values()].find(row=>Object.entries(where).every(([key,value])=>row[key]===value))),
 updateMany:async({where,data})=>{const row=orders.get(where.id);if(!row)return{count:0};if('processedAt'in where && (where.processedAt===null?row.processedAt!==null:!row.processedAt))return{count:0};if(where.welcomeEmailStatus && row.welcomeEmailStatus!==where.welcomeEmailStatus)return{count:0};Object.assign(row,data);return{count:1};},
 update:async({where,data})=>{if(data.welcomeEmailStatus==='sent'&&failSentUpdate){failSentUpdate=false;throw Error('fixture ACK storage failure');}const row=orders.get(where.id);assert(row);Object.assign(row,data);return clone(row);}
},stream:{findFirst:async()=>({id:'fixture-stream'})},user:{findFirst:async()=>({id:'fixture-user',telegramId:1n})},enrollment:{findFirst:async()=>null,create:async()=>({id:'fixture-enrollment'})},pendingEnrollment:{upsert:async()=>({})}};
db.$transaction=async fn=>fn(db);
require.cache[require.resolve(path.join(root,'src/db'))]={exports:db};
require.cache[require.resolve(path.join(root,'node_modules/nodemailer'))]={exports:{createTransport:()=>({sendMail:async mail=>{smtp.push(mail);if(smtpWait)await smtpWait;if(smtpFail)throw Error('fixture SMTP uncertain');return{messageId:'fixture'};}})}};
const fakeHttps={request(options,callback){providerCalls++;const req=new EventEmitter();let body='';req.setTimeout=()=>req;req.write=data=>body+=data;req.destroy=error=>req.emit('error',error);req.end=()=>queueMicrotask(()=>{
 if(providerFail){req.emit('error',Error('fixture provider unavailable'));return;}
 const response=new EventEmitter();response.statusCode=200;callback(response);let value;
 if(options.method==='POST'){creationPayload=JSON.parse(body);value={id:randomUUID(),confirmation:{confirmation_url:'https://example.invalid/provider'}};}
 else{const row=[...orders.values()].find(o=>options.path.endsWith(o.paymentId));assert(row);value={id:row.paymentId,status:'succeeded',paid:true,test:false,amount:{value:row.amount,currency:row.currency},recipient:{account_id:row.shopId},metadata:{orderId:row.id,streamId:row.streamId,email:row.email,name:row.name,telegramUsername:row.telegramUsername}};}
 response.emit('data',JSON.stringify({...value,...providerPatch}));response.emit('end');});return req;}};
const botStub={bot:{api:{sendMessage:async(...args)=>telegram.push(args)}}};
const paymentPath=path.join(root,'src/routes/payment.js'),paymentModule=new Module(paymentPath);paymentModule.filename=paymentPath;paymentModule.paths=Module._nodeModulePaths(path.dirname(paymentPath));
const realRequire=Module.createRequire(paymentPath);paymentModule.require=name=>name==='https'?fakeHttps:name==='../bot'?botStub:realRequire(name);paymentModule._compile(fs.readFileSync(paymentPath,'utf8'),paymentPath);
const welcome=local('src/services/welcome-email'),mailer=local('src/services/email');
const capability=row=>{const url=new URL(welcome.welcomeReturnUrl(row)),params=new URLSearchParams(url.hash.slice(1));assert.equal(url.search,'');assert.equal(url.pathname,'/thanks.html');return{orderId:params.get('welcome_order'),token:params.get('welcome_token')};};
async function order(overrides={}){const row=await db.paymentOrder.create({data:{amount:'15000.00',currency:'RUB',shopId:'fixture-shop',streamId:'fixture-stream',email:'owner@example.invalid',name:'Анна Смирнова',telegramUsername:'fixture',...overrides}});if(!('paymentId'in overrides)){orders.get(row.id).paymentId=randomUUID();row.paymentId=orders.get(row.id).paymentId;}return row;}
(async()=>{
 const app=local('node_modules/fastify')({logger:false});app.register(local('src/routes/email'));app.register(paymentModule.exports);
 const post=(payload)=>app.inject({method:'POST',url:'/send-welcome',payload});
 let response=await post({email:'arbitrary@example.invalid',name:'<img/src=x>'});assert.equal(response.statusCode,403);assert.equal(smtp.length,0);
 const paid=await order({processedAt:new Date()});const cap=capability(paid);
 const appUrl=process.env.APP_URL;process.env.APP_URL='http://localhost:3000';assert(welcome.welcomeReturnUrl(paid).startsWith('http://localhost:3000/thanks.html#'));
 process.env.APP_URL='http://example.invalid';assert.throws(()=>welcome.welcomeReturnUrl(paid));process.env.APP_URL=appUrl;
 const skew={...paid,createdAt:new Date(clock+60000)};assert(welcome.validWelcomeToken(skew,capability(skew).token));
 const almostExpired={...paid,createdAt:new Date(clock-86400000+1)};assert(welcome.validWelcomeToken(almostExpired,capability(almostExpired).token));
 for(const payload of [{...cap,token:'x'.repeat(43)},{...cap,orderId:randomUUID()},{...cap,email:'different@example.invalid'},{...cap,name:'different'},{...cap,token:[cap.token]}])assert((await post(payload)).statusCode>=400);
 assert.equal(smtp.length,0);
 const pending=await order();const pendingCap=capability(pending);assert.equal((await post(pendingCap)).statusCode,409);assert.equal(orders.get(pending.id).welcomeEmailStatus,'pending');
 const old=await order({createdAt:new Date(clock-86400000),processedAt:new Date()});assert.equal((await post(capability(old))).statusCode,403);
 const future=await order({createdAt:new Date(clock+60001),processedAt:new Date()});assert.equal((await post(capability(future))).statusCode,403);
 response=await post(cap);assert.equal(response.statusCode,200);assert.equal(response.json().status,'sent');assert.equal(smtp.length,1);assert.equal(smtp[0].to,'owner@example.invalid');assert(smtp[0].html.includes('Анна, добро пожаловать'));
 await Promise.all(Array.from({length:10},()=>post(cap)));assert.equal(smtp.length,1);
 const raced=await order({processedAt:new Date()});await Promise.all([welcome.sendPaidWelcome(raced.id),post(capability(raced)),post(capability(raced))]);assert.equal(smtp.length,2);
 let release;const waiting=await order({processedAt:new Date()});smtpWait=new Promise(resolve=>release=resolve);const work=welcome.sendPaidWelcome(waiting.id);
 while(orders.get(waiting.id).welcomeEmailStatus==='pending')await new Promise(resolve=>setImmediate(resolve));
 response=await post(capability(waiting));assert.equal(response.statusCode,202);assert.equal(response.json().status,'sending');release();await work;smtpWait=null;
 const failed=await order({processedAt:new Date()});smtpFail=true;const before=smtp.length;assert.equal((await post(capability(failed))).statusCode,503);smtpFail=false;await post(capability(failed));assert.equal(smtp.length,before+1);assert.equal(orders.get(failed.id).welcomeEmailStatus,'unconfirmed');
 const lostAck=await order({processedAt:new Date()});failSentUpdate=true;const ackBefore=smtp.length;assert.equal((await post(capability(lostAck))).statusCode,503);await post(capability(lostAck));assert.equal(smtp.length,ackBefore+1);
 const historical=await order({processedAt:new Date(),welcomeEmailStatus:'legacy'});assert.equal((await post(capability(historical))).statusCode,503);assert.equal(smtp.length,ackBefore+1);
 for(const name of ['<img/src=x>','&lt;img/src=x&gt;','A"\'&<>']){await mailer.sendWelcomeEmail('fixture@example.invalid',name);const html=smtp.at(-1).html;assert(!html.includes(name));assert(!html.includes('<img/src=x>'));assert(html.includes('&lt;')||html.includes('&amp;'));}
 await mailer.sendWelcomeEmail('fixture@example.invalid','  ');assert(smtp.at(-1).html.includes('участница, добро пожаловать'));
 const created=await app.inject({method:'POST',url:'/create-payment',payload:{email:'paid@example.invalid',name:'<img/src=x>',telegramUsername:'fixture'}});assert.equal(created.statusCode,200);assert(creationPayload.confirmation.return_url.includes('#welcome_order='));
 const createdId=creationPayload.metadata.orderId,createdRow=orders.get(createdId),createdCap=capability(createdRow);assert.equal((await post(createdCap)).statusCode,409);
 const beforeWebhook=smtp.length;const webhook=()=>app.inject({method:'POST',url:'/webhook/yukassa',payload:{event:'payment.succeeded',object:{id:createdRow.paymentId}}});
 providerFail=true;assert.equal((await webhook()).statusCode,503);providerFail=false;assert.equal(smtp.length,beforeWebhook);assert.equal(orders.get(createdId).processedAt,null);
 for(const patch of [{paid:false},{test:true},{amount:{value:'1.00',currency:'RUB'}}]){providerPatch=patch;assert.equal((await webhook()).statusCode,403);assert.equal(smtp.length,beforeWebhook);assert.equal(orders.get(createdId).processedAt,null);}providerPatch={};
 assert.equal((await webhook()).statusCode,200);assert.equal(smtp.length,beforeWebhook+1);assert.equal(smtp.at(-1).to,'paid@example.invalid');assert(!smtp.at(-1).html.includes('<img/src=x>'));assert.equal(telegram.length,1);
 await Promise.all([webhook(),webhook(),post(createdCap)]);assert.equal(smtp.length,beforeWebhook+1);assert.equal(telegram.length,1);
 assert(providerCalls>=2);await app.close();global.Date=NativeDate;
 console.log('PASS welcome security: anonymous/forged/wrong order/recipient/expiry denied; paid control; pending then verified webhook; shared concurrent claim/replay; sending/unconfirmed/legacy states; ambiguous SMTP/DB ACK no duplicate; HTML encodings/Cyrillic/default; provider, DB, SMTP and Telegram are stubs');
})().catch(error=>{global.Date=NativeDate;console.error(error);process.exitCode=1;});
