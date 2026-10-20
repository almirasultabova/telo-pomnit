from pathlib import Path
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent
prefix="import sys,os\nfrom pathlib import Path\nsys.path.insert(0,str(Path(__file__).resolve().parents[1]/'ui-consistency-JAPP147'))\n"
t=(R/'audit/ui-consistency-JAPP147/test-ui.py').read_text(encoding='utf-8').replace("ORIGIN='http://127.0.0.1:14847/';RESULTS=[]","ORIGIN=os.environ.get('ORIGIN','https://tg-app-telo-pomnit.vercel.app/');RESULTS=[]\nHERE=Path(__file__).parent")
(H/'test-ui.py').write_text(prefix+t,encoding='utf-8')
