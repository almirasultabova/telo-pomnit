from pathlib import Path
import subprocess,shutil,json
R=Path(__file__).resolve().parents[2];C=R/'output/silk-launch-release';S=R/'output/ai-history-ux-JAPP167/source';H=Path(__file__).parent
assert not S.exists()
files=subprocess.check_output(['git','-C',str(C),'ls-files','-z']).decode().split('\0')
for f in files:
 if f and f.startswith(('app/','scripts/','site/','media/','backend/'))and(C/f).is_file():
  d=S/f;d.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(C/f,d)
p=S/'app/js/app.js';s=p.read_text(encoding='utf-8')
def replace(a,b):
 global s
 assert s.count(a)==1,(a,s.count(a));s=s.replace(a,b)
replace('let aiScreenRequest = 0;','let aiScreenRequest = 0;\nlet aiHistoryLoading = false;')
replace("  aiScreenRequest++; aiSessionId = null; aiMessages = []; aiPending = false; aiSendError = '';","  aiScreenRequest++; aiHistoryLoading = false; setAiHistoryStatus(''); document.getElementById('ai-history-select')?.replaceChildren(new Option('Новый диалог','')); aiSessionId = null; aiMessages = []; aiPending = false; aiSendError = '';")
a=s.index('async function refreshAiScreen() {');b=s.index("\ndocument.getElementById('ai-access-refresh')",a)
s=s[:a]+'''function setAiHistoryStatus(text, retry = null) {
  const details = document.querySelector('.ai-history-disclosure'); if (!details) return;
  let status = document.getElementById('ai-history-status');
  if (!status) { status = document.createElement('p'); status.id = 'ai-history-status'; status.className = 'ai-history-status'; status.setAttribute('role','status'); details.insertBefore(status,document.getElementById('ai-access-refresh')); }
  status.textContent = text; status.hidden = !text;
  let button = document.getElementById('ai-history-retry');
  if (!button) { button = document.createElement('button'); button.id = 'ai-history-retry'; button.type = 'button'; button.className = 'btn btn--outline btn--sm'; button.textContent = 'Повторить загрузку'; status.after(button); }
  button.hidden = !retry; button.onclick = retry;
  if (text && details.open && currentScreen === 'ai-chat') (retry ? button : status).scrollIntoView({block:'nearest'});
}
function syncAiHistoryControls() {
  const select = document.getElementById('ai-history-select'), input = document.getElementById('ai-input');
  select.disabled = aiPending || aiHistoryLoading; input.disabled = aiHistoryLoading;
  select.setAttribute('aria-busy',String(aiHistoryLoading));
  document.getElementById('ai-access-refresh').disabled = aiPending || aiHistoryLoading;
  if (aiHistoryLoading) document.getElementById('ai-send-btn').disabled = true;
  if (aiHistoryLoading) document.querySelectorAll('#ai-delivery-actions button').forEach(button => { button.disabled = true; });
}
async function refreshAiScreen(event) {
  if (aiPending || aiHistoryLoading) return;
  const request = ++aiScreenRequest, generation = Storage._generation, owner = Storage._userId;
  const current = () => request === aiScreenRequest && generation === Storage._generation && owner === Storage._userId && !Api.clubBlocked;
  const restoreFocus = !!event?.currentTarget || ['ai-access-refresh','ai-history-retry'].includes(document.activeElement.id);
  aiHistoryLoading = true; setAiHistoryStatus('Загружаем историю…'); syncAiHistoryControls();
  try {
    await refreshProgramAccess(); if (!current()) return;
    renderAiChat();
    const sessions = await Api.getAiSessions(); if (!current()) return;
    const select = document.getElementById('ai-history-select'); select.replaceChildren(new Option('Новый диалог', ''));
    sessions.forEach(session => select.add(new Option(window.AiDelivery.label(session), session.sessionId)));
    if (aiSessionId && !sessions.some(session => session.sessionId === aiSessionId)) select.add(new Option('Открытый разговор',aiSessionId));
    select.value = aiSessionId || '';
    setAiHistoryStatus(sessions.length ? 'Выберите разговор из списка.' : 'Сохранённых разговоров пока нет.');
  } catch { if (current()) setAiHistoryStatus('Не удалось загрузить историю. Открытый разговор и текст в поле остались на месте.',refreshAiScreen); }
  finally { if (current()) { aiHistoryLoading = false; renderAiChat(); if (restoreFocus && currentScreen === 'ai-chat') document.getElementById('ai-access-refresh').focus({preventScroll:true}); } }
}
async function loadAiConversation(id) {
  if (aiPending || aiHistoryLoading || Api.clubBlocked) return;
  saveCurrentAiDraft();
  const request = ++aiScreenRequest, generation = Storage._generation, owner = Storage._userId;
  const current = () => request === aiScreenRequest && generation === Storage._generation && owner === Storage._userId && !Api.clubBlocked;
  const select = document.getElementById('ai-history-select'), messages = document.getElementById('ai-messages'), scroll = messages.scrollTop;
  if (!id) { aiSessionId = null; aiMessages = []; aiSessionContext = null; aiContext = { mode:'none',ids:[],preview:null,reviewed:false }; renderAiChat(); setAiHistoryStatus(aiAccessGranted === true ? 'Новый диалог. Можно написать сообщение.' : 'Новый диалог. Для отправки нужен доступ к AI.'); return; }
  let failed = false; aiHistoryLoading = true;
  setAiHistoryStatus(aiSessionId ? 'Открываем выбранный разговор… Пока виден предыдущий.' : 'Открываем выбранный разговор…'); syncAiHistoryControls();
  try {
    const session = await Api.getAiSession(id); if (!current()) return;
    aiSessionId = session.sessionId; aiMessages = Array.isArray(session.messages) ? session.messages : [];
    aiSessionContext = { mode:session.contextMode || 'legacy_unknown',snapshot:session.contextSnapshot || [],text:session.contextText || '',version:session.contextVersion };
    select.value = aiSessionId; setAiHistoryStatus('Разговор открыт.');
  } catch { if (current()) { failed = true; select.value = aiSessionId || ''; setAiHistoryStatus(aiSessionId ? 'Не удалось открыть выбранный разговор. На экране остался предыдущий.' : 'Не удалось открыть выбранный разговор. На экране остался новый диалог.',() => loadAiConversation(id)); } }
  finally { if (current()) { aiHistoryLoading = false; renderAiChat(); if (failed) messages.scrollTop = scroll; if (currentScreen === 'ai-chat') { const target=failed ? document.getElementById('ai-history-retry') : select; target.focus({preventScroll:true}); target.scrollIntoView({block:'nearest'}); } } }
}
''' +s[b:]
a=s.index("document.getElementById('ai-history-select')?.addEventListener('change'");b=s.index('\nfunction aiContextReady()',a)
s=s[:a]+"document.getElementById('ai-history-select')?.addEventListener('change', event => { void loadAiConversation(event.target.value); });\n"+s[b:]
replace("function aiContextReady() { return !!aiSessionId || aiContext.mode === 'none' || (!!aiContext.preview && aiContext.reviewed); }","function aiContextReady() { return !aiHistoryLoading && (!!aiSessionId || aiContext.mode === 'none' || (!!aiContext.preview && aiContext.reviewed)); }")
replace('  renderAiMessages();\n}', '  renderAiMessages();\n  syncAiHistoryControls();\n}')
p.write_text(s,encoding='utf-8')
p=S/'app/css/ux-personal.css';p.write_text(p.read_text(encoding='utf-8')+'''
/* J-APP-167: history status and retry within the established disclosure. */
#screen-ai-chat .ai-history-status{font:400 13px/1.55 var(--font-body);color:var(--color-action);margin:10px 0;padding-top:10px;border-top:1px solid var(--color-line);overflow-wrap:anywhere}
#screen-ai-chat #ai-history-retry{min-height:44px;margin:0 0 8px;font-size:13px}
#screen-ai-chat #ai-history-select:focus-visible,#screen-ai-chat #ai-history-retry:focus-visible{outline:2px solid var(--color-action);outline-offset:3px}
''',encoding='utf-8')
subprocess.run(['node','scripts/build-static.mjs'],cwd=S,check=True)
changed=[f for f in files if f and(S/f).is_file()and(S/f).read_bytes()!=(C/f).read_bytes()];assert sorted(changed)==['app/css/ux-personal.css','app/js/app.js'],changed
(H/'baseline.json').write_text(json.dumps({'baseCommit':subprocess.check_output(['git','-C',str(C),'rev-parse','HEAD'],text=True).strip(),'sourceChanges':changed,'backendChanged':False,'providerChanged':False},indent=2),encoding='utf-8')
