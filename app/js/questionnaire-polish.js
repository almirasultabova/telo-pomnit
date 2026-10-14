(() => {
  const original = renderQBlock;
  renderQBlock = function () {
    original();
    const body = document.getElementById('questionnaire-body');
    const title = body.querySelector('.q-block-title');
    if (!title) return;
    const intro = document.createElement('div');
    intro.className = 'q-form-intro';
    title.replaceWith(intro);
    intro.append(title);
    if (qStep === 0) {
      const note = document.createElement('p');
      note.className = 'q-form-note';
      note.textContent = 'Ваш запрос и ожидания от программы · первая неделя';
      intro.append(note);
    }
  };
  const close = document.querySelector('#screen-questionnaire .q-close-btn');
  close.setAttribute('aria-label', 'Вернуться в приложение');
  close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>';
})();
