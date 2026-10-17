// Approved participant questionnaire cycle. Server records are bound to owner and selected stream.
(() => {

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date = value => value ? new Date(value).toLocaleDateString('ru-RU', {timeZone:'Europe/Moscow'}) : '';
  let record = null, formIdentity = null;
  const isCurrent = id => id && !Api.clubBlocked && Api.isAuthed() &&
    Api.userId === id.owner && Api._authGeneration === id.generation &&
    Storage._generation === id.storageGeneration && selectedProgramId === id.streamId;
  const source = () => isCurrent(record) ? {pre:record.pre, post:record.post, stream:currentProgram()} : {pre:null,post:null,stream:null};
  function invalidate() {
    navigation++; record = null; formIdentity = null; answers = {}; step = 0; sending = false;
    for (const id of ['post-body','post-thanks-body','comparison-body']) document.getElementById(id)?.replaceChildren();
    const preBody = document.getElementById('questionnaire-body');
    if (preBody?.querySelector('.q-completion') && (!qFormIdentity || qFormIdentity.owner !== Api.userId ||
      qFormIdentity.generation !== Api._authGeneration || qFormIdentity.streamId !== selectedProgramId)) preBody.replaceChildren();
  }
  function setStatus(streamId, status) {
    record = {owner:Api.userId,generation:Api._authGeneration,storageGeneration:Storage._generation,streamId,
      pre:status.pre || null,post:status.post || null};
  }
  function setPre(pre) { if (isCurrent(record)) record.pre = pre; }
  function saveDraft() {
    if (!isCurrent(formIdentity) || sending || record?.post) return;
    const durable=Storage.saveFormDraft('questionnaire:post:'+formIdentity.streamId,{version:2,step,answers});
    const notice=document.getElementById('post-draft-warning');
    if (notice) notice.hidden=durable;
  }
  function leaving(screen) { if (screen === 'post-questionnaire') {capture();saveDraft();if (sending) {navigation++;sending=false;}} }
  window.QuestionnaireCycle={invalidate,setStatus,setPre,refreshEntries,leaving,
    getPostState:()=>{const current=source();return !Api.isClubAdmin && Api.userRole!=='HOST' && current.stream?.phase==='completed' ? {streamId:current.stream.id,done:Boolean(current.post)} : null;},
    openSummary:()=>{if(source().post)showComparison();else openPost();}
  };
  const initial = () => source().pre?.answers || {};
  let answers = {}, step = 0, sending = false, navigation = 0, emptyConfirmed = false;
  const formats = [['benefit_group','Психосоматические разборы'],['benefit_body','Телесные практики на встречах'],
    ['benefit_recordings','Записи встреч'],['benefit_practice','Самостоятельная практика между встречами'],['benefit_app','Приложение']];
  const usefulness = ['Много полезного','Что-то полезное','Не заметила пользы','Трудно оценить','Не участвовала / не использовала'];
  const changes = ['Стало заметно легче','Стало немного легче','Примерно так же','Стало немного труднее','Стало заметно труднее','Изменения разные — одной оценкой не описать','Не могу сравнить'];
  const matches = ['В основном соответствует','Частично соответствует','Пока не соответствует','За это время для меня стало важным другое','Не могу оценить'];
  const nextSteps = ['Продолжать самостоятельно','Продолжить работу в группе','Рассмотреть индивидуальную работу','Пока не знаю','Сейчас не хочу продолжать'];
  const notUsed = 'Не участвовала / не использовала';
  const fields = [
    ['bodyContactScale','Насколько вы чувствуете контакт с телом?'],['anxietyScale','Уровень тревоги в обычный день'],
    ['currentSituation','Что сейчас происходит с тем, с чем вы пришли в программу?'],
    ['situationChange','Если сравнить с началом программы, как изменилась эта ситуация?'],
    ['lifeExample','Вспомните одну ситуацию из последних дней, которая показывает, как у вас сейчас'],
    ['criterionMatch','Насколько то, что вы описали тогда, соответствует вашему опыту сейчас?'],
    ['criterionComment','Что важно добавить к этому ответу?'], ...formats,
    ['formatComment','Что из этого было особенно важным — или, наоборот, не подошло?'],
    ['appBarrier','Что мешало пользоваться приложением?'],['difficulties','Было ли в программе что-то, что вам не подошло или мешало участвовать?'],
    ['difficultyComment','Что именно?'],['improvements','Что вы предложили бы сохранить или изменить для следующих участниц?'],
    ['nextStep','Какой следующий шаг вам сейчас ближе?']
  ];
  const steps = () => ['state','request','life', ...(initial().successMeans ? ['criterion'] : []), 'experience','improve','next','review'];
  const labels = {state:'Ваше состояние сейчас',request:'Ваш исходный запрос',life:'В повседневной жизни',
    criterion:'Что было важно',experience:'Опыт программы',improve:'Что стоит изменить',next:'После потока',review:'Проверьте ответы'};
  function input(id, label, hint = '') {
    return `<div class="q-field"><label class="q-label" for="post-${id}">${esc(label)}</label>${hint ? `<p class="q-field-hint">${esc(hint)}</p>` : ''}<textarea class="q-textarea" id="post-${id}" data-answer="${id}" maxlength="4000" rows="4">${esc(answers[id])}</textarea></div>`;
  }
  function radios(id, label, options) {
    return `<fieldset class="q-field cycle-fieldset"><legend class="q-label">${esc(label)}</legend><div class="q-options">${options.map(option => `<label class="q-option"><input type="radio" name="post-${id}" data-answer="${id}" value="${esc(option)}" ${answers[id] === option ? 'checked' : ''}><span class="q-option-label">${esc(option)}</span></label>`).join('')}</div></fieldset>`;
  }
  function scale(id, label, hint) {
    return `<div class="q-field"><div class="q-label" id="post-label-${id}">${esc(label)}</div><p class="q-field-hint">${esc(hint)}</p><div class="q-scale" role="group" aria-labelledby="post-label-${id}">${Array.from({length:10},(_,i)=>i+1).map(value=>`<button type="button" class="q-scale-btn ${answers[id] === value ? 'q-scale-btn--active' : ''}" data-scale="${id}" data-value="${value}" aria-pressed="${answers[id] === value}">${value}</button>`).join('')}</div><button type="button" class="cycle-skip ${answers[id] === null ? 'cycle-skip--selected' : ''}" data-scale="${id}" data-value="unknown" aria-pressed="${answers[id] === null}">Не могу оценить</button></div>`;
  }
  function originalWords(key, missing) {
    const pre = source().pre;
    return pre?.answers?.[key] ? `<div class="cycle-original"><p>В начале · ${esc(date(pre.submittedAt || pre.createdAt))}</p><blockquote>${esc(pre.answers[key])}</blockquote></div>` : `<p class="cycle-empty">${esc(missing)}</p>`;
  }
  function select(id, label, options) {
    return `<div class="q-field"><label class="q-label" for="post-${id}">${esc(label)}</label><select class="q-input cycle-select" id="post-${id}" data-answer="${id}"><option value="">Выберите ответ или пропустите</option>${options.map(value=>`<option ${answers[id] === value ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></div>`;
  }
  const response = value => value === null ? 'Не могу оценить' : value === undefined || value === '' ? 'Ответ пропущен' : String(value);
  function reviewRows(data) {
    return fields.filter(([id]) => !(id.startsWith('criterion') && !initial().successMeans) &&
      !(id === 'difficultyComment' && data.difficulties !== 'Да') && !(id === 'appBarrier' && data.benefit_app !== notUsed))
      .map(([id,label]) => `<div class="cycle-review-row"><dt>${esc(label)}</dt><dd>${esc(response(data[id]))}</dd></div>`).join('');
  }
  function hasResponses(data = answers) {
    return fields.some(([id]) => data[id] === null ||
      (typeof data[id] === 'string' && data[id].trim().length > 0) ||
      (Number.isInteger(data[id]) && data[id] >= 1 && data[id] <= 10));
  }
  function emptyWarning() {
    return hasResponses() ? '' : `<section class="cycle-empty-confirm" aria-labelledby="post-empty-title"><h2 id="post-empty-title">В анкете пока нет ответов</h2><p>Можно вернуться к вопросам или отправить пустую анкету. После отправки добавить ответы будет нельзя.</p><button class="cycle-skip" type="button" id="post-empty-return">Вернуться к вопросам</button><label class="cycle-empty-choice"><input type="checkbox" id="post-empty-confirm"><span>Я хочу отправить анкету без ответов</span></label></section>`;
  }
  function stageContent(kind) {
    if (kind === 'state') return `<p class="cycle-guidance">Оцените своё состояние сейчас. Можно пропустить любой вопрос.</p>${scale('bodyContactScale',fields[0][1],'1 — совсем не чувствую, 10 — в полном контакте')}${scale('anxietyScale',fields[1][1],'1 — спокойно, 10 — постоянно тревожно')}`;
    if (kind === 'request') return originalWords('currentSituation','В начальной анкете исходный запрос не был записан.') + input('currentSituation',fields[2][1]) + radios('situationChange',fields[3][1],changes);
    if (kind === 'life') return input('lifeExample',fields[4][1],'Что произошло и как вы ответили на это? Можно описать то, что изменилось, или то, что осталось прежним.');
    if (kind === 'criterion') return originalWords('successMeans','Исходный критерий не был записан.') + radios('criterionMatch',fields[5][1],matches) + input('criterionComment',fields[6][1]);
    if (kind === 'experience') return `<p class="cycle-guidance">Какую пользу вы получили от этих частей программы?</p>` + formats.map(([id,label])=>select(id,label,usefulness)).join('') + input('formatComment','Что из этого было для вас особенно важным — или, наоборот, не подошло?') + `<div id="post-app-barrier" ${answers.benefit_app === notUsed ? '' : 'hidden'}>${select('appBarrier','Что мешало пользоваться приложением?',['Не было потребности','Было неудобно','Не работало','Не понимала, зачем оно','Другое'])}</div>`;
    if (kind === 'improve') return radios('difficulties','Было ли в программе что-то, что вам не подошло или мешало участвовать?',['Да','Нет','Не уверена']) + `<div id="post-difficulty-detail" ${answers.difficulties === 'Да' ? '' : 'hidden'}>${input('difficultyComment','Что именно?')}</div>` + input('improvements','Что вы предложили бы сохранить или изменить для следующих участниц?');
    if (kind === 'next') return radios('nextStep',fields.at(-1)[1],nextSteps);
    return `<p class="cycle-guidance">Проверьте ответы перед отправкой. Личный дневник к анкете не добавляется.</p>${emptyWarning()}<dl class="cycle-review">${reviewRows(answers)}</dl><p class="cycle-error" id="post-error" role="alert" hidden></p>`;
  }
  function capture() {
    if (!isCurrent(formIdentity)) return;
    document.querySelectorAll('#post-body [data-answer]').forEach(element => {
      if (element.type === 'radio' && !element.checked) return;
      answers[element.dataset.answer] = element.value;
    });
    if (answers.difficulties !== 'Да') delete answers.difficultyComment;
    if (answers.benefit_app !== notUsed) delete answers.appBarrier;
    saveDraft();
  }
  function draw() {
    if (!isCurrent(formIdentity)) return;
    const list = steps();
    step = Math.min(step,list.length-1);
    const kind = list[step];
    document.getElementById('post-body').innerHTML = `<div class="q-form-intro"><h1 class="q-block-title" tabindex="-1">${labels[kind]}</h1></div>${stageContent(kind)}`;
    document.getElementById('post-progress-label').textContent = `Блок ${step+1} из ${list.length}`;
    document.getElementById('post-progress-fill').style.width = `${(step+1)/list.length*100}%`;
    document.getElementById('post-back').hidden = step === 0;
    const button = document.getElementById('post-next');
    button.textContent = kind === 'review' ? 'Отправить анкету' : kind === 'next' ? 'Проверить ответы' : 'Далее';
    emptyConfirmed = false;
    button.disabled = sending || (kind === 'review' && !hasResponses());
    document.getElementById('post-body').scrollTop = 0;
    document.getElementById('post-body').insertAdjacentHTML('beforeend','<p class="cycle-guidance" id="post-draft-warning" role="status" hidden>Черновик доступен только в открытом приложении. Память устройства недоступна; сохраните анкету перед закрытием.</p>');
    saveDraft();
  }
  function home() { capture(); navigation++; sending = false; goTo('home'); refreshEntries(); }
  function openPost() {
    if (!isCurrent(record) || source().stream?.phase !== 'completed') return;
    if (source().post) { showComparison(); return; }
    formIdentity={...record};
    const draft=Storage.getFormDraft('questionnaire:post:'+record.streamId);
    answers=draft?.version===2 && draft.answers && typeof draft.answers==='object' && !Array.isArray(draft.answers) ? draft.answers : {};
    step=draft?.version===2 && Number.isInteger(draft.step) ? Math.max(0,Math.min(draft.step,steps().length-1)) : 0;
    closeQInvite(); draw(); goTo('post-questionnaire');
  }
  function completionMarkup(post) {
    return `<div class="q-completion"><img class="completion-photo" src="/media/app/redesign/home-portrait-r01.webp" alt=""><div class="completion-shade"></div><div class="completion-brand" aria-label="Тело помнит">Тело<br>помнит</div><div class="completion-content"><h1 tabindex="-1">Спасибо</h1><p>${post ? hasResponses(source().post?.answers || {}) ? 'Вы сохранили свой опыт программы. Можно вернуться к тому, с чем вы пришли, и посмотреть, что происходит сейчас.' : 'Анкета отправлена без ответов. Можно вернуться в приложение.' : 'Анкета заполнена. Ваш запрос и ожидания сохранены — к ним можно вернуться в конце программы.'}</p></div></div>`;
  }
  function showThanks() {
    if (!isCurrent(record) || !record.post) return;
    document.getElementById('post-thanks-body').innerHTML = completionMarkup(true);
    goTo('post-thanks', true);
    document.querySelector('#post-thanks-body h1')?.focus({preventScroll:true});
  }
  function pair(label, before, after) {
    return `<section class="cycle-pair"><h2>${esc(label)}</h2><div class="cycle-words"><div><p class="cycle-moment">В начале</p><p>${esc(before || 'Ответ не был записан')}</p></div><div><p class="cycle-moment">Сейчас</p><p>${esc(after || 'Ответ пропущен')}</p></div></div></section>`;
  }
  function rating(id,label,hint) {
    const pre = initial()[id], post = source().post?.answers?.[id];
    const valid = value => Number.isInteger(value) && value >= 1 && value <= 10;
    return `<section class="cycle-rating"><h2>${esc(label)}</h2><p class="cycle-rating-hint">${esc(hint)}</p><div class="cycle-rating-values"><div><span>В начале</span><strong>${valid(pre) ? pre : '—'}</strong><small>${valid(pre) ? 'из 10' : 'Нет оценки'}</small></div><span class="cycle-connector" aria-hidden="true"></span><div><span>Сейчас</span><strong>${valid(post) ? post : '—'}</strong><small>${valid(post) ? 'из 10' : post === null ? 'Не могу оценить' : 'Ответ пропущен'}</small></div></div>${valid(pre) && valid(post) ? '' : '<p class="cycle-empty">Для сравнения нужны обе оценки.</p>'}</section>`;
  }
  function showComparison() {
    if (!isCurrent(record) || !record.post) return;
    const current = source();
    const post = current.post?.answers || {};
    const pre = current.pre?.answers || {};
    const body = document.getElementById('comparison-body');
    body.innerHTML = `<div class="cycle-comparison-hero"><h1 tabindex="-1">Мой путь</h1><p>С чем я пришла и что замечаю сейчас</p><small>${current.pre ? esc(date(current.pre.submittedAt || current.pre.createdAt)) : ''}${current.post ? ' — '+esc(date(current.post.submittedAt || current.post.createdAt)) : ''}</small></div>${!current.pre ? '<p class="cycle-empty cycle-empty--prominent">Начальная анкета не была заполнена. Здесь можно прочитать итоговые ответы; исходную точку мы не восстанавливаем по памяти.</p>' : ''}${pair('Ваш запрос',pre.currentSituation,post.currentSituation)}${post.situationChange ? `<p class="cycle-change">Ваша оценка: ${esc(post.situationChange)}</p>` : ''}${rating('bodyContactScale','Контакт с телом','1 — совсем не чувствую, 10 — в полном контакте')}${rating('anxietyScale','Тревога в обычный день','1 — спокойно, 10 — постоянно тревожно')}${pre.successMeans ? pair('Что было для вас важно',pre.successMeans,post.criterionMatch) : ''}${pre.successMeans && post.criterionComment ? `<p class="cycle-personal-note">${esc(post.criterionComment)}</p>` : ''}${post.lifeExample ? `<section class="cycle-pair"><h2>Пример из вашей жизни</h2><p>${esc(post.lifeExample)}</p></section>` : ''}<details class="cycle-all-answers"><summary>Все итоговые ответы</summary><dl class="cycle-review">${reviewRows(post)}</dl></details><p class="cycle-guidance">Это ваши ответы в разные моменты. Они могут показывать разные изменения — общего балла результата здесь нет.</p>`;
    goTo('comparison'); body.scrollTop = 0; body.querySelector('h1')?.focus({preventScroll:true});
  }
  async function submit() {
    if (sending || !isCurrent(formIdentity) || source().stream?.phase !== 'completed') return;
    capture(); saveDraft();
    if (!hasResponses() && !emptyConfirmed) return;
    const identity={...formIdentity}, version=++navigation;
    const payload=JSON.parse(JSON.stringify(answers));
    sending=true;
    const button=document.getElementById('post-next');
    button.disabled=true; button.textContent='Сохраняем…';
    for (const id of ['post-empty-confirm','post-empty-return']) {const control=document.getElementById(id);if(control)control.disabled=true;}
    try {
      const result=await Api.saveQuestionnairePost(identity.streamId,payload);
      if (version!==navigation || !isCurrent(identity)) return;
      if (!result?.id || result.type!=='post' || result.streamId!==identity.streamId) throw new Error('Не удалось подтвердить сохранение. Повторите отправку.');
      record.post=result;
      sending=false;
      Storage.clearFormDraft('questionnaire:post:'+identity.streamId);
      showThanks(); refreshEntries();
    } catch(error) {
      if (version!==navigation || !isCurrent(identity)) return;
      const warning=document.getElementById('post-error');
      warning.textContent=error.message || 'Не удалось сохранить анкету. Повторите отправку.';
      warning.hidden=false; warning.scrollIntoView({block:'nearest'});
    } finally {
      if (version===navigation && isCurrent(identity)) {
        sending=false; button.disabled=false; button.textContent='Отправить анкету';
        for (const id of ['post-empty-confirm','post-empty-return']) {const control=document.getElementById(id);if(control)control.disabled=false;}
      }
    }
  }
  function refreshEntries() {
    const current = source();
    if (!isCurrent(record) || Api.isClubAdmin || Api.userRole==='HOST' || current.stream?.phase !== 'completed') {window.StreamStatePanel?.refreshQuestionnaire();return;}
    closeQInvite();
    for (const id of ['home-q-banner-wrap','q-banner-wrap']) {
      const target = document.getElementById(id);
      const status = current.post ? 'done' : 'pending';
      if (target?.hidden) target.hidden = false;
      if (!target || target.querySelector('[data-post-entry]')?.dataset.postStatus === status) continue;
      target.innerHTML = `<button class="q-banner cycle-entry" type="button" data-post-entry data-post-status="${status}"><span class="q-banner-body"><span class="q-banner-title">${current.post ? 'Мой путь' : 'Что изменилось за время программы'}</span><span class="q-banner-sub">${current.post ? 'С чем я пришла и что замечаю сейчас' : 'Вернитесь к своему запросу и сохраните опыт потока'}</span></span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>`;
      target.querySelector('[data-post-entry]').addEventListener('click',current.post ? showComparison : openPost);
    }
    window.StreamStatePanel?.refreshQuestionnaire();
  }
  function decoratePreThanks() {
    const body = document.getElementById('questionnaire-body');
    const wrap = body?.closest('.questionnaire-wrap');
    if (!body || !wrap) return;
    if (body.querySelector('.q-completion')) return;
    if (!body.querySelector('.q-done-title')) { wrap.classList.remove('questionnaire-wrap--complete'); return; }
    wrap.classList.add('questionnaire-wrap--complete');
    body.innerHTML = completionMarkup(false);
    const button = wrap.querySelector('.questionnaire-footer button');
    if (button) button.textContent = 'Вернуться в приложение';
  }
  function install() {
    const app = document.getElementById('app');
    const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>';
    app.insertAdjacentHTML('beforeend',`<div class="screen" id="screen-post-questionnaire"><div class="questionnaire-wrap"><div class="questionnaire-header"><button class="q-close-btn" id="post-close" aria-label="Вернуться в приложение">${arrow}</button><div class="q-progress-wrap"><div class="q-progress-bar"><div class="q-progress-fill" id="post-progress-fill"></div></div><div class="q-progress-label" id="post-progress-label"></div></div></div><div class="questionnaire-body" id="post-body"></div><div class="post-flow-footer"><button class="btn q-back-btn" id="post-back">Назад</button><button class="btn q-next-btn" id="post-next">Далее</button></div></div></div><div class="screen cycle-success-screen" id="screen-post-thanks"><div class="cycle-wrap"><div class="cycle-success-body" id="post-thanks-body"></div><div class="cycle-success-actions"><button class="btn btn--accent" id="thanks-compare">Посмотреть мой путь</button><button class="cycle-text-button" id="thanks-home">В приложение</button></div></div></div><div class="screen" id="screen-comparison"><div class="cycle-wrap"><div class="cycle-topbar"><button class="q-close-btn" id="comparison-close" aria-label="Вернуться в приложение">${arrow}</button><span>Ваши ответы</span></div><div class="cycle-scroll" id="comparison-body"></div><div class="cycle-bottom"><button class="btn btn--accent" id="comparison-home">В приложение</button></div></div></div>`);
    for (const id of ['screen-post-questionnaire','screen-post-thanks','screen-comparison']) {
      const screen = document.getElementById(id); screen.inert = true; screen.setAttribute('aria-hidden','true');
    }
    document.getElementById('post-close').onclick = home;
    document.getElementById('post-back').onclick = () => { if (sending) return; capture(); step = Math.max(0,step-1); draw(); };
    document.getElementById('post-next').onclick = () => { if (sending) return; capture(); if (steps()[step] === 'review') submit(); else { step++; draw(); } };
    document.getElementById('post-body').addEventListener('input',capture);
    document.getElementById('post-body').addEventListener('change',event => {
      if (event.target.id === 'post-empty-confirm') {
        emptyConfirmed = event.target.checked === true;
        document.getElementById('post-next').disabled = sending || !emptyConfirmed;
        return;
      }
      capture();
      const difficulty = document.getElementById('post-difficulty-detail');
      if (difficulty) difficulty.hidden = answers.difficulties !== 'Да';
      const barrier = document.getElementById('post-app-barrier');
      if (barrier) barrier.hidden = answers.benefit_app !== notUsed;
    });
    document.getElementById('post-body').addEventListener('click', event => {
      if (event.target.closest('#post-empty-return')) {if(sending)return;step=0;draw();document.querySelector('#post-body h1')?.focus({preventScroll:true});return;}
      const button = event.target.closest('[data-scale]');
      if (!button) return;
      const value = button.dataset.value === 'unknown' ? null : Number(button.dataset.value);
      answers[button.dataset.scale] = answers[button.dataset.scale] === value ? undefined : value;
      const position = document.getElementById('post-body').scrollTop;
      saveDraft(); draw(); document.getElementById('post-body').scrollTop = position;
      document.querySelector(`#post-body [data-scale="${button.dataset.scale}"][data-value="${button.dataset.value}"]`)?.focus({preventScroll:true});
    });
    document.getElementById('thanks-compare').onclick = showComparison;
    for (const id of ['thanks-home','comparison-close','comparison-home']) document.getElementById(id).onclick = home;
    new MutationObserver(decoratePreThanks).observe(document.getElementById('questionnaire-body'),{childList:true,subtree:true});

  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
})();
