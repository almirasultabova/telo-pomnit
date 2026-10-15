// Same-origin overview surface; rights are verified by the server, never by a cached role.
let overviewRequest = 0;
let overviewIdentity = null;
let overviewFrameTimer = null;

function overviewCurrent(identity) {
  return identity && Api.isAuthed() && !Api.clubBlocked &&
    Api.userId === identity.owner && Api._authGeneration === identity.generation;
}
function clearStreamOverviewState() {
  overviewRequest++;
  overviewIdentity = null;
  clearTimeout(overviewFrameTimer);
  document.getElementById('screen-stream-overview')?.remove();
  const button = document.getElementById('stream-overview-entry-btn');
  if (button) button.hidden = true;
  const status = document.getElementById('stream-overview-entry-status');
  if (status) { status.hidden = true; status.textContent = ''; }
}
async function renderStreamOverviewEntry(open = false) {
  const button = document.getElementById('stream-overview-entry-btn');
  const status = document.getElementById('stream-overview-entry-status');
  if (!button || !status) return;
  const identity = {owner:Api.userId,generation:Api._authGeneration};
  const request = ++overviewRequest;
  const hint = Api.isClubAdmin || Api.userRole === 'HOST';
  button.hidden = !hint;
  button.disabled = true;
  status.hidden = true;
  button.onclick = () => renderStreamOverviewEntry(true);
  if (!overviewCurrent(identity)) { button.hidden = true; return; }
  try {
    const session = await Api.getStreamOverviewSession();
    if (request !== overviewRequest || !overviewCurrent(identity)) return;
    if (session.id !== identity.owner) throw Error('Сессия изменилась');
    overviewIdentity = identity;
    button.hidden = false;
    if (open) openStreamOverview();
  } catch (error) {
    if (request !== overviewRequest || !overviewCurrent(identity)) return;
    overviewIdentity = null;
    button.hidden = error.status === 403 || !hint;
    if (error.status === 403 && currentScreen === 'stream-overview') closeStreamOverview();
    if (hint && error.status !== 403) {
      status.textContent = 'Не удалось проверить доступ к обзору. Нажмите «Обзор потока», чтобы повторить.';
      status.hidden = false;
    }
  } finally {
    if (request === overviewRequest) button.disabled = false;
  }
}
// The child is our trusted same-origin page. Credentials stay in memory and never enter a URL/storage.
function getStreamOverviewToken() {
  return currentScreen === 'stream-overview' && overviewCurrent(overviewIdentity) ? Api._token : '';
}
function loadStreamOverviewFrame() {
  if (!overviewCurrent(overviewIdentity)) { clearStreamOverviewState(); return; }
  const frame = document.getElementById('stream-overview-entry-frame');
  if (!frame) return;
  const status = document.getElementById('overview-frame-status');
  const retry = document.getElementById('overview-frame-retry');
  frame.hidden = true;
  status.hidden = false;
  status.textContent = 'Открываем обзор…';
  retry.hidden = true;
  clearTimeout(overviewFrameTimer);
  frame.src = '/stream-overview.html?v=JAPP042';
  overviewFrameTimer = setTimeout(() => {
    if (!overviewCurrent(overviewIdentity) || !document.getElementById('stream-overview-entry-frame')) return;
    status.textContent = 'Не удалось открыть обзор. Повторите загрузку или вернитесь в профиль.';
    retry.hidden = false;
  }, 12000);
}
function openStreamOverview() {
  if (!overviewCurrent(overviewIdentity)) return;
  let screen = document.getElementById('screen-stream-overview');
  if (!screen) {
    screen = document.createElement('div');
    screen.id = 'screen-stream-overview';
    screen.className = 'screen access-management-screen';
    screen.innerHTML = '<div class="screen-header"><div class="screen-title">Обзор потока</div><button type="button" class="screen-header-btn" id="overview-close">Назад</button></div><div class="overview-loading"><p id="overview-frame-status" role="status"></p><button type="button" id="overview-frame-retry" class="btn btn--outline" hidden>Повторить загрузку</button></div><iframe id="stream-overview-entry-frame" title="Анкеты, участие и обращения" hidden></iframe>';
    document.getElementById('screen-home').parentElement.append(screen);
    document.getElementById('overview-close').onclick = closeStreamOverview;
    document.getElementById('overview-frame-retry').onclick = loadStreamOverviewFrame;
  }
  goTo('stream-overview');
  loadStreamOverviewFrame();
}
function closeStreamOverview() {
  clearTimeout(overviewFrameTimer);
  const destination = screenStack.pop() || 'home';
  goTo(destination, true);
  document.getElementById('screen-stream-overview')?.remove();
  document.getElementById('stream-overview-entry-btn')?.focus({preventScroll:true});
}
window.addEventListener('message', event => {
  const frame = document.getElementById('stream-overview-entry-frame');
  if (!frame || event.source !== frame.contentWindow || event.origin !== location.origin ||
      event.data?.type !== 'telo-overview' || !['ready','error','revoked'].includes(event.data.state) ||
      currentScreen !== 'stream-overview' || !overviewCurrent(overviewIdentity)) return;
  clearTimeout(overviewFrameTimer);
  if (event.data.state === 'revoked') {
    closeStreamOverview();
    overviewIdentity = null;
    document.getElementById('stream-overview-entry-btn').hidden = true;
    const status = document.getElementById('stream-overview-entry-status');
    status.textContent = 'Доступ к обзору закрыт. Откройте приложение заново, если ваши права изменились.';
    status.hidden = false;
    return;
  }
  document.getElementById('overview-frame-status').hidden = true;
  document.getElementById('overview-frame-retry').hidden = true;
  frame.hidden = false;
});
