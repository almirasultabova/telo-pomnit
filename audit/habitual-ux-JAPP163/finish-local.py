from pathlib import Path
import subprocess,shutil
R=Path(__file__).resolve().parents[2];S=R/'output/habitual-ux-JAPP163/source';H=Path(__file__).parent
rule='#tab-diag #habitual-question:focus,#tab-diag #habitual-answers-title:focus{outline:none}\n'
p=S/'app/css/ux-diary-path.css';p.write_text(p.read_text(encoding='utf-8')+rule,encoding='utf-8')
p=H/'prepare.py';s=p.read_text(encoding='utf-8');needle='#tab-diag .diag-quiz-q{margin:0 0 20px}';s=s.replace(needle,needle+'\n'+rule.rstrip());p.write_text(s,encoding='utf-8')
shutil.copy2(S/'app/css/ux-diary-path.css',R/'app/css/ux-diary-path.css')
subprocess.run(['node','scripts/build-static.mjs'],cwd=S,check=True)
# Integration had already verified all other root sources; refresh the public hashes after polish.
import hashlib,json
def hashes(root):return {p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes().replace(b'\r\n',b'\n')if p.suffix in['.html','.css','.js','.svg','.txt','.json']else p.read_bytes()).hexdigest()for p in root.rglob('*')if p.is_file()}
(H/'manifest.json').write_text(json.dumps({'publicBefore':hashes(R/'output/silk-launch-release/output/app'),'publicAfter':hashes(S/'output/app')},indent=2),encoding='utf-8')
