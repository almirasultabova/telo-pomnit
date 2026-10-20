from pathlib import Path
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent;S=R/'audit/route-polish-JAPP153'
prefix="import sys,os\nfrom pathlib import Path\nsys.path.insert(0,str(Path(__file__).resolve().parents[1]/'route-polish-JAPP153'))\n"
t=(S/'test-drafts.py').read_text(encoding='utf-8').replace("ORIGIN='http://127.0.0.1:15353/'","ORIGIN=os.environ.get('ORIGIN','https://tg-app-telo-pomnit.vercel.app/')").replace("                if engine=='chromium':await baseline(browser)",'')
(H/'test-drafts.py').write_text(prefix+t,encoding='utf-8')
t=(S/'test-route.py').read_text(encoding='utf-8').replace("'http://127.0.0.1:15353/'","os.environ.get('ORIGIN','https://tg-app-telo-pomnit.vercel.app/')")
(H/'test-route.py').write_text(prefix+t,encoding='utf-8')
