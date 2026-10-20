from pathlib import Path
import subprocess
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent;S=R/'output/ai-history-ux-JAPP167/source'
for p in[S/'app/js/app.js',H/'prepare.py']:
 s=p.read_text(encoding='utf-8').replace('async function refreshAiScreen() {','async function refreshAiScreen(event) {').replace("const restoreFocus = ['ai-access-refresh','ai-history-retry'].includes(document.activeElement.id);","const restoreFocus = !!event?.currentTarget || ['ai-access-refresh','ai-history-retry'].includes(document.activeElement.id);")
 p.write_text(s,encoding='utf-8')
subprocess.run(['node','scripts/build-static.mjs'],cwd=S,check=True)
