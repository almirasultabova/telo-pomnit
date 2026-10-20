from pathlib import Path
import subprocess
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent;S=R/'output/ai-history-ux-JAPP167/source'
a="  if (aiHistoryLoading) document.getElementById('ai-send-btn').disabled = true;"
b=a+"\n  if (aiHistoryLoading) document.querySelectorAll('#ai-delivery-actions button').forEach(button => { button.disabled = true; });"
for p in[S/'app/js/app.js',H/'prepare.py']:
 s=p.read_text(encoding='utf-8');assert s.count(a)==1;p.write_text(s.replace(a,b),encoding='utf-8')
subprocess.run(['node','scripts/build-static.mjs'],cwd=S,check=True)
