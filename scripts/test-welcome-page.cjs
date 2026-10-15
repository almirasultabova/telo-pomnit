// Execute the real thanks-page handler with a DOM and fetch stub; no network.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.resolve(__dirname,'../site/thanks.html'),'utf8');
const code=html.match(/<script>([\s\S]*?)<\/script>/)[1].split('// Reveal on scroll')[0];
const hash='#welcome_order=12345678-1234-1234-1234-123456789abc&welcome_token='+'x'.repeat(43);
function page(fragment='',respond=async()=>({status:200,json:async()=>({status:'sent'})})){
 const fields={emailBtn:{disabled:true,textContent:'Получить письмо'},emailHint:{textContent:''},emailStatus:{textContent:'',className:''}};const calls=[];
 const ctx={URLSearchParams,AbortController,location:{hash:fragment},document:{getElementById:id=>fields[id]},setTimeout:()=>1,clearTimeout(){},fetch:async(url,options)=>{calls.push({url,...options});return respond();}};
 vm.createContext(ctx);vm.runInContext(code,ctx);return{ctx,fields,calls,send:()=>ctx.sendEmail({preventDefault(){}})};
}
(async()=>{
 for(const fragment of ['',hash+'&welcome_token=duplicate','#welcome_order=../wrong&welcome_token='+'x'.repeat(43)]){const p=page(fragment);assert(p.fields.emailBtn.disabled);await p.send();assert.equal(p.calls.length,0);assert(p.fields.emailHint.textContent.includes('после подтверждения оплаты'));}
 let p=page(hash);assert(!p.fields.emailBtn.disabled);await p.send();assert(p.fields.emailBtn.disabled);assert(p.fields.emailStatus.textContent.startsWith('Письмо отправлено'));assert.deepEqual(Object.keys(JSON.parse(p.calls[0].body)).sort(),['orderId','token']);assert.equal(p.calls[0].referrerPolicy,'no-referrer');await p.send();assert.equal(p.calls.length,1);
 for(const [status,result,retry]of [[409,{error:'Проверяем оплату',retryable:true},true],[403,{error:'Устаревшая ссылка',retryable:false},false],[503,{error:'Отправка не подтверждена',retryable:false},false]]){p=page(hash,async()=>({status,json:async()=>result}));await p.send();assert.equal(p.fields.emailBtn.disabled,!retry);assert.equal(p.fields.emailStatus.textContent,result.error);}
 p=page(hash,async()=>({status:202,json:async()=>({status:'sending'})}));await p.send();assert(p.fields.emailBtn.disabled);assert(!p.fields.emailStatus.textContent.includes('Письмо отправлено'));
 p=page(hash,async()=>{throw new TypeError('fixture offline');});await p.send();assert(!p.fields.emailBtn.disabled);assert(p.fields.emailStatus.textContent.includes('Не удалось проверить отправку'));
 let resolve;p=page(hash,()=>new Promise(r=>resolve=r));const first=p.send();await p.send();assert.equal(p.calls.length,1);resolve({status:200,json:async()=>({status:'sent'})});await first;
 console.log('PASS thanks-page control: plain/duplicate/malformed capability, paid request, no recipient field, pending retry, expired/uncertain stop, processing not success, offline recovery and double click; fetch stub only');
})().catch(error=>{console.error(error);process.exitCode=1;});
