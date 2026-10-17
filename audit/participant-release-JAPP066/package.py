from pathlib import Path
import tarfile
ROOT=Path(__file__).resolve().parents[2];HERE=Path(__file__).parent;OUT=ROOT/'output/participant-release-JAPP066';OUT.mkdir(exist_ok=True)
REL=ROOT/'output/silk-launch-release'
with tarfile.open(OUT/'release.tar.gz','w:gz')as tar:
 tar.add(REL/'backend/src/routes/admin.js',arcname='admin.js')
 tar.add(REL/'scripts/test-participant-card.cjs',arcname='scripts/test-participant-card.cjs')
 tar.add(HERE/'manifest.json',arcname='manifest.json');tar.add(HERE/'activate.cjs',arcname='activate.cjs')
print('One backend route; read-only fake-data test; no environment/schema/frontend package')
