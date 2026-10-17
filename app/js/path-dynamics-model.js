/* Pure calculations for personal check-in history; no API or storage writes. */
(() => {
  const DAY=86400000;
  function build(rows,key,period,now,streamId) {
    // Entries are day-level observations. A confirmed entry from today must not
    // disappear when the client clock is a few milliseconds ahead of serverTime.
    const todayEnd=Math.floor((now+10800000)/DAY)*DAY-10800000+DAY;
    const scoped=rows.filter(r=>{
      const t=Date.parse(r.date||r.createdAt);
      return Number.isFinite(t)&&t>=period.start&&t<period.end&&t<todayEnd&&(!r.streamId||r.streamId===streamId);
    });
    const confirmed=scoped.filter(r=>!r.syncStatus||r.syncStatus==='synced');
    const available=confirmed.filter(r=>!r.legacyScale&&Number.isInteger(r[key])&&r[key]>=1&&r[key]<=10)
      .slice().sort((a,b)=>Date.parse(a.date||a.createdAt)-Date.parse(b.date||b.createdAt));
    const weeks=Array.from({length:period.weeks},(_,i)=>{
      const start=period.start+i*7*DAY,end=Math.min(start+7*DAY,period.end);
      const own=available.filter(r=>{const t=Date.parse(r.date||r.createdAt);return t>=start&&t<end;});
      return {index:i+1,start,end,count:own.length,value:own.length?Math.round(own.reduce((n,r)=>n+r[key],0)/own.length*10)/10:null,future:start>now};
    });
    const first=available[0]||null,last=available.at(-1)||null;
    return {available,weeks,first,last,difference:available.length>1?last[key]-first[key]:null,
      legacyCount:confirmed.filter(r=>r.legacyScale).length,pendingCount:scoped.length-confirmed.length};
  }
  const model={build};
  if(typeof module!=='undefined'&&module.exports)module.exports=model;
  else window.PathDynamicsModel=model;
})();
