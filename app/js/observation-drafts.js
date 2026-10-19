// Local, owner-scoped drafts for the two existing observation flows. Never auto-submit.
(() => {
  'use strict';
  const BODY = 'body-observation-v1', REACTION = 'reaction-observation-v1';
  const bodyScreens = ['body-map', 'sensations', 'note'];
  let body = null, reaction = null;
  const bodyRecovery = new Map();
  const identity = () => Api.isAuthed() && !Api.clubBlocked && Api.userId && String(Api.userId) === Storage._userId
    ? { owner: Storage._userId, generation: Storage._generation } : null;
  const current = state => state && state.owner === Storage._userId && state.generation === Storage._generation && identity();
  const zoneExists = id => DATA.zones.some(zone => zone.id === id && zone.selectable !== false);
  const sensationsValid = value => Array.isArray(value) && value.every(id => typeof id === 'string');
  function panel(parent, id, text, discard, visible) {
    let node = document.getElementById(id);
    if (!node) {
      node = document.createElement('div'); node.id = id; node.className = 'access-notice';
      const copy = document.createElement('p'); copy.setAttribute('role', 'status');
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn--outline btn--sm';
      button.textContent = 'Удалить черновик'; button.onclick = discard;
      node.append(copy, button); parent.append(node);
    }
    node.hidden = !visible;
    node.querySelector('p').textContent = text;
  }
  function draftMessage(durable) {
    if (window.ScreenReviewMode) return 'Учебный черновик только в этом просмотре.';
    return durable ? 'Черновик сохранён на этом устройстве. Он не отправляется сам.'
      : 'Черновик пока только в открытом приложении. Не закрывайте его до сохранения.';
  }
  function bodyValue() {
    return { version: 1, zone: draft.zone, sensations: [...draft.sensations],
      note: document.getElementById('note-textarea').value, view: bodyMapView, date: body?.date || null };
  }
  const bodyHasInput = value => Boolean(value.zone || value.sensations.length || value.note);
  const sameBody = (value, row) => value?.date === row.date && value.zone === row.zone && value.note === row.note && JSON.stringify(value.sensations) === JSON.stringify(row.sensations);
  function openBody(repairId) {
    const owner = identity(); if (!owner) return false;
    const rejected = repairId && Storage.getDiaryEntries().find(row => row.clientId === repairId);
    if (repairId && (!rejected?.retryBlocked || ![400, 422].includes(rejected.rejectedStatus))) {
      showToast('Эту запись нельзя изменять без проверки сохранённой версии.', false); return false;
    }
    const scope = repairId ? BODY + ':repair:' + repairId : BODY;
    const stored = Storage.getFormDraft(scope);
    const cached = stored?.version === 1 && (stored.zone === null || zoneExists(stored.zone)) &&
      sensationsValid(stored.sensations) && typeof stored.note === 'string' ? stored : null;
    const value = cached || (rejected ? { ...rejected, view: DATA.zones.find(z => z.id === rejected.zone)?.view || 'front' } : null);
    body = { ...owner, scope, repairId, recovered: !!cached, date: value?.date && Number.isFinite(Date.parse(value.date)) ? value.date : null, durable: AppLocalStorage.isPersistent() };
    if (value) {
      draft.zone = zoneExists(value.zone) ? value.zone : null;
      draft.sensations = [...value.sensations]; draft.note = value.note;
      bodyMapView = value.view === 'back' ? 'back' : 'front';
      document.getElementById('note-textarea').value = value.note;
    }
    renderBody(); return true;
  }
  function persistBody() {
    if (!current(body) || !bodyScreens.includes(currentScreen) || diarySaveStarted) return;
    draft.note = document.getElementById('note-textarea').value;
    const value = bodyValue();
    if (bodyHasInput(value)) {
      body.date ||= new Date().toISOString(); value.date = body.date;
      body.durable = Storage.saveFormDraft(body.scope, value);
    } else Storage.clearFormDraft(body.scope);
    renderBody();
  }
  function renderBody() {
    if (!current(body)) return;
    const value = bodyValue(), tooLong = value.note.length > 20000;
    const copy = tooLong ? 'В заметке больше 20 000 символов. Сократите текст, чтобы отправить запись. ' + draftMessage(body.durable)
      : (body.repairId ? 'Исправление отклонённой записи. ' : '') + draftMessage(body.durable);
    for (const screen of bodyScreens) {
      const parent = document.querySelector('#screen-' + screen + ' .screen-scroll');
      panel(parent, 'body-draft-' + screen, copy, discardBody, bodyHasInput(value));
    }
    document.getElementById('note-save-btn').disabled = diarySaveStarted || tooLong || !draft.zone || !draft.sensations.length;
  }
  function discardBody() {
    if (!current(body)) return;
    const repair = body.repairId; Storage.clearFormDraft(body.scope); body = null;
    if (repair) { goTo('home', true); switchTab('diary'); }
    else startDiaryEntry();
  }
  function submitBody(entry) {
    if (!current(body)) throw new Error('SESSION_CHANGED');
    const value = { ...entry, date: body.date || entry.date };
    const queued = !body.repairId && body.recovered && body.date && Storage.getDiaryEntries().find(row => sameBody(value, row));
    const row = body.repairId ? Storage.repairDiaryEntry(body.repairId, entry)
      : queued || Storage.saveDiaryEntry(value);
    if (row.syncStatus === 'memory-only') bodyRecovery.set(row.clientId, { ...body });
    else Storage.clearFormDraft(body.scope);
    if (queued && queued.syncStatus !== 'synced') Promise.resolve().then(() => Storage.flushPending());
    body = null;
    document.querySelectorAll('[id^="body-draft-"]').forEach(node => node.hidden = true);
    return row;
  }
  function reactionValue() {
    return { version: 1, situation: document.getElementById('trigger-situation').value,
      reactionType: triggerDraft.reactionType, intensity: triggerDraft.intensity, zone: triggerDraft.zone,
      sensations: [...triggerDraft.sensations], note: document.getElementById('trigger-note').value };
  }
  const reactionHasInput = value => Boolean(value.situation || value.reactionType || value.zone || value.sensations.length || value.note || value.intensity !== 5);
  function openReaction() {
    const owner = identity(); if (!owner) return;
    const stored = Storage.getFormDraft(REACTION);
    const valid = stored?.version === 1 && typeof stored.situation === 'string' && typeof stored.note === 'string' &&
      (stored.reactionType === null || ['freeze', 'fight', 'flight', 'fawn'].includes(stored.reactionType)) &&
      Number.isInteger(stored.intensity) && stored.intensity >= 1 && stored.intensity <= 10 &&
      (stored.zone === null || zoneExists(stored.zone)) && sensationsValid(stored.sensations);
    reaction = { ...owner, durable: AppLocalStorage.isPersistent() };
    if (valid) {
      Object.assign(triggerDraft, stored, { sensations: [...stored.sensations] });
      document.getElementById('trigger-situation').value = stored.situation;
      document.getElementById('trigger-note').value = stored.note;
      document.getElementById('trigger-intensity').value = stored.intensity;
      document.getElementById('intensity-value').textContent = stored.intensity;
      document.querySelectorAll('.reaction-card').forEach(node => {
        const selected = node.dataset.reaction === stored.reactionType;
        node.classList.toggle('reaction-card--selected', selected); node.setAttribute('aria-pressed', String(selected));
      });
      document.querySelectorAll('#trigger-zone-chips .zone-chip').forEach(node => {
        const selected = node.dataset.zone === stored.zone;
        node.classList.toggle('zone-chip--selected', selected); node.setAttribute('aria-pressed', String(selected));
      });
      document.querySelectorAll('#trigger-sensations-grid .checklist-item').forEach(node => {
        const selected = stored.sensations.includes(node.dataset.id);
        node.classList.toggle('checklist-item--selected', selected); node.setAttribute('aria-checked', String(selected));
      });
    }
    updateTriggerSaveBtn(); renderReaction();
  }
  function renderReaction() {
    if (!current(reaction)) return;
    panel(document.querySelector('#screen-trigger .screen-scroll'), 'reaction-draft-status',
      draftMessage(reaction.durable), discardReaction, reactionHasInput(reactionValue()));
  }
  function persistReaction() {
    if (!current(reaction) || currentScreen !== 'trigger') return;
    const value = reactionValue();
    if (reactionHasInput(value)) reaction.durable = Storage.saveFormDraft(REACTION, value);
    else Storage.clearFormDraft(REACTION);
    renderReaction();
  }
  function discardReaction() {
    if (!current(reaction)) return;
    Storage.clearFormDraft(REACTION); resetTriggerForm();
  }
  function submittedReaction() {
    if (!current(reaction)) return;
    Storage.clearFormDraft(REACTION); reaction = null;
    document.getElementById('reaction-draft-status')?.setAttribute('hidden', '');
  }
  function invalidate() {
    document.getElementById('trigger-history-list')?.replaceChildren();
    body = reaction = null; bodyRecovery.clear();
    for (const id of ['note-textarea', 'trigger-situation', 'trigger-note']) {
      const field = document.getElementById(id); if (field) field.value = '';
    }
    draft.zone = null; draft.sensations = []; draft.note = '';
    triggerDraft.situation = ''; triggerDraft.note = ''; triggerDraft.sensations = []; triggerDraft.zone = null; triggerDraft.reactionType = null;
    triggerDraft.intensity = 5;
    document.getElementById('trigger-intensity').value = 5;
    document.getElementById('intensity-value').textContent = '5';
    document.querySelectorAll('.reaction-card--selected,.zone-chip--selected,.zone-path--active,.sensation-btn--active').forEach(node => {
      node.classList.remove('reaction-card--selected', 'zone-chip--selected', 'zone-path--active', 'sensation-btn--active');
      node.setAttribute('aria-pressed', 'false');
    });
    document.querySelectorAll('#trigger-sensations-grid .checklist-item').forEach(node => {
      node.classList.remove('checklist-item--selected'); node.setAttribute('aria-checked', 'false');
    });
    document.querySelectorAll('[id^="body-draft-"],#reaction-draft-status,#saved-repair-btn').forEach(node => node.remove());
  }
  function install() {
    Storage.subscribe(row => {
      const recovery = row?.syncStatus === 'synced' && bodyRecovery.get(row.clientId);
      if (!recovery) return;
      bodyRecovery.delete(row.clientId);
      if (current(recovery) && sameBody(Storage.getFormDraft(recovery.scope), row)) Storage.clearFormDraft(recovery.scope);
    });
    const persist = () => { persistBody(); persistReaction(); };
    document.addEventListener('input', event => {
      if (event.target.closest('#screen-note,#screen-trigger')) persist();
    });
    document.addEventListener('click', event => {
      if (event.target.closest('#screen-body-map,#screen-sensations,#screen-trigger')) persist();
    });
    document.getElementById('note-textarea').addEventListener('input', renderBody);
  }
  window.ObservationDrafts = { openBody, renderBody, submitBody, openReaction, submittedReaction, invalidate };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true }); else install();
})();
