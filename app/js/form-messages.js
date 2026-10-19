// Shared inline recovery for the existing forms. This module never saves or sends data.
window.FormMessages = (() => {
  const ids = ['q-send-error', 'fb-send-error'];
  function clear(id) { document.getElementById(id)?.remove(); }
  function show(id, host, message, before) {
    if (!host) return;
    clear(id);
    const notice = document.createElement('p');
    notice.id = id; notice.className = 'form-message form-message--error';
    notice.setAttribute('role', 'alert'); notice.tabIndex = -1; notice.textContent = message;
    host.insertBefore(notice, before || host.firstChild);
    notice.focus({ preventScroll: true });
    notice.scrollIntoView({ block: 'nearest' });
    before?.scrollIntoView({ block: 'nearest' });
  }
  return { show, clear, clearAll() { ids.forEach(clear); } };
})();
