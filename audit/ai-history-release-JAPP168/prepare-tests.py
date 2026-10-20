from pathlib import Path
import shutil
H=Path(__file__).parent;R=H.parents[1];P=R/'audit/ai-history-ux-JAPP167'
shutil.copy2(P/'fixture.py',H/'fixture.py')
for name in ['test-ui.py','test-edges.py','test-controls.py','test-reading.py','test-long-ui.py','test-other-scroll.py']:
 s=(P/name).read_text(encoding='utf-8').replace('http://127.0.0.1:15367/','https://tg-app-telo-pomnit.vercel.app/');(H/name).write_text(s,encoding='utf-8')
s=(H/'test-ui.py').read_text(encoding='utf-8').replace('https://tg-app-telo-pomnit.vercel.app/','https://app.telo-pomnit.ru/').replace("[('chromium',320),('chromium',390),('chromium',1440),('webkit',320),('webkit',390)]","[('chromium',390)]").replace('.launch();p=',".launch(args=['--disable-http2']);p=").replace("H/'ui-results.json'","H/'reserve-ui.json'");(H/'test-reserve.py').write_text(s,encoding='utf-8')
