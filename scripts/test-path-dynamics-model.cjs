const assert=require('node:assert/strict');
const {build}=require('../app/js/path-dynamics-model.js');
const start=Date.parse('2026-09-01T00:00:00+03:00'),end=Date.parse('2026-10-01T00:00:00+03:00');
const period={start,end,weeks:5},now=Date.parse('2026-09-24T10:00:00Z');
const row=(date,value,extra={})=>({date:date+'T10:00:00Z',tension:value,syncStatus:'synced',streamId:'own',...extra});
let checked=0;const test=(name,fn)=>{fn();checked++;console.log('PASS '+name);};
test('sorts actual dates, raw first/last stay separate from weekly means',()=>{
 const m=build([row('2026-09-23',4),row('2026-09-05',8),row('2026-09-02',7)],'tension',period,now,'own');
 assert.equal(m.first.tension,7);assert.equal(m.last.tension,4);assert.equal(m.difference,-3);assert.equal(m.weeks[0].value,7.5);assert.equal(m.weeks[0].count,2);
});
test('missing weeks remain null, future weeks distinct',()=>{
 const m=build([row('2026-09-02',7),row('2026-09-17',5)],'tension',period,now,'own');
 assert.equal(m.weeks[1].value,null);assert.equal(m.weeks[1].future,false);assert.equal(m.weeks[4].value,null);assert.equal(m.weeks[4].future,true);
});
test('empty, single point and equal endpoints have different comparison states',()=>{
 assert.equal(build([],'tension',period,now,'own').first,null);
 assert.equal(build([row('2026-09-02',7)],'tension',period,now,'own').difference,null);
 assert.equal(build([row('2026-09-02',7),row('2026-09-10',7)],'tension',period,now,'own').difference,0);
});
test('each scale uses its own raw values and may change in the opposite direction',()=>{
 const rows=[row('2026-09-02',7,{energy:3}),row('2026-09-10',4,{energy:6})];
 assert.equal(build(rows,'tension',period,now,'own').difference,-3);
 assert.equal(build(rows,'energy',period,now,'own').difference,3);
});
test('no inference from legacy averages, pending values or invalid scales',()=>{
 const rows=[row('2026-09-02',9,{legacyScale:true,bodyScore:6}),row('2026-09-03',8,{syncStatus:'pending'}),row('2026-09-04',0),row('2026-09-05',11),row('2026-09-06',2.5),row('2026-09-07',null)];
 const m=build(rows,'tension',period,now,'own');assert.equal(m.available.length,0);assert.equal(m.legacyCount,1);assert.equal(m.pendingCount,1);
});
test('outside period, foreign streams, invalid and future dates excluded',()=>{
 const rows=[row('2026-08-31',2),row('2026-10-01',3),row('2026-09-02',6,{streamId:'other'}),row('2026-09-29',8),{date:'invalid',tension:9},row('2026-09-02',4)];
 const m=build(rows,'tension',period,now,'own');assert.equal(m.available.length,1);assert.equal(m.first.tension,4);
});
test('week boundary uses the stream midnight in Moscow',()=>{
 const rows=[{date:'2026-09-07T20:59:59Z',tension:2},{date:'2026-09-07T21:00:00Z',tension:8}];
 const m=build(rows,'tension',period,now,'own');assert.equal(m.weeks[0].value,2);assert.equal(m.weeks[1].value,8);
});
test('today stays visible with small clock skew, next Moscow day is excluded',()=>{
 const m=build([{date:new Date(now+50).toISOString(),tension:7,syncStatus:'synced'},
 {date:'2026-09-24T21:00:00Z',tension:2,syncStatus:'synced'}],'tension',period,now,'own');
 assert.equal(m.available.length,1);assert.equal(m.first.tension,7);
});
console.log(checked+' model scenarios passed; no API or messages.');
