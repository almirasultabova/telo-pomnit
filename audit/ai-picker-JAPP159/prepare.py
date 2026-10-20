from pathlib import Path
import subprocess,shutil,json
R=Path(__file__).resolve().parents[2];C=R/'output/silk-launch-release';S=R/'output/ai-picker-JAPP159/source';H=Path(__file__).parent
assert not S.exists(),'Candidate already exists'
files=subprocess.check_output(['git','-C',str(C),'ls-files','-z']).decode().split('\0')
for f in files:
 if f and f.startswith(('app/','scripts/','site/','media/','backend/'))and(C/f).is_file():
  dest=S/f;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(C/f,dest)
p=S/'app/js/app.js';s=p.read_text(encoding='utf-8')
a="  const readable = document.createElement('div'); readable.id = 'ai-context-readable';"
b=a+" readable.tabIndex = -1; readable.setAttribute('role', 'region'); readable.setAttribute('aria-label', 'Выбранные записи');"
assert s.count(a)==1;s=s.replace(a,b)
a="      const choices = document.createElement('div'); choices.id = 'ai-context-choices';"
b="""      const count = document.createElement('p'); count.id = 'ai-context-count'; count.className = 'ai-selection-count'; count.setAttribute('role', 'status'); count.textContent = 'Выбрано: ' + aiContext.ids.length + ' из 5'; panel.append(count);
      const hint = document.createElement('p'); hint.id = 'ai-context-limit'; hint.className = 'ai-selection-hint'; hint.textContent = aiContext.ids.length >= 5 ? 'Чтобы выбрать другую запись, снимите одну отметку.' : 'Отметьте записи, которые хотите добавить в разговор.'; panel.append(hint);
      const choices = document.createElement('div'); choices.id = 'ai-context-choices'; choices.setAttribute('role', 'group'); choices.setAttribute('aria-label', 'Записи дневника');"""
assert s.count(a)==1;s=s.replace(a,b)
a="checkbox.checked = aiContext.ids.includes(entry.id); checkbox.disabled = aiPending;"
b="checkbox.checked = aiContext.ids.includes(entry.id); checkbox.disabled = aiPending || (!checkbox.checked && aiContext.ids.length >= 5); checkbox.setAttribute('aria-describedby', 'ai-context-count ai-context-limit');"
assert s.count(a)==1;s=s.replace(a,b)
a="          aiContext.ids = checkbox.checked ? [...aiContext.ids, entry.id] : aiContext.ids.filter(id => id !== entry.id); aiContext.preview = null; aiContext.reviewed = false; renderAiChat();"
b="""          const scroll = choices.scrollTop;
          aiContext.ids = checkbox.checked ? [...aiContext.ids, entry.id] : aiContext.ids.filter(id => id !== entry.id); aiContext.preview = null; aiContext.reviewed = false; renderAiChat();
          const updated = document.getElementById('ai-context-choices');
          if (updated) { updated.scrollTop = scroll; [...updated.querySelectorAll('input')].find(input => input.value === entry.id)?.focus({ preventScroll: true }); }"""
assert s.count(a)==1;s=s.replace(a,b)
a="          aiContext.preview = preview; aiContext.reviewed = false; renderAiChat();"
b=a+"\n          if (currentScreen === 'ai-chat') { const readable = document.getElementById('ai-context-readable'); readable?.focus({ preventScroll: true }); readable?.scrollIntoView({ block: 'start' }); }"
assert s.count(a)==1;s=s.replace(a,b);p.write_text(s,encoding='utf-8')
p=S/'app/css/styles.css';s=p.read_text(encoding='utf-8');needle='#ai-context-panel .ai-information {margin:0 0 8px;}';assert s.count(needle)==1
rules="""
/* J-APP-159: clear, stable selection of the existing five diary records. */
#ai-context-panel .ai-selection-count {margin:12px 0 4px;color:var(--color-action);font:600 14px/1.5 var(--font-body);font-variant-numeric:tabular-nums}
#ai-context-panel .ai-selection-hint {margin:0 0 12px;color:var(--color-muted);font:400 13px/1.5 var(--font-body)}
#ai-context-choices .privacy-context-choice {min-height:48px;box-sizing:border-box;margin:8px 0;padding:10px;gap:10px;border:1px solid var(--color-line);border-radius:12px;background:var(--color-paper);color:var(--color-text);cursor:pointer}
#ai-context-choices .privacy-context-choice:first-child {margin-top:0}
#ai-context-choices .privacy-context-choice:last-child {margin-bottom:0}
#ai-context-choices .privacy-context-choice:has(input:checked) {background:var(--color-sage);border-color:var(--color-action)}
#ai-context-choices .privacy-context-choice:has(input:disabled:not(:checked)) {background:var(--color-bg);color:var(--color-muted);cursor:default}
#ai-context-choices .privacy-context-choice:has(input:focus-visible),#ai-context-readable:focus-visible {outline:2px solid var(--color-action);outline-offset:2px}
#ai-context-choices input {margin-top:1px;accent-color:var(--color-action)}
#ai-context-choices .privacy-context-choice span {min-width:0;overflow-wrap:anywhere}
"""
p.write_text(s.replace(needle,needle+rules),encoding='utf-8');subprocess.run(['node','scripts/build-static.mjs'],cwd=S,check=True)
changed=[f for f in files if f and(S/f).is_file()and(S/f).read_bytes()!=(C/f).read_bytes()];assert sorted(changed)==['app/css/styles.css','app/js/app.js'],changed
(H/'baseline.json').write_text(json.dumps({'baseCommit':subprocess.check_output(['git','-C',str(C),'rev-parse','HEAD'],text=True).strip(),'sourceChanges':changed,'backendChanged':False,'apiChanged':False},indent=2),encoding='utf-8');print('PASS exact two existing sources; no backend/API/schema changes')
