from pathlib import Path
import shutil,re,json,hashlib
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'output/contrast-JAPP070';BASE=ROOT/'output/silk-launch-release/app'
OUT.mkdir(exist_ok=True)
for variant in ['before','after']:
 target=OUT/variant
 assert not target.exists(),'Preserve existing preview'
 shutil.copytree(BASE,target,ignore=shutil.ignore_patterns('.vercel-build'))
 s=(target/'index.html').read_text(encoding='utf-8')
 s=re.sub(r'<script src="js/(?:telegram-web-app|launch|screen-review)\.js(?:\?[^" ]*)?"></script>','',s)
 s=s.replace('<head>','<head><script src="js/screen-review-fixture.js"></script><style>#launch-overlay{display:none!important}</style>')
 s=s.replace('</body>','<script src="js/screen-review-frame.js"></script></body>')
 (target/'index.html').write_text(s,encoding='utf-8')
(OUT/'baseline.json').write_text(json.dumps({str(f.relative_to(BASE)):hashlib.sha256(f.read_bytes()).hexdigest()for f in BASE.rglob('*.css')},indent=2),encoding='utf-8')
print('Isolated before/after native UI with existing synthetic screen-review fixtures')
