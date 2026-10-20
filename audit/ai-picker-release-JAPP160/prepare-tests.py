from pathlib import Path
H=Path(__file__).parent;R=H.resolve().parents[1]
prefix="import sys,os\nfrom pathlib import Path\nsys.path.insert(0,str(Path(__file__).resolve().parents[1]/'ai-picker-JAPP159'))\n"
for name in['test-ui.py','test-edges.py']:
 t=(R/'audit/ai-picker-JAPP159'/name).read_text(encoding='utf-8').replace("'http://127.0.0.1:15359/'","os.environ.get('ORIGIN','https://tg-app-telo-pomnit.vercel.app/')")
 (H/name).write_text(prefix+t,encoding='utf-8')
