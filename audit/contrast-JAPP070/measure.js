() => {
 const rgba=s=>{const a=s.match(/[\d.]+/g)?.map(Number);return a&&a.length>=3?[a[0],a[1],a[2],a[3]??1]:[0,0,0,0]};
 const over=(f,b)=>{const a=f[3]+b[3]*(1-f[3]);return [...f.slice(0,3).map((v,i)=>(v*f[3]+b[i]*b[3]*(1-f[3]))/(a||1)),a]};
 const lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
 const ratio=(a,b)=>{const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
 const label=el=>el.id?'#'+el.id:el.tagName.toLowerCase()+[...el.classList].slice(0,3).map(c=>'.'+c).join('');
 const visible=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&!el.closest('[hidden],[inert]')};
 function background(el){let color=[255,255,255,1],images=[],chain=[];for(let n=el;n;n=n.parentElement)chain.unshift(n);for(const n of chain){const s=getComputedStyle(n);color=over(rgba(s.backgroundColor),color);if(s.backgroundImage!=='none')images.push(label(n));}return {color,images};}
 const texts=[],controls=[];
 const active=document.querySelector('.screen--active');
 for(const el of (active||document.body).querySelectorAll('*')){
  if(!visible(el)||el.closest('svg,script,style'))continue;
  const s=getComputedStyle(el),text=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim();
  const bg=background(el);let opacity=1;for(let n=el;n;n=n.parentElement)opacity*=+getComputedStyle(n).opacity;
  if(text){const fg=rgba(s.color);fg[3]*=opacity;const color=over(fg,bg.color),large=parseFloat(s.fontSize)>=24||(parseFloat(s.fontSize)>=18.6667&&+s.fontWeight>=700),r=ratio(color,bg.color);
   texts.push({selector:label(el),text:text.slice(0,90),color:s.color,background:bg.color,opacity,size:s.fontSize,weight:s.fontWeight,ratio:r,required:large?3:4.5,images:bg.images,disabled:!!el.closest(':disabled'),pass:r>=(large?3:4.5)});
  }
  if(el.matches('input:not([type=hidden]),textarea,select,.q-option,.q-scale-btn,.pd-tab,.fb-star,.fb-rate-btn,.slider')){
   const fg=rgba(s.color);const border=rgba(s.borderTopColor),outer=background(el.parentElement);let r=ratio(over(border,outer.color),outer.color);
   controls.push({selector:label(el),type:el.type||'',text:(el.value||el.textContent||'').slice(0,40),color:s.color,border:s.borderTopColor,borderStyle:s.borderTopStyle,background:s.backgroundColor,outer:outer.color,borderRatio:r,fillRatio:ratio(bg.color,outer.color),images:bg.images,checked:el.checked||el.getAttribute('aria-pressed')==='true'||el.getAttribute('aria-selected')==='true',disabled:el.disabled,outline:s.outline,shadow:s.boxShadow});
   if(el.placeholder){const ps=getComputedStyle(el,'::placeholder'),pc=rgba(ps.color);pc[3]*=+ps.opacity*opacity;const r=ratio(over(pc,bg.color),bg.color);texts.push({selector:label(el)+'::placeholder',text:el.placeholder,color:ps.color,background:bg.color,opacity:+ps.opacity*opacity,size:ps.fontSize,ratio:r,required:4.5,pass:r>=4.5,images:bg.images,disabled:el.disabled});}
  }
 }
 return{title:document.querySelector('.screen--active')?.id,texts,controls,overflow:document.documentElement.scrollWidth>innerWidth};
}
