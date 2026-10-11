// Same-origin management surface; rights are verified by the server, never by a cached role.
let managementRequest = 0;
let managementIdentity = null;
let managementFrameTimer = null;

function managementCurrent(identity) {
  return identity && Api.isAuthed() && !Api.clubBlocked &&
    Api.userId === identity.owner && Api._authGeneration === identity.generation;
}
function clearAccessManagementState() {
  managementRequest++;
  managementIdentity = null;
  clearTimeout(managementFrameTimer);
  document.getElementById('screen-access-admin')?.remove();
  const button = document.getElementById('access-management-btn');
  if (button) button.hidden = true;
  const status = document.getElementById('access-management-status');
  if (status) { status.hidden = true; status.textContent = ''; }
  const legacy = document.getElementById('admission-admin-panel');
  if (legacy) { legacy.hidden = true; legacy.replaceChildren(); }
}
async function renderAccessManagementEntry(open = false) {
  const button = document.getElementById('access-management-btn');
  const status = document.getElementById('access-management-status');
  if (!button || !status) return;
  const identity = {owner:Api.userId,generation:Api._authGeneration};
  const request = ++managementRequest;
  const hint = Api.isClubAdmin || Api.userRole === 'ADMIN';
  button.hidden = !hint;
  button.disabled = true;
  status.hidden = true;
  button.onclick = () => renderAccessManagementEntry(true);
  if (!managementCurrent(identity)) { button.hidden = true; return; }
  try {
    const session = await Api.getManagementSession();
    if (request !== managementRequest || !managementCurrent(identity)) return;
    if (session.id !== identity.owner) throw Error('Сессия изменилась');
    managementIdentity = identity;
    button.hidden = false;
    if (open) openAccessManagement();
  } catch (error) {
    if (request !== managementRequest || !managementCurrent(identity)) return;
    managementIdentity = null;
    button.hidden = error.status === 403 || !hint;
    if (error.status === 403 && currentScreen === 'access-admin') closeAccessManagement();
    if (hint && error.status !== 403) {
      status.textContent = 'Не удалось проверить доступ к управлению. Нажмите «Управление», чтобы повторить.';
      status.hidden = false;
    }
  } finally {
    if (request === managementRequest) button.disabled = false;
  }
}
// The child is our trusted same-origin page. Credentials stay in memory and never enter a URL/storage.
function getAccessManagementToken() {
  return currentScreen === 'access-admin' && managementCurrent(managementIdentity) ? Api._token : '';
}
function loadManagementFrame() {
  if (!managementCurrent(managementIdentity)) { clearAccessManagementState(); return; }
  const frame = document.getElementById('access-management-frame');
  if (!frame) return;
  const status = document.getElementById('management-frame-status');
  const retry = document.getElementById('management-frame-retry');
  frame.hidden = true;
  status.hidden = false;
  status.textContent = 'Открываем управление…';
  retry.hidden = true;
  clearTimeout(managementFrameTimer);
  frame.src = '/access-admin.html?v=profile-20261011';
  managementFrameTimer = setTimeout(() => {
    if (!managementCurrent(managementIdentity) || !document.getElementById('access-management-frame')) return;
    status.textContent = 'Не удалось открыть управление. Повторите загрузку или вернитесь в профиль.';
    retry.hidden = false;
  }, 12000);
}
function openAccessManagement() {
  if (!managementCurrent(managementIdentity)) return;
  let screen = document.getElementById('screen-access-admin');
  if (!screen) {
    screen = document.createElement('div');
    screen.id = 'screen-access-admin';
    screen.className = 'screen access-management-screen';
    screen.innerHTML = '<div class="screen-header"><div class="screen-title">Управление</div><button type="button" class="screen-header-btn" id="management-close">Назад</button></div><div class="management-loading"><p id="management-frame-status" role="status"></p><button type="button" id="management-frame-retry" class="btn btn--outline" hidden>Повторить загрузку</button></div><iframe id="access-management-frame" title="Заявки, люди и потоки" hidden></iframe>';
    document.getElementById('screen-home').parentElement.append(screen);
    document.getElementById('management-close').onclick = closeAccessManagement;
    document.getElementById('management-frame-retry').onclick = loadManagementFrame;
  }
  goTo('access-admin');
  loadManagementFrame();
}
function closeAccessManagement() {
  clearTimeout(managementFrameTimer);
  const destination = screenStack.pop() || 'home';
  goTo(destination, true);
  document.getElementById('screen-access-admin')?.remove();
  document.getElementById('access-management-btn')?.focus({preventScroll:true});
}
window.addEventListener('message', event => {
  const frame = document.getElementById('access-management-frame');
  if (!frame || event.source !== frame.contentWindow || event.origin !== location.origin ||
      event.data?.type !== 'telo-access-admin' || !['ready','error','revoked'].includes(event.data.state) ||
      currentScreen !== 'access-admin' || !managementCurrent(managementIdentity)) return;
  clearTimeout(managementFrameTimer);
  if (event.data.state === 'revoked') {
    closeAccessManagement();
    managementIdentity = null;
    document.getElementById('access-management-btn').hidden = true;
    const status = document.getElementById('access-management-status');
    status.textContent = 'Доступ к управлению закрыт. Откройте приложение заново, если ваши права изменились.';
    status.hidden = false;
    return;
  }
  document.getElementById('management-frame-status').hidden = true;
  document.getElementById('management-frame-retry').hidden = true;
  frame.hidden = false;
});
