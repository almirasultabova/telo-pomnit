/* J-APP-050: one-scale view; reads only the context supplied by the app. */
(() => {
  const meta={
    tension:{short:'Напряжение',explain:'Меньшее значение — меньше напряжения в теле.'},
    anxiety:{short:'Тревога',explain:'Меньшее значение — меньше отмеченной тревоги.'},
    energy:{short:'Энергия',explain:'Большее значение — больше энергии по вашей оценке.'},
    safety:{short:'Безопасность',explain:'Большее значение — сильнее ощущение безопасности.'},
    bodyContact:{short:'Контакт с телом',explain:'Большее значение — сильнее ощущается контакт с телом.'}
  };
  let selected='tension', selectionScope=null;
  function reset(){selected='tension';selectionScope=null;}
  const esc=escapeAccessText;
  const number=n=>n.toLocaleString('ru-RU',{maximumFractionDigits:1});
  const date=r=>new Date(r.date||r.createdAt).toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'short'});
  function chart(model,context) {
    const W=300,H=164,L=19,R=12,T=18,B=27;
    const x=i=>L+(i-1)/Math.max(1,model.weeks.length-1)*(W-L-R),y=v=>T+(10-v)/9*(H-T-B);
    let previous=null,lines='';
    for(const week of model.weeks){
      if(week.value===null){previous=null;continue;}
      if(previous)lines+=`<line class="pd-line" x1="${x(previous.index)}" y1="${y(previous.value)}" x2="${x(week.index)}" y2="${y(week.value)}"/>`;
      lines+=`<circle class="pd-dot" cx="${x(week.index)}" cy="${y(week.value)}" r="4.5"/><text class="pd-value" x="${x(week.index)}" y="${y(week.value)-10}" text-anchor="middle">${number(week.value)}</text>`;
      previous=week;
    }
    const grid=[1,5,10].map(v=>`<line class="pd-grid" x1="${L}" y1="${y(v)}" x2="${W-R}" y2="${y(v)}"/><text x="${L-6}" y="${y(v)+3}" text-anchor="end">${v}</text>`).join('');
    const labels=model.weeks.map(w=>`<text x="${x(w.index)}" y="${H-9}" text-anchor="middle">${w.index} нед.</text>`).join('');
    const description=model.weeks.map(w=>`${w.index} неделя: ${w.value===null?(w.future?'ещё впереди':'нет отметок'):number(w.value)+', отметок '+w.count}`).join('; ');
    return `<svg class="pd-chart" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="pd-chart-title pd-chart-desc"><title id="pd-chart-title">${esc(context.scales.find(s=>s.key===selected).label)}: средние по неделям</title><desc id="pd-chart-desc">${esc(description)}</desc>${grid}${lines}${labels}</svg>`;
  }
  function panel(context) {
    const scale=context.scales.find(s=>s.key===selected),period=context.period;
    const loadState=context.loadState;
    const failed=loadState==='failed';
    const model=PathDynamicsModel.build(context.rows,selected,period,context.now,context.stream.id);
    const heading=`<h3>${esc(scale.label)}</h3><p class="pd-meaning"><span>1 — ${esc(scale.low)}</span><span>10 — ${esc(scale.high)}</span></p>`;
    if(loadState==='loading'||loadState==='idle')return heading+'<div class="pd-state" role="status"><strong>Загружаем ваши отметки</strong><p>Здесь появятся сохранённые оценки выбранной шкалы.</p></div>';
    if(failed)return heading+'<div class="pd-state" role="status"><strong>Не удалось загрузить отметки</strong><p>Проверьте соединение и попробуйте ещё раз. Это не означает, что ваши записи исчезли.</p><button type="button" class="pd-primary" data-pd-retry>Повторить загрузку</button></div>';
    const pending=model.pendingCount?'<div class="pd-pending" role="status"><p>Есть отметки, ещё не подтверждённые сервером. В графике только подтверждённые значения.</p><button type="button" class="pd-primary" data-pd-sync>Повторить отправку</button></div>':'';
    if(!model.available.length&&model.pendingCount)return heading+'<div class="pd-state"><strong>Отметки ожидают отправки</strong><p>Они появятся на графике после подтверждения сервера. До этого их можно проверить в трекере.</p><button type="button" class="pd-primary" data-pd-checkin>Открыть трекер</button></div>'+pending;
    if(!model.available.length)return heading+`<div class="pd-state"><strong>${model.legacyCount?'Для этой шкалы пока нет значений':'Здесь появятся ваши отметки'}</strong><p>${model.legacyCount?'В прежних записях есть только общая оценка. Значения отдельных шкал из неё восстановить нельзя.':'Начните с того, как вы чувствуете себя сейчас. После первой отметки здесь появится точка, а затем можно будет увидеть изменения.'}</p><div class="pd-empty-rule" aria-hidden="true"></div><button type="button" class="pd-primary" data-pd-checkin>Отметить состояние</button></div>`;
    const gaps=model.weeks.some(w=>w.value===null&&!w.future);
    const note=`Точка — среднее за неделю.${gaps?' Недели без отметок не соединяются.':''}${model.weeks.some(w=>w.future)?' Будущие недели пока пусты.':''}`;
    const one=model.available.length===1;
    const comparison=one?'<p class="pd-delta">Пока одна отметка</p><p class="pd-explanation">После следующей можно будет сравнить значения. По одной точке изменение не определяется.</p>':
      `<div class="pd-comparison"><div><p>Первая отметка</p><strong>${model.first[selected]} из 10</strong><time>${date(model.first)}</time></div><div><p>Последняя отметка</p><strong>${model.last[selected]} из 10</strong><time>${date(model.last)}</time></div></div><p class="pd-delta">${model.difference===0?'Значение не изменилось':`На ${Math.abs(model.difference)} ${Math.abs(model.difference)===1?'пункт':Math.abs(model.difference)<5?'пункта':'пунктов'} ${model.difference>0?'выше':'ниже'}`}</p><p class="pd-explanation">${meta[selected].explain}</p>`;
    const table=`<details class="pd-details"><summary>Посмотреть исходные отметки</summary><table><caption>Ваши отдельные оценки, без усреднения</caption><thead><tr><th scope="col">Дата</th><th scope="col">Оценка</th></tr></thead><tbody>${model.available.map(r=>`<tr><td>${date(r)}</td><td>${r[selected]} из 10</td></tr>`).join('')}</tbody></table></details>`;
    return heading+chart(model,context)+`<p class="pd-chart-note">${note}</p>`+comparison+pending+table;
  }
  function render(context) {
    if(selectionScope!==context.scope){reset();selectionScope=context.scope;}
    if(!context.allowed||!context.period)return '';
    const period=context.period;
    const range=d=>new Date(d).toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'long'});
    return `<section class="path-dynamics" aria-labelledby="pd-title"><h2 id="pd-title">Динамика состояния</h2><p class="pd-period">${esc(context.stream.name)} · ${range(period.start)} — ${range(period.end-1)}</p><div class="pd-tabs" role="tablist" aria-label="Выберите шкалу">${context.scales.map(s=>`<button type="button" role="tab" class="pd-tab" id="pd-tab-${s.key}" data-pd-scale="${s.key}" aria-selected="${s.key===selected}" aria-controls="pd-panel" tabindex="${s.key===selected?0:-1}">${meta[s.key].short}</button>`).join('')}</div><div class="pd-panel" id="pd-panel" role="tabpanel" aria-labelledby="pd-tab-${selected}">${panel(context)}</div></section>`;
  }
  function bind(container,actions) {
    const component=container.querySelector('.path-dynamics');
    if(!component)return;
    const initialScope=actions.context().scope;
    const current=()=>{const context=actions.context();return context.allowed&&context.scope===initialScope;};
    function choose(key){
      if(!meta[key]||!current())return;
      selected=key;
      const context=actions.context();
      component.outerHTML=render(context);
      bind(container,actions);
      container.querySelector('#pd-tab-'+key)?.focus({preventScroll:true});
    }
    component.onclick=event=>{
      if(!current())return;
      const tab=event.target.closest('[data-pd-scale]');
      if(tab){choose(tab.dataset.pdScale);return;}
      if(event.target.closest('[data-pd-checkin]'))actions.checkin();
      if(event.target.closest('[data-pd-retry]'))actions.retry(event.target.closest('button'));
      if(event.target.closest('[data-pd-sync]'))actions.sync(event.target.closest('button'));
    };
    component.onkeydown=event=>{
      if(!event.target.closest('[data-pd-scale]')||!current())return;
      const keys=actions.context().scales.map(s=>s.key),i=keys.indexOf(selected);
      const j=event.key==='ArrowRight'?(i+1)%keys.length:event.key==='ArrowLeft'?(i+keys.length-1)%keys.length:event.key==='Home'?0:event.key==='End'?keys.length-1:null;
      if(j!==null){event.preventDefault();choose(keys[j]);}
    };
  }
  window.PathDynamics={render,bind,reset};
})();
