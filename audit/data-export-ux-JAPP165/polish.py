from pathlib import Path
import subprocess
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent;S=R/'output/data-export-ux-JAPP165/source'
for p in[S/'app/css/ux-personal.css',H/'prepare.py']:
 s=p.read_text(encoding='utf-8').replace('#screen-data-rights .pdf-ready-panel,#screen-history .pdf-ready-panel{padding:16px;', '#screen-data-rights .pdf-ready-panel{padding:16px 0;margin:12px 0 20px;border:0;border-top:1px solid var(--color-line);border-radius:0;background:transparent;color:var(--color-text)}\n#screen-history .pdf-ready-panel{padding:16px;');p.write_text(s,encoding='utf-8')
subprocess.run(['node','scripts/build-static.mjs'],cwd=S,check=True)
