window.MeetingPanel = (() => {
  let dialog, context = null, bodyKey = '', copyTicket = 0;
  function current() {
    if (!context || !Api.isAuthed() || Api.clubBlocked || String(Api.userId) !== context.owner || Api._authGeneration !== context.generation || String(Storage._userId) !== context.owner) return null;
    const stream = currentProgram();
    if (!stream || String(stream.id) !== context.stream) return null;
    const meeting = stream.meetings?.find(m => String(m.id) === context.meeting);
    return meeting ? { stream, meeting } : null;
  }
  function recordingsAllowed(stream) {
    return stream.canReadRecordings === true && (!stream.recordingsExpiresAt || programNow() < Date.parse(stream.recordingsExpiresAt));
  }
  function close() { if (dialog?.open) dialog.close(); }
  function invalidate() {
    context = null; bodyKey = ''; copyTicket++;
    close(); dialog?.replaceChildren();
    if (typeof updateBackBtn === 'function') updateBackBtn();
  }
  function recording(body, stream, meeting) {
    if (!recordingsAllowed(stream) || !meeting.recordingUrl) return;
    let url;
    try { url = new URL(meeting.recordingUrl); } catch { return; }
    if (url.protocol !== 'https:' || url.username || url.password) return;
    const block = document.createElement('section'); block.className = 'meeting-recording';
    const link = document.createElement('a'); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Запись эфира';
    link.addEventListener('click', event => { const next = current(); if (!next || !recordingsAllowed(next.stream) || next.meeting.recordingUrl !== meeting.recordingUrl) { event.preventDefault(); sync(); } });
    block.append(link);
    if (typeof meeting.recordingPasscode === 'string' && meeting.recordingPasscode) {
      const row = document.createElement('div'); row.className = 'meeting-recording-code';
      const label = document.createElement('label'); label.htmlFor = 'meeting-recording-passcode'; label.textContent = 'Код доступа';
      const input = document.createElement('input'); input.id = label.htmlFor; input.readOnly = true; input.value = meeting.recordingPasscode; input.autocomplete = 'off'; input.spellcheck = false;
      const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'meeting-code-copy'; copy.textContent = 'Скопировать';
      const status = document.createElement('p'); status.className = 'meeting-code-status'; status.setAttribute('role', 'status');
      copy.addEventListener('click', async () => {
        const next = current(); if (!next || !recordingsAllowed(next.stream) || next.meeting.recordingPasscode !== input.value) { sync(); return; }
        const ticket = ++copyTicket, owner = context;
        try {
          await navigator.clipboard.writeText(input.value);
          if (context !== owner || ticket !== copyTicket || !dialog.open || !current() || !recordingsAllowed(current().stream)) return;
          status.textContent = 'Код скопирован';
        } catch {
          if (context !== owner || ticket !== copyTicket || !dialog.open || !current() || !recordingsAllowed(current().stream)) return;
          input.focus(); input.select(); status.textContent = 'Код выделен. Нажмите и удерживайте его, чтобы скопировать.';
        }
      });
      row.append(label, input, copy); block.append(row, status);
    }
    body.append(block);
  }
  function sync() {
    if (!dialog?.open || !context) return;
    const value = current(); if (!value) { invalidate(); return; }
    const { stream, meeting } = value;
    dialog.querySelector('#program-meeting-title').textContent = meeting.topic || 'Встреча ' + meeting.number;
    dialog.querySelector('.meeting-panel-date').textContent = accessDate(meeting.date) + ' · МСК';
    const key = JSON.stringify([meeting, stream.canAttend, stream.zoomLink, recordingsAllowed(stream)]);
    if (key !== bodyKey) {
      const body = dialog.querySelector('.meeting-panel-body'), focused = body.contains(document.activeElement);
      copyTicket++; body.replaceChildren(); renderProgramMeetingBody(body, stream, meeting); recording(body, stream, meeting); bodyKey = key;
      if (focused) dialog.querySelector('.meeting-panel-close').focus();
    }
    const attended = Storage.isAttended(meeting.id);
    dialog.querySelector('.meeting-panel-status').textContent = attended ? 'Вы отметили участие' : '';
    const button = dialog.querySelector('.meeting-panel-attend');
    button.textContent = attended ? 'Снять отметку участия' : 'Отметить участие'; button.setAttribute('aria-pressed', String(attended));
  }
  function ensure() {
    if (dialog) return;
    dialog = document.createElement('dialog'); dialog.id = 'program-meeting-dialog'; dialog.className = 'meeting-panel'; dialog.setAttribute('aria-labelledby', 'program-meeting-title');
    document.body.append(dialog);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    let backdropDown = false;
    dialog.addEventListener('pointerdown', event => { backdropDown = event.target === dialog; });
    dialog.addEventListener('click', event => { if (backdropDown && event.target === dialog) close(); backdropDown = false; });
    dialog.addEventListener('close', () => {
      if (dialog.open) return;
      const previous = context; context = null; bodyKey = ''; copyTicket++; dialog.replaceChildren(); updateBackBtn();
      if (!previous || !Api.isAuthed() || Api.clubBlocked || String(Api.userId) !== previous.owner || Api._authGeneration !== previous.generation || String(currentProgram()?.id) !== previous.stream || currentScreen !== 'home' || activeTab !== 'profile') return;
      const opener = [...document.querySelectorAll('[data-program-meeting]')].find(e => e.dataset.programMeeting === previous.meeting);
      opener?.focus({ preventScroll: true });
    });
  }
  function open(id) {
    if (!Api.isAuthed() || Api.clubBlocked || !Api.userId || String(Storage._userId) !== String(Api.userId)) return;
    const stream = currentProgram(); if (!stream?.meetings?.some(m => String(m.id) === String(id))) return;
    ensure();
    context = { owner: String(Api.userId), generation: Api._authGeneration, stream: String(stream.id), meeting: String(id) }; bodyKey = ''; copyTicket++;
    dialog.innerHTML = '<header class="meeting-panel-header"><div><p class="meeting-panel-date"></p><h2 id="program-meeting-title"></h2></div><button type="button" class="meeting-panel-close" aria-label="Закрыть встречу" autofocus><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header><div class="meeting-panel-body program-meeting-body"></div><footer class="meeting-panel-footer"><p class="meeting-panel-status" role="status"></p><button type="button" class="btn btn--primary btn--full meeting-panel-attend"></button></footer>';
    dialog.querySelector('.meeting-panel-close').onclick = close;
    dialog.querySelector('.meeting-panel-attend').onclick = event => { const value = current(); if (!value) { invalidate(); return; } toggleAttend(event, value.meeting.id); sync(); dialog.querySelector('.meeting-panel-attend').focus(); };
    if (!dialog.open) dialog.showModal(); sync(); dialog.querySelector('.meeting-panel-close').focus(); updateBackBtn();
  }
  return { open, close, sync, invalidate, isOpen() { return !!dialog?.open; } };
})();
