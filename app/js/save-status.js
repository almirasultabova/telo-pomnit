// Current-owner local observations only. Reading this screen never submits drafts.
(() => {
  'use strict';
  const BODY = 'body-observation-v1', CHECKIN = 'checkin';
  const scales = [['tension','Напряжение в теле'],['anxiety','Тревога'],['energy','Энергия'],['safety','Безопасность'],['bodyContact','Контакт с телом']];
  let screen, content, home, epoch = 0, busy = false, copySequence = 0;
  const identity = () => Api.isAuthed() && !Api.clubBlocked && Api.userId && String(Api.userId) === Storage._userId
    ? Storage._userId + ':' + Storage._generation + ':' + Api._authGeneration : null;
  const session = () => ({ owner: identity(), epoch });
  const valid = token => token.owner && token.owner === identity() && token.epoch === epoch;
  const node = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el; };
  function button(text, action, cls = 'btn btn--outline') {
    const el = node('button', cls, text); el.type = 'button'; el.onclick = action; return el;
  }
  function disk(name) {
    try { return JSON.parse(window.localStorage.getItem(Storage.key(name)) || 'null'); } catch { return null; }
  }
  function payload(row, kind) {
    const keys = kind === 'diary' ? ['clientId','date','zone','sensations','note'] : ['dayKey','date','clientUpdatedAt',...scales.map(([key])=>key),'note'];
    return JSON.stringify(keys.map(key => [key, row[key] ?? null]));
  }
  function collect() {
    if (!identity()) return { rows: [], drafts: [] };
    const rows = [], drafts = [];
    for (const [kind, entries, key] of [['diary',Storage.getDiaryEntries(),'diary_v2'],['checkins',Storage.getCheckins(),'checkins_v2']]) {
      const durable = disk(key);
      entries.forEach((row,index) => {
        if (row.syncStatus === 'synced' || (kind === 'checkins' && row.legacyScale)) return;
        const id = String(kind === 'diary' ? row.clientId || row.id || index : row.dayKey || row.id || index);
        const local = row.syncStatus !== 'memory-only' && Array.isArray(durable) && durable.some(item => item && typeof item === 'object' && payload(item,kind) === payload(row,kind));
        rows.push({ key: kind + ':' + id, kind, row, local });
      });
    }
    const prefix = Storage.key('form_draft_v1:');
    const scopes = new Set([BODY,CHECKIN,...(AppLocalStorage.keys?.(prefix) || []).map(name=>name.slice(prefix.length)).filter(scope=>scope.startsWith(BODY+':repair:'))]);
    for (const scope of scopes) {
      const row = Storage.getFormDraft(scope);
      if (!row || row.version !== 1) continue;
      const kind = scope === CHECKIN ? 'checkins' : 'diary';
      if (kind === 'diary' && !row.note && !row.zone && !row.sensations?.length) continue;
      drafts.push({ key: 'draft:' + scope, scope, kind, row, local: JSON.stringify(disk('form_draft_v1:' + scope)) === JSON.stringify(row) });
    }
    rows.sort((a,b) => Date.parse(b.row.date || b.row.createdAt || 0) - Date.parse(a.row.date || a.row.createdAt || 0));
    return { rows, drafts };
  }
  function renderHome() {
    if (!home) return;
    const data = collect(); home.replaceChildren(); home.hidden = !identity() || !(data.rows.length || data.drafts.length);
    if (home.hidden) return;
    const urgent = [...data.rows,...data.drafts].some(item=>!item.local);
    home.dataset.state = urgent ? 'temporary' : data.rows.length ? 'pending' : 'draft';
    const heading = node('p','ss-home-title',urgent ? 'Есть текст только в открытом приложении' : data.rows.length ? 'Есть записи, которые ждут отправки' : 'Есть незаконченные черновики');
    const details = [];
    if (data.rows.length) details.push('Ждут отправки: ' + data.rows.length + '.');
    if (data.drafts.length) details.push('Черновики: ' + data.drafts.length + '. Они не отправляются сами.');
    if (urgent) details.push('Пока не закрывайте приложение.');
    home.append(heading,node('p','ss-copy',details.join(' ')),button('Проверить записи',open,'ss-link'));
  }
  function textFor(item) {
    const row = item.row, lines = [item.scope ? 'Черновик' : 'Запись',item.kind === 'diary' ? 'Наблюдение за телом' : 'Отметка состояния'];
    const date = row.date || row.createdAt;
    if (Number.isFinite(Date.parse(date))) lines.push(new Date(date).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'}) + ' · МСК');
    if (item.kind === 'diary') {
      const zone = DATA.zones.find(value=>value.id===row.zone); if (row.zone) lines.push('Область тела: ' + (zone?.label || zone?.name || row.zone));
      if (Array.isArray(row.sensations) && row.sensations.length) lines.push('Ощущения: ' + row.sensations.map(id=>DATA.sensations.find(value=>value.id===id)?.label || DATA.sensations.find(value=>value.id===id)?.name || id).join(', '));
    } else for (const [key,label] of scales) if (Number.isInteger(row[key])) lines.push(label + ': ' + row[key] + '/10');
    if (typeof row.note === 'string' && row.note) lines.push('',row.note);
    return lines.join('\n');
  }
  function latest(key) { const data=collect(); return [...data.rows,...data.drafts].find(item=>item.key===key); }
  async function copy(key, area) {
    const token=session(), item=latest(key); if (!valid(token) || !item) return;
    const text=textFor(item); area.replaceChildren();
    try {
      if (!navigator.clipboard?.writeText) throw new Error('CLIPBOARD_UNAVAILABLE');
      await navigator.clipboard.writeText(text);
      if (valid(token) && area.isConnected) area.append(node('p','ss-copy-result','Скопировано. Теперь можно вставить текст в заметки.'));
    } catch {
      if (!valid(token) || !area.isConnected) return;
      area.append(node('p','ss-copy-result','Не получилось скопировать автоматически. Выделите текст и выберите «Копировать».'));
      const label=node('label','ss-copy-label','Текст для копирования'), field=node('textarea','ss-copy-field');
      field.id='ss-copy-text-'+(++copySequence); label.htmlFor=field.id; field.value=text; field.readOnly=true;
      area.append(label,field,button('Выделить текст',()=>{if(valid(token)){field.focus();field.select();field.setSelectionRange(0,field.value.length);}},'ss-link'));
      field.focus(); field.select();
    }
  }
  function resume(item) {
    if (!identity() || !latest(item.key)) return;
    if (item.kind === 'diary') startDiaryEntry(item.scope.startsWith(BODY+':repair:') ? item.scope.slice((BODY+':repair:').length) : null);
    else { renderCheckinScales(); renderCheckinSyncStatus(); goTo('checkin'); }
  }
  function record(item) {
    const row=item.row, article=node('article','ss-record'); article.dataset.key=item.key;
    article.append(node('h3','ss-record-title',item.kind==='diary'?'Наблюдение за телом':'Отметка состояния'));
    const date=row.date||row.createdAt;
    if(Number.isFinite(Date.parse(date))) article.append(node('p','ss-date',new Date(date).toLocaleString('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})+' · МСК'));
    const status=item.scope ? item.local ? 'Черновик сохранён на этом устройстве. Он не отправляется сам.' : 'Черновик пока только в открытом приложении. Не закрывайте его до сохранения.'
      : item.local ? 'Сохранено на этом устройстве. Ждёт отправки.' : 'Пока только в открытом приложении. Не закрывайте его до сохранения или скопируйте текст.';
    article.dataset.storage=item.local?'device':'temporary'; article.append(node('p','ss-record-status',status));
    if(row.retryBlocked) article.append(node('p','ss-blocked','Отправка этой записи остановлена. Сохраните копию и проверьте запись перед повтором.'));
    if(item.kind==='checkins') {
      const values=node('dl','ss-values');
      for(const[key,label]of scales)if(Number.isInteger(row[key]))values.append(node('dt','',label),node('dd','',row[key]+'/10'));
      article.append(values);
    }
    if(row.note) article.append(node('p','ss-preview',String(row.note).slice(0,160)+(String(row.note).length>160?'…':'')));
    const actions=node('div','ss-actions'), result=node('div','ss-copy-output'); result.setAttribute('role','status');
    actions.append(button('Скопировать',()=>copy(item.key,result),'ss-link'));
    if(item.scope) actions.prepend(button('Продолжить',()=>resume(item),'ss-link'));
    else if(item.kind==='diary'&&row.retryBlocked&&[400,422].includes(row.rejectedStatus)&&row.clientId) actions.append(button('Исправить запись',()=>{if(identity())startDiaryEntry(row.clientId);},'ss-link'));
    article.append(actions,result); return article;
  }
  async function retry() {
    const token=session(); if(!valid(token)||busy)return;
    const data=collect(); busy=true;render();
    try {
      const tasks=[];
      for(const[kind,method]of[['diary','flushPending'],['checkins','flushCheckinsPending']])if(valid(token)&&data.rows.some(item=>item.kind===kind&&!item.row.retryBlocked))tasks.push(Storage[method]());
      await Promise.allSettled(tasks);
    } finally { if(valid(token)){busy=false;render();renderHome();} }
  }
  function render() {
    if(!content)return;
    if(!identity()){invalidate();return;}
    const data=collect(), active=document.activeElement, focused=content.contains(active), focusKey=active?.closest('[data-key]')?.dataset.key, focusLabel=active?.textContent;
    content.replaceChildren();
    const count=node('p','ss-summary',data.rows.length?'Ждут отправки: '+data.rows.length+'.':'Нет записей, ожидающих отправки.'); count.setAttribute('role','status');content.append(count);
    content.append(node('p','ss-copy','Здесь только записи дневника и оценки состояния с этого устройства. Черновики показаны отдельно.'));
    if(data.rows.some(item=>!item.row.retryBlocked)) {
      const send=button(busy?'Отправляем…':'Повторить отправку',retry,'btn btn--primary btn--full');send.id='ss-retry';send.disabled=busy;content.append(send);
    }
    if(data.rows.length) {content.append(node('h2','ss-section-title','Записи'));for(const item of data.rows)content.append(record(item));}
    if(data.drafts.length) {content.append(node('h2','ss-section-title','Черновики'));for(const item of data.drafts)content.append(record(item));}
    if(focused){const article=[...content.querySelectorAll('[data-key]')].find(el=>el.dataset.key===focusKey);const target=[...(article||content).querySelectorAll('button')].find(el=>el.textContent===focusLabel);if(!target)count.tabIndex=-1;(target||count).focus({preventScroll:true});}
  }
  function open() {if(!identity())return;render();goTo('save-status');}
  function invalidate() {
    epoch++;busy=false;
    content?.replaceChildren(); if(home){home.replaceChildren();home.hidden=true;}
  }
  document.addEventListener('DOMContentLoaded',()=>{
    const parent=document.querySelector('#tab-main .home-continuation');
    if(parent){home=node('aside','ss-home');home.id='home-save-status';home.setAttribute('aria-live','polite');home.hidden=true;parent.querySelector('.home-section-head')?.after(home);}
    screen=node('div','screen');screen.id='screen-save-status';
    const header=node('div','screen-header'),title=node('div','screen-title','Сохранение записей');
    header.append(title,button('Назад',()=>{if(identity())goBack();},'screen-header-btn'));content=node('div','screen-scroll ss-content');screen.append(header,content);
    document.getElementById('screen-home').parentElement.append(screen);screen.inert=true;screen.setAttribute('aria-hidden','true');
    Storage.subscribe(()=>{renderHome();if(currentScreen==='save-status')render();});
    let wasActive=false;
    new MutationObserver(()=>{const active=screen.classList.contains('screen--active');if(active&&!wasActive)render();else if(!active)content.replaceChildren();wasActive=active;}).observe(screen,{attributes:true,attributeFilter:['class']});
    renderHome();
  });
  window.SaveStatus={renderHome,open,invalidate};
})();
