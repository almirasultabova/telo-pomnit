// One frozen, owner-scoped delivery at a time. Recovery never starts generation.
window.AiDelivery = (() => {
  const scope = 'ai_delivery_v1', memory = new Map();
  const count = text => Array.from(text.trim()).length;
  function record() {
    if (!Storage._userId || Api.clubBlocked) return null;
    if (!memory.has(Storage._userId)) memory.set(Storage._userId, Storage.getFormDraft(scope));
    return memory.get(Storage._userId);
  }
  function persist(value) {
    memory.set(Storage._userId, value);
    if (!value) { Storage.clearFormDraft(scope); return true; }
    return Storage.saveFormDraft(scope, value);
  }
  function label(session) { return (session.title || 'Диалог без сообщений') + ' · ' + accessDate(session.createdAt || new Date().toISOString()); }
  function render() {
    const input = document.getElementById('ai-input');
    if (!input) return;
    const length = count(input.value), op = record();
    input.removeAttribute('aria-invalid');
    document.getElementById('ai-send-btn').disabled = aiPending || !!op || !length || aiAccessGranted !== true || !aiContextReady();
    let actions = document.getElementById('ai-delivery-actions');
    if (!actions) { actions = document.createElement('div'); actions.id = 'ai-delivery-actions'; document.getElementById('ai-input-bar').append(actions); }
    const focused = actions.contains(document.activeElement) ? document.activeElement.id : null;
    actions.replaceChildren(); actions.hidden = !op;
    if (!op) return;
    const status = document.getElementById('ai-draft-status');
    status.hidden = false;
    status.textContent = aiPending ? 'Проверяем отправку и ожидаем ответ…' : op.state === 'not-found'
      ? 'Сервер не нашёл эту отправку. Можно повторить исходное сообщение с тем же номером.'
      : op.state === 'uncertain'
        ? 'Результат отправки не установлен. Повторный запрос к AI не запускается. Можно проверить ещё раз или начать отдельный диалог.'
        : 'Отправка пока не подтверждена. Проверьте результат перед следующим сообщением.';
    if (op.durable === false) status.textContent += ' Номер отправки пока только в этом окне: не закрывайте приложение.';
    if (aiSendError) status.textContent += ' ' + aiSendError;
    const check = document.createElement('button'); check.id = 'ai-delivery-check'; check.type = 'button'; check.className = 'btn btn--outline btn--full';
    check.textContent = op.state === 'not-found' ? 'Повторить исходную отправку' : 'Проверить отправку'; check.disabled = aiPending;
    check.onclick = () => run(op.state === 'not-found' ? 'retry' : 'check'); actions.append(check);
    if (op.state === 'uncertain') {
      const separate = document.createElement('button'); separate.id = 'ai-delivery-separate'; separate.type = 'button'; separate.className = 'btn btn--ghost btn--full';
      separate.textContent = 'Начать отдельный диалог'; separate.disabled = aiPending;
      separate.onclick = () => {
        // Keep the uncertain text/identifier in the local export; never resend it implicitly.
        const archived = Storage.saveFormDraft('ai_unconfirmed:' + op.operationId, op);
        if (op.serverSessionId) Storage.saveAiDraft(op.serverSessionId, input.value || op.rawText);
        Storage.clearAiDraftIfMatches(null, Storage.getAiDraft(null), Storage._userId, Storage._generation);
        persist(null); aiSessionId = null; aiMessages = []; aiSessionContext = null; aiDraftScope = null;
        aiContext = { mode: 'none', ids: [], preview: null, reviewed: false };
        document.getElementById('ai-history-select').value = ''; renderAiChat();
        if (!archived) { aiSendError = 'Текст предыдущей отправки остался только в этом окне. Сохраните его через выгрузку неотправленных записей перед закрытием.'; renderAiDraftStatus(); }
        input.focus();
      };
      actions.append(separate);
    }
    if (focused) document.getElementById(focused)?.focus();
  }
  async function apply(op, result, current) {
    if (!current()) return;
    op.state = result.state; op.serverSessionId = result.sessionId; op.durable = persist(op);
    if (result.state === 'completed') {
      // Read the canonical history: reload, late ACK and repeated checks append nothing twice.
      const session = await Api.getAiSession(result.sessionId);
      if (!current()) return;
      const input = document.getElementById('ai-input');
      Storage.clearAiDraftIfMatches(op.sessionId, op.rawText, op.owner, op.generation);
      const remaining = Storage.getAiDraft(op.sessionId);
      if (!op.sessionId && remaining) Storage.moveAiDraftIfMatches(null, result.sessionId, remaining, op.owner, op.generation);
      aiSessionId = session.sessionId; aiMessages = session.messages || [];
      aiSessionContext = { mode: session.contextMode || 'legacy_unknown', snapshot: session.contextSnapshot || [], version: session.contextVersion };
      aiDraftScope = null; persist(null); aiSendError = ''; renderAiChat();
      const select = document.getElementById('ai-history-select');
      let option = Array.from(select.options).find(row => row.value === session.sessionId);
      if (!option) { option = new Option('', session.sessionId); select.add(option); }
      option.textContent = label(session); select.value = session.sessionId;
      resizeAiInput(); hapticNotify('success');
    } else if (result.state === 'failed') {
      persist(null); aiSendError = result.code === 'AI_RATE_LIMITED' ? 'AI сейчас занят. Сообщение отклонено; текст сохранён. Попробуйте позже.'
        : 'AI не принял сообщение. Текст сохранён; можно отправить его позже.';
    }
  }
  async function run(mode) {
    if (aiPending || !Storage._userId || Api.clubBlocked) return;
    const owner = Storage._userId, generation = Storage._generation;
    let op = record();
    if (mode === 'send') {
      const input = document.getElementById('ai-input'), rawText = input.value;
      if (op || !count(rawText) || !aiContextReady()) { render(); return; }
      saveCurrentAiDraft();
      op = { operationId: crypto.randomUUID(), owner, rawText, message: rawText.trim(), sessionId: aiSessionId,
        context: { contextMode: aiContext.mode, diaryEntryIds: [...aiContext.ids], contextPreviewHash: aiContext.preview?.contextHash }, state: 'pending' };
      op.durable = persist(op);
    }
    if (!op || op.owner !== owner) return;
    // Generation is runtime-only and must be rebound after reload, never trusted from disk.
    op.generation = generation;
    const current = () => owner === Storage._userId && generation === Storage._generation && !Api.clubBlocked;
    const actionFocused = document.getElementById('ai-delivery-actions')?.contains(document.activeElement);
    aiPending = true; aiSendError = ''; const select = document.getElementById('ai-history-select'); select.disabled = true; renderAiChat();
    try {
      if (mode === 'check') {
        const result = await Api.getAiOperation(op.operationId);
        await apply(op, result, current);
      } else {
        await refreshProgramAccess();
        if (!current()) return;
        if (aiAccessGranted !== true) { if (mode === 'send') persist(null); aiSendError = 'Сейчас нет доступа к отправке. Текст сохранён.'; return; }
        const result = await Api.aiChat(op.message, op.sessionId, op.context, op.operationId);
        await apply(op, result, current);
      }
    } catch (error) {
      if (!current()) return;
      if (mode === 'check' && error.code === 'AI_OPERATION_NOT_FOUND') { op.state = 'not-found'; op.durable = persist(op); }
      else if (mode !== 'check' && [400,403,404,409,413,422].includes(error.status)) {
        // These route rejections happen before a claim. Do not discard ambiguous transport errors.
        persist(null); aiSendError = error.status === 413 ? 'Сообщение слишком большое для одной отправки. Разделите его на части. Текст сохранён.' : (error.message || 'Сообщение не отправлено.') + ' Текст сохранён.';
        if (error.code === 'CONTEXT_CHANGED') { aiContext.preview = null; aiContext.reviewed = false; }
      } else aiSendError = 'Не удалось получить результат. Проверьте отправку; текст сохранён.';
    } finally {
      if (current()) {
        aiPending = false; select.disabled = false; renderAiChat();
        if (actionFocused) (document.getElementById('ai-delivery-check') || document.getElementById('ai-input')).focus({ preventScroll: true });
      }
    }
  }
  function invalidate() {
    memory.clear();
    aiPending = false; aiScreenRequest++; aiSessionId = null; aiMessages = []; aiSessionContext = null;
    aiContext = { mode: 'none', ids: [], preview: null, reviewed: false }; aiDraftScope = null; aiSendError = '';
    const input = document.getElementById('ai-input'); if (input) input.value = '';
    document.getElementById('ai-messages')?.replaceChildren();
    document.getElementById('ai-delivery-actions')?.remove();
    const status = document.getElementById('ai-draft-status'); if (status) { status.textContent = ''; status.hidden = true; }
  }
  return { send: () => run('send'), render, label, count, invalidate };
})();
