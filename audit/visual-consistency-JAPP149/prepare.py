"""Apply the scoped CSS candidate to a copy of the published J-APP-148 source."""
from pathlib import Path
import re, json

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'output/visual-consistency-JAPP149/source'
CSS = SOURCE / 'app/css'
REMOVED = []

def remove_rules(text, filename, selectors):
    for selector in selectors:
        pattern = re.compile(re.escape(selector) + r'\s*\{[^{}]*\}')
        text, count = pattern.subn('', text)
        if not count:
            raise ValueError(f'Missing rule {filename}: {selector}')
        REMOVED.append({'file': filename, 'selector': selector, 'rules': count})
    return text

def save(name, text):
    (CSS / name).write_text(text, encoding='utf-8', newline='\n')

name = 'styles.css'
s = (CSS/name).read_text(encoding='utf-8-sig')
# Exact shared selectors only. Feature-specific compositions stay in their files.
selectors = [
    '.screen-title', '.btn', '.btn:active', '.btn--primary', '.btn--primary:active',
    '.btn--primary:disabled', '.btn--accent', '.btn--outline', '.btn--ghost',
    '.btn--sm', '.btn--primary, .btn--accent', '.btn--primary:active, .btn--accent:active',
    '.btn:disabled', '.note-textarea', '.note-textarea:focus', '.note-textarea::placeholder',
    '.fb-textarea', '.fb-textarea:focus', '.fb-textarea::placeholder', '.fb-section-label',
    '.tab-pane:not(#tab-main) > .screen-header .screen-title',
    '#screen-body-map .screen-title', '#screen-ai-chat .screen-title',
    '#tab-profile > .screen-header .screen-title',
    '.note-textarea,#screen-trigger textarea,#screen-checkin textarea',
    '.note-textarea::placeholder,#screen-trigger textarea::placeholder,#screen-checkin textarea::placeholder',
    '#screen-trigger .section-label,#screen-checkin .section-label',
    '#screen-trigger .section-label.mt-16,#screen-checkin .section-label.mt-16',
    '#screen-trigger .optional-hint,#screen-checkin .optional-hint',
    '#screen-trigger .screen-bottom .btn,#screen-checkin .screen-bottom .btn',
    '#screen-trigger .screen-bottom .btn:disabled', '.fb-routing',
]
# A selector must start after a rule boundary; never match a suffix in another selector.
def boundary_remove(text, selectors):
    for selector in selectors:
        pattern = re.compile(r'(?<=[\n{}])\s*' + re.escape(selector) + r'\s*\{[^{}]*\}')
        text, count = pattern.subn('\n', text)
        if not count: raise ValueError(f'Missing styles.css rule: {selector}')
        REMOVED.append({'file': name, 'selector': selector, 'rules': count})
    return text
s = boundary_remove(s, selectors)
s = s.replace('  min-height: 58px;\n}', '  min-height: 58px;\n  color: var(--color-text);\n}', 1)
s = s.replace('.sensation-label { font-size: 14px; font-weight: 500; color: var(--tg-text); }', '.sensation-label { font-size: 14px; font-weight: 500; color: inherit; }')
s = s.replace('overflow-wrap:anywhere;font-size:32px;', 'overflow-wrap:anywhere;')
s = s.replace('.meeting-detail-section-label,.fb-section-label,.result-section-label', '.meeting-detail-section-label,.result-section-label')
s = s.replace('  --color-paper: #FCFAF6;', '''  --color-paper: #FCFAF6;
  /* J-APP-149: common working controls; feature compositions remain scoped. */
  --color-field: #FFFDFA;
  --control-radius: 16px;
  --control-height: 52px;
  --control-height-compact: 44px;
  --title-task-size: 28px;
  --title-page-size: 36px;''')
# Keep the primary input dimensions; surface, type and focus now have one owner.
s = s.replace('#screen-trigger textarea,#screen-checkin textarea {min-height:130px;padding:16px;color:var(--color-text);background:var(--color-paper);border:1px solid var(--color-control-line);box-shadow:none;}', '#screen-trigger textarea,#screen-checkin textarea {min-height:130px;}')
s = re.sub(r'@media\s*\([^{}]+\)\s*\{\s*\}', '', s)
save(name, s)

name = 'form-layout.css'
s = (CSS/name).read_text(encoding='utf-8-sig')
s = remove_rules(s, name, [
    '#screen-feedback .fb-textarea:focus-visible',
    ':is(#screen-sensations,#screen-note,#screen-trigger,#screen-trigger-note,#screen-checkin,#screen-diag-quiz,#screen-feedback) .screen-title'
])
s = s.replace('/* J-APP-070: restore the keyboard ring after the feedback field\'s legacy focus reset. */\n', '')
save(name, s)

name = 'ux-diary-path.css'
s = (CSS/name).read_text(encoding='utf-8-sig')
s = remove_rules(s, name, ['#tab-diary .screen-title,#tab-diag .screen-title'])
save(name, s)

name = 'ux-personal.css'
s = (CSS/name).read_text(encoding='utf-8-sig')
s = remove_rules(s, name, ['#tab-profile > .screen-header .screen-title', '#screen-ai-chat .screen-title'])
save(name, s)

name = 'light-sections.css'
s = (CSS/name).read_text(encoding='utf-8-sig')
s = s.replace('font:500 36px/1.05 var(--font-serif);color:#2a4a38', 'font:500 var(--title-page-size)/1.1 var(--font-serif);color:var(--color-action)')
save(name, s)

name = 'form-consistency.css'
s = (CSS/name).read_text(encoding='utf-8-sig')
s = s.replace('/* J-APP-147: shared recovery and compact form details in the accepted visual system. */', '''/* J-APP-149: single shared rule set, replacing the scattered legacy definitions.
   Ordinary controls share geometry and states; photo actions, rows, choices,
   questionnaire footers and other feature compositions retain their own rules. */
.screen-title {
  min-width: 0;
  font: 500 var(--title-task-size)/1.15 var(--font-serif);
  font-style: normal;
  color: var(--color-action);
  letter-spacing: -.025em;
  text-wrap: balance;
  overflow-wrap: anywhere;
}
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: var(--control-height);
  max-width: 100%;
  padding: 14px 18px;
  border-radius: var(--control-radius);
  font: 500 15px/1.4 var(--font-body);
  letter-spacing: -.01em;
  overflow-wrap: anywhere;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background var(--duration-fast), opacity var(--duration-fast), transform var(--duration-fast);
}
.btn--primary, .btn--accent { background: var(--color-action); color: var(--color-bg); box-shadow: none; }
.btn--outline { background: transparent; color: var(--color-action); border: 1px solid var(--color-action); }
.btn--ghost { background: var(--color-surface); color: var(--color-text); }
.btn--sm { min-height: var(--control-height-compact); padding: 10px 18px; font-size: 14px; }
.btn:active:not(:disabled) { transform: scale(.985); }
.btn:disabled { background: var(--color-sage); color: var(--color-action); opacity: 1; cursor: default; transform: none; box-shadow: none; }
.btn[aria-busy="true"] { cursor: wait; }
:is(.note-textarea, .fb-textarea) {
  display: block;
  width: 100%;
  min-height: 160px;
  padding: var(--space-4);
  border: 1px solid var(--color-control-line);
  border-radius: var(--control-radius);
  background: var(--color-field);
  color: var(--color-text);
  font: 400 16px/1.6 var(--font-body);
  caret-color: var(--color-action);
  resize: none;
  -webkit-user-select: text;
  user-select: text;
}
.fb-textarea { resize: vertical; }
:is(.note-textarea, .fb-textarea)::placeholder { color: var(--color-muted); opacity: 1; }
:is(.note-textarea, .fb-textarea):focus { border-color: var(--color-action); outline: 2px solid var(--color-action); outline-offset: 3px; box-shadow: none; }
:is(#screen-trigger, #screen-checkin) .section-label, .fb-section-label {
  display: block;
  margin: 0 0 var(--space-2);
  font: 500 15px/1.45 var(--font-body);
  color: var(--color-gold);
  text-transform: none;
  letter-spacing: 0;
}
:is(#screen-trigger, #screen-checkin) .section-label.mt-16 { margin-top: var(--space-6); }
:is(#screen-trigger, #screen-checkin, #screen-feedback) .optional-hint { display: inline-block; margin-left: 6px; color: var(--color-muted); font: 400 12px/1.5 var(--font-body); }
.fb-routing { display: block; width: 100%; min-height: 48px; padding: 11px 13px; margin: 0 0 var(--space-6); border: 1px solid var(--color-control-line); border-radius: var(--control-radius); background: var(--color-field); color: var(--color-text); font: 400 16px/1.5 var(--font-body); }

/* J-APP-147: shared recovery and compact form details. */''')
save(name, s)
(ROOT/'audit/visual-consistency-JAPP149/consolidated-rules.json').write_text(json.dumps(REMOVED, ensure_ascii=False, indent=2), encoding='utf-8')
print('Consolidated', sum(x['rules'] for x in REMOVED), 'legacy rules across six existing CSS files.')
