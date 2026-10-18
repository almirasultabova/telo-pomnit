from pathlib import Path
import shutil, re, hashlib, json

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/checkin-draft-JAPP072'
OUT.mkdir(exist_ok=True)
PUBLIC = OUT / 'public'
shutil.copytree(ROOT / 'app', PUBLIC, dirs_exist_ok=True, ignore=shutil.ignore_patterns('.vercel-build'))
html = (PUBLIC / 'index.html').read_text(encoding='utf-8')
html = re.sub(r'<script src="js/(?:telegram-web-app|launch)\.js(?:\?[^" ]*)?"></script>', '', html)
html = html.replace('<head>', '<head><script src="/fixture.js"></script><style>#launch-overlay{display:none!important}</style>')
(PUBLIC / 'index.html').write_text(html, encoding='utf-8')
server = (ROOT / 'audit/participant-journey-JAPP069/server.cjs').read_text(encoding='utf-8')
server = server.replace('output/participant-journey-JAPP069/public', 'output/checkin-draft-JAPP072/public')
server = server.replace('8916', '8919')
# The server is placed at the same depth as its reused, already isolated fixture.
(OUT / 'server.cjs').write_text(server, encoding='utf-8')
(OUT / 'source.json').write_text(json.dumps({p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest()
    for p in ['app/js/app.js', 'app/js/storage.js', 'app/js/boot.js']}, indent=2), encoding='utf-8')
print('Prepared local synthetic fixture on 8919. No real database/provider/notifications.')
