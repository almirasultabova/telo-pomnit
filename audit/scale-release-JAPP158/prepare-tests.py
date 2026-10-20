from pathlib import Path
H=Path(__file__).parent;R=H.resolve().parents[1]
t=(R/'audit/scale-touch-JAPP157/test-ui.py').read_text(encoding='utf-8').replace('import sys,asyncio,json','import sys,asyncio,json,os').replace("'http://127.0.0.1:15357/'","os.environ.get('ORIGIN','https://tg-app-telo-pomnit.vercel.app/')")
(H/'test-ui.py').write_text(t,encoding='utf-8')
prefix="import sys\nfrom pathlib import Path\nsys.path.insert(0,str(Path(__file__).resolve().parents[1]/'ui-consistency-JAPP147'))\n"
t=(R/'audit/ui-consistency-JAPP147/test-ui.py').read_text(encoding='utf-8').replace("ORIGIN='http://127.0.0.1:14847/';RESULTS=[]","ORIGIN='https://tg-app-telo-pomnit.vercel.app/';RESULTS=[]\nHERE=Path(__file__).parent").replace("HERE/'ui-results.json'","HERE/'regression-results.json'")
(H/'regression147.py').write_text(prefix+t,encoding='utf-8')
