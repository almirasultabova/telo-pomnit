from pathlib import Path
import subprocess,shutil,json
R=Path(__file__).resolve().parents[2];C=R/'output/silk-launch-release';S=R/'output/habitual-ux-JAPP163/source';H=Path(__file__).parent
assert not (S/'output/app').exists()
files=subprocess.check_output(['git','-C',str(C),'ls-files','-z']).decode().split('\0')
for f in files:
 if f and f.startswith(('app/','scripts/','site/','media/','backend/'))and(C/f).is_file():
  d=S/f;d.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(C/f,d)
p=S/'app/js/app.js';s=p.read_text(encoding='utf-8')
def replace(a,b,count=1):
 global s
 assert s.count(a)==count,(a,s.count(a));s=s.replace(a,b)
replace("let habitualView = 'summary';","let habitualView = 'summary';\nlet habitualAnswersReturn = null;")
replace("if (habitualView === 'quiz' && diag.current > 0) habitualPrevious();","if (habitualView === 'answers') returnHabitualResult();\n    else if (habitualView === 'quiz' && diag.current > 0) habitualPrevious();")
replace("if (activeTab === 'diag') renderMyPathTab();","if (activeTab === 'diag') renderMyPathTab({ background: true });",3)
replace("if (activeTab === 'diag') { void Storage.ensurePathPeriod(pathPeriodScope()); renderMyPathTab(); }","if (activeTab === 'diag') { void Storage.ensurePathPeriod(pathPeriodScope()); renderMyPathTab({ background: true }); }")
replace("function renderMyPathTab() {","function renderMyPathTab({ background = false } = {}) {\n  // Loading other data must not replace the question or answer list being read.\n  if (background && habitualView !== 'summary') return;")
replace('<button class="diag-result-retry" onclick="showHabitualAnswers()">','<button id="habitual-show-answers" class="diag-result-retry" onclick="showHabitualAnswers()">')
replace('function showDiagQuestion() {','function showDiagQuestion(focusChoice = null) {')
replace("  habitualView = 'quiz'; updateBackBtn();","  const scroll = container.scrollTop;\n  habitualView = 'quiz'; updateBackBtn();")
replace('<div class="diag-quiz-counter">','<div class="diag-quiz-counter" id="habitual-question-step">')
replace('<div class="diag-quiz-q">${escapeAccessText(q.text)}</div>','<h2 class="diag-quiz-q" id="habitual-question" tabindex="-1" aria-describedby="habitual-question-step">${escapeAccessText(q.text)}</h2>')
replace('onclick="renderMyPathTab()">Продолжить позже</button></div></div>`;','onclick="renderMyPathTab()">Продолжить позже</button></div></div>`;\n  container.scrollTop = focusChoice === null ? 0 : scroll;\n  (focusChoice === null ? container.querySelector(\'#habitual-question\') : container.querySelectorAll(\'.diag-quiz-option\')[focusChoice])?.focus({ preventScroll: true });')
replace('diag.answers[index] = value; Storage.saveHabitualDraft(diag.answers); showDiagQuestion();','diag.answers[index] = value; Storage.saveHabitualDraft(diag.answers); showDiagQuestion(value);')
replace("activeTab === 'diag' && !Storage.getHabitualDraft()) renderMyPathTab();","activeTab === 'diag' && habitualView === 'summary' && !Storage.getHabitualDraft()) renderMyPathTab();")
replace("generation === Storage._generation && activeTab === 'diag') renderMyPathTab();","generation === Storage._generation && activeTab === 'diag' && habitualView === 'summary') renderMyPathTab();")
a=s.index('function showHabitualAnswers() {');b=s.index('\n// ─── Зеркало',a)
s=s[:a]+'''function showHabitualAnswers() {
  const r = Storage.getHabitualResult(), container = document.getElementById('diag-tab-content'); if (!r || !container) return;
  habitualAnswersReturn = { owner: Storage._userId, generation: Storage._generation, scroll: container.scrollTop, open: !!container.querySelector('.habitual-result-disclosure')?.open };
  habitualView = 'answers'; updateBackBtn();
  container.innerHTML = `<div class="diag-result-card habitual-answer-review"><button class="diag-result-retry habitual-return-top" onclick="returnHabitualResult()">← К результату</button><h2 class="diag-result-name" id="habitual-answers-title" tabindex="-1">Ваши ответы</h2><ol class="habitual-answers">${Habitual.items.map((q, i) => `<li><p>${escapeAccessText(q.text)}</p><strong>${escapeAccessText(Habitual.choices[r.answers[i]])}</strong></li>`).join('')}</ol><button class="btn btn--primary" onclick="returnHabitualResult()">К результату</button></div>`;
  container.scrollTop = 0; container.querySelector('#habitual-answers-title').focus({ preventScroll: true });
}
function returnHabitualResult() {
  const restore = habitualAnswersReturn; habitualAnswersReturn = null;
  if (!restore || restore.owner !== Storage._userId || restore.generation !== Storage._generation) return;
  renderMyPathTab();
  const container = document.getElementById('diag-tab-content'), details = container?.querySelector('.habitual-result-disclosure');
  if (details) details.open = restore.open;
  if (container) { container.scrollTop = restore.scroll; container.querySelector('#habitual-show-answers')?.focus({ preventScroll: true }); }
}
''' + s[b:]
replace('function clearPrivateConversationState() {',"function clearPrivateConversationState() {\n  habitualAnswersReturn = null; habitualView = 'summary';")
p.write_text(s,encoding='utf-8')
p=S/'app/css/ux-diary-path.css';p.write_text(p.read_text(encoding='utf-8')+'''
/* J-APP-163: preserve survey reading and keyboard position. */
#tab-diag .diag-quiz-q{margin:0 0 20px}
#tab-diag #habitual-question:focus,#tab-diag #habitual-answers-title:focus{outline:none}
#tab-diag .habitual-return-top{display:flex;align-items:center;min-height:48px;margin:0 0 12px;padding:0;background:transparent;color:var(--color-action);border:0}
#tab-diag .habitual-answers{padding-left:24px;margin:20px 0}
#tab-diag .habitual-answers li{padding:0 0 16px;margin:0 0 16px;border-bottom:1px solid var(--color-line)}
#tab-diag .habitual-answers li p{margin:0 0 7px;font:400 14px/1.6 var(--font-body)}
#tab-diag .habitual-answers li strong{font:600 14px/1.6 var(--font-body);color:var(--color-action)}
#tab-diag .habitual-return-top:focus-visible,#tab-diag #habitual-show-answers:focus-visible{outline:2px solid var(--color-action);outline-offset:3px}
''',encoding='utf-8')
subprocess.run(['node','scripts/build-static.mjs'],cwd=S,check=True)
changed=[f for f in files if f and(S/f).is_file()and(S/f).read_bytes()!=(C/f).read_bytes()];assert sorted(changed)==['app/css/ux-diary-path.css','app/js/app.js'],changed
(H/'baseline.json').write_text(json.dumps({'baseCommit':subprocess.check_output(['git','-C',str(C),'rev-parse','HEAD'],text=True).strip(),'sourceChanges':changed,'backendChanged':False,'scoringChanged':False},indent=2),encoding='utf-8')
print('PASS exact two existing UI sources, scoring and backend unchanged')
