from pathlib import Path
import difflib,shutil
R=Path(__file__).resolve().parents[2];C=R/'output/silk-launch-release';S=R/'output/habitual-ux-JAPP163/source';H=Path(__file__).parent
patch=''
for f in ['app/js/app.js','app/css/ux-diary-path.css']:
 patch+=''.join(difflib.unified_diff((C/f).read_text(encoding='utf-8').splitlines(True),(S/f).read_text(encoding='utf-8').splitlines(True),fromfile='a/'+f,tofile='b/'+f))
(H/'candidate.patch').write_text(patch,encoding='utf-8');shutil.copy2(H/'candidate.patch',C/'audit/habitual-ux-JAPP163/candidate.patch')
