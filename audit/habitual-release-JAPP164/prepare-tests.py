from pathlib import Path
import shutil
H=Path(__file__).parent;R=H.parents[1];P=R/'audit/habitual-ux-JAPP163'
shutil.copy2(P/'fixture.py',H/'fixture.py')
s=(P/'test-ui.py').read_text(encoding='utf-8').replace("ORIGIN='http://127.0.0.1:15363/'","ORIGIN='https://tg-app-telo-pomnit.vercel.app/'")
(H/'test-ui.py').write_text(s,encoding='utf-8')
s=s.replace("ORIGIN='https://tg-app-telo-pomnit.vercel.app/'","ORIGIN='https://app.telo-pomnit.ru/'").replace("[('chromium',320),('chromium',390),('chromium',1440),('webkit',320),('webkit',390)]","[('chromium',390)]").replace(".launch();p=", ".launch(args=['--disable-http2']);p=").replace("H/'ui-results.json'","H/'reserve-ui.json'")
(H/'test-reserve.py').write_text(s,encoding='utf-8')
s=(P/'test-edges.py').read_text(encoding='utf-8').replace('http://127.0.0.1:15363/','https://tg-app-telo-pomnit.vercel.app/')
a=s.index('  b=await pw.chromium.launch();p=await b.new_page');b=s.index(" (H/'edge-results.json')",a);s=s[:a]+s[b:];s=s.replace(' and HTTP-only before/after preview',' on published main')
(H/'test-edges.py').write_text(s,encoding='utf-8');print('Prepared main50+10 and reserve10 synthetic UI groups')
