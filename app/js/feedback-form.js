// Feedback screen. Existing behavior and API payloads preserved (J-APP-155).
window.FeedbackForm = (() => {
let feedbackRating = 0;
let feedbackOperation = null;
let feedbackPending = false;
let feedbackIdentity = null;
function persistFeedbackDraft(changed = false) {
  if (!feedbackIdentity || feedbackIdentity.owner !== Api.userId || feedbackIdentity.generation !== Api._authGeneration) return;
  if (changed || !feedbackOperation) feedbackOperation = crypto.randomUUID();
  const durable = Storage.saveFormDraft('feedback', { text: document.getElementById('fb-text')?.value || '', rating: feedbackRating, operationId: feedbackOperation, streamId: document.getElementById('fb-stream')?.value || null, kind: document.getElementById('fb-kind')?.value || 'feedback', needsReply: document.getElementById('fb-reply')?.value === 'yes' });
  let status = document.getElementById('fb-draft-status');
  if (!status) { status = document.createElement('p'); status.id = 'fb-draft-status'; status.setAttribute('role','status'); document.getElementById('feedback-form-wrap')?.insertBefore(status, document.getElementById('fb-submit')); }
  status.textContent = durable ? 'Черновик сохранён.' : 'Черновик пока только в этом окне. Не закрывайте его до отправки.';
}

function openFeedback() {
  window.FormMessages?.clear('fb-send-error');
  feedbackIdentity = { owner: Api.userId, generation: Api._authGeneration };
  const draft = Storage.getFormDraft('feedback');
  feedbackRating = draft?.rating || 0;
  feedbackOperation = draft?.operationId || crypto.randomUUID();
  const text = document.getElementById('fb-text');
  if (text) { text.value = draft?.text || ''; }
  const counter = document.getElementById('fb-counter');
  if (counter) counter.textContent = String(text?.value.length || 0);
  document.querySelectorAll('#fb-stars .fb-star').forEach(s => {
    s.classList.toggle('fb-star--active', Number(s.dataset.star) <= feedbackRating);
    s.setAttribute('aria-pressed', String(Number(s.dataset.star) === feedbackRating));
    s.setAttribute('aria-label', 'Оценка ' + s.dataset.star + ' из 5');
  });
  syncFeedbackRating();
  const submit = document.getElementById('fb-submit');
  if (submit) { submit.disabled = true; submit.textContent = 'Отправить сообщение'; }
  const formWrap = document.getElementById('feedback-form-wrap');
  const thanks   = document.getElementById('feedback-thanks');
  if (formWrap) formWrap.style.display = '';
  if (thanks)   thanks.style.display = 'none';
  const scope = document.getElementById('fb-stream');
  scope.innerHTML = '<option value="">Общие вопросы</option>';
  for (const stream of programAccess?.streams || []) {const option = document.createElement('option');option.value=stream.id;option.textContent=stream.name;scope.append(option);}
  if(draft?.streamId && ![...scope.options].some(o=>o.value===draft.streamId)){const option=document.createElement('option');option.value=draft.streamId;option.textContent='Ранее выбранный поток';scope.append(option);}
  scope.value = draft?.streamId || '';
  document.getElementById('fb-kind').value = draft?.kind || 'feedback';
  document.getElementById('fb-reply').value = draft?.needsReply ? 'yes' : 'no';
  updateFeedbackSubmitState();
  goTo('feedback');
}

function syncFeedbackRating() {
  const clear = document.getElementById('fb-clear-rating');
  if (clear) clear.hidden = !feedbackRating;
  const status = document.getElementById('fb-rating-status');
  if (status) status.textContent = feedbackRating ? 'Ваша оценка: ' + feedbackRating + ' из 5.' : 'Сообщение можно отправить без оценки.';
}

function initFeedback() {
  document.getElementById('open-feedback-btn')?.addEventListener('click', openFeedback);

  const stars = document.querySelectorAll('#fb-stars .fb-star');
  stars.forEach(star => {
    star.addEventListener('click', () => {
      feedbackRating = Number(star.dataset.star);
      syncFeedbackRating();
      stars.forEach(s => s.setAttribute('aria-pressed', String(Number(s.dataset.star) === feedbackRating)));
      persistFeedbackDraft(true);
      stars.forEach(s => {
        s.classList.toggle('fb-star--active', Number(s.dataset.star) <= feedbackRating);
      });
      haptic('light');
      updateFeedbackSubmitState();
    });
  });

  document.getElementById('fb-clear-rating')?.addEventListener('click', () => {
    feedbackRating = 0;
    stars.forEach(star => { star.classList.remove('fb-star--active'); star.setAttribute('aria-pressed', 'false'); });
    syncFeedbackRating(); persistFeedbackDraft(true);
    stars[0]?.focus({ preventScroll: true });
  });
  const text = document.getElementById('fb-text');
  text?.addEventListener('input', () => {
    window.FormMessages?.clear('fb-send-error');
    const counter = document.getElementById('fb-counter');
    if (counter) counter.textContent = String(text.value.length);
    persistFeedbackDraft(true);
    updateFeedbackSubmitState();
  });

  for (const id of ['fb-stream','fb-kind','fb-reply']) document.getElementById(id)?.addEventListener('change', () => persistFeedbackDraft(true));
  document.getElementById('fb-submit')?.addEventListener('click', submitFeedback);
}

function updateFeedbackSubmitState() {
  const text = document.getElementById('fb-text');
  const submit = document.getElementById('fb-submit');
  if (!submit) return;
  const hasText = (text?.value || '').trim().length > 0;
  submit.disabled = feedbackPending || !hasText;
  if (!feedbackPending) submit.textContent = document.getElementById('fb-send-error') ? 'Повторить отправку' : 'Отправить сообщение';
}

async function submitFeedback() {
  const text = document.getElementById('fb-text');
  const submit = document.getElementById('fb-submit');
  const value = (text?.value || '').trim();
  if (!value || feedbackPending || !feedbackIdentity || feedbackIdentity.owner !== Api.userId || feedbackIdentity.generation !== Api._authGeneration) return;
  persistFeedbackDraft();
  const formIdentity = feedbackIdentity;
  const identity = { ...feedbackIdentity }, operationId = feedbackOperation, rating = feedbackRating;
  const current = () => Api.userId === identity.owner && Api._authGeneration === identity.generation && !Api.clubBlocked;
  feedbackPending = true;
  window.FormMessages?.clear('fb-send-error');
  submit.setAttribute('aria-busy', 'true');

  submit.disabled = true;
  submit.textContent = 'Отправляем…';
  try {
    await Api.sendFeedback({ rating: rating || null, text: value, operationId, streamId: document.getElementById('fb-stream').value || null, kind: document.getElementById('fb-kind').value, needsReply: document.getElementById('fb-reply').value === 'yes' });
    if (!current()) return;
    if (feedbackOperation !== operationId) {
      const status = document.getElementById('fb-draft-status');
      if (status) status.textContent = 'Предыдущее сообщение отправлено. Новый текст остаётся в черновике.';
      return;
    }
    Storage.clearFormDraft('feedback');
    haptic('medium');
    document.getElementById('feedback-form-wrap').style.display = 'none';
    document.getElementById('feedback-thanks').style.display = '';
  } catch (e) {
    if (!current()) return;
    if (feedbackIdentity === formIdentity && feedbackOperation === operationId && currentScreen === 'feedback') {
      window.FormMessages?.show('fb-send-error', document.getElementById('feedback-form-wrap'), 'Отправка сообщения не подтверждена. Текст остался в форме. Попробуйте ещё раз.', submit);
    }
  } finally {
    feedbackPending = false;
    submit.removeAttribute('aria-busy');
    if (current()) updateFeedbackSubmitState();
  }
}

return { init: initFeedback, open: openFeedback, submit: submitFeedback, resetRating() { feedbackRating = 0; } };
})();
