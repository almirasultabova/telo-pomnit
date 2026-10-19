const fs=require('node:fs');
const allowed=new Set(['id','userId','clientId','createdAt','date','zone','sensations','note','streamId','syncStatus']);
const snapshot=r=>Object.keys(r).filter(k=>allowed.has(k)).sort().map(k=>[k,r[k]]);
const make=(i,note)=>({id:'server-'+i,userId:'A',clientId:'client-'+i,date:new Date(Date.UTC(2026,9,19,12)-i*86400000).toISOString(),zone:'chest',sensations:['tension'],note,syncStatus:'synced'});
const cases=[];
for(const[kind,note]of[['short','Учебное наблюдение. '.repeat(4)],['long','я'.repeat(20000)],['escaped','\\'.repeat(20000)]]){
 const rows=Array.from({length:1000},(_,i)=>make(i,note));let bytes=2;const kept=[];
 for(const row of rows){const copy={...row,_tpDiaryCacheAck:{v:1,owner:'A',fields:JSON.parse(JSON.stringify(snapshot(row)))}};const size=JSON.stringify(copy).length*2+(kept.length?2:0);if(kept.length>=90||bytes+size>512*1024)break;kept.push(copy);bytes+=size;}
 cases.push({kind,rows:1000,noteCodeUnits:note.length,beforeUtf16Bytes:JSON.stringify(rows).length*2,confirmedBudgetBytes:512*1024,maxConfirmedRows:90,afterUtf16Bytes:JSON.stringify(kept).length*2,retainedConfirmed:kept.length});
}
fs.writeFileSync(__dirname+'/measurement.json',JSON.stringify({cases,protectedRowsNeverBudgeted:true,estimate:'UTF-16 code units times2; actual quota tested separately in browser'},null,2));console.log(JSON.stringify(cases));
