from pathlib import Path
import shutil, subprocess, json

R = Path(__file__).resolve().parents[2]
A = Path(__file__).parent
C = R / 'output/silk-launch-release'
P = R / 'output/launch-speed-JAPP138'
S = P / 'source'
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=C,text=True).strip() == 'c28b7d45fd1f3ab911c2f31ef96cf0b26c1abac6'
for directory in ['app','scripts','site','media/app','media/shared','media/site']:
    shutil.copytree(C/directory,S/directory,dirs_exist_ok=True)
css = S/'app/css/launch.css'
css.write_text(css.read_text(encoding='utf-8').replace('object-fit:contain','object-fit:cover'),encoding='utf-8',newline='\n')
js = S/'app/js/launch.js'
code = js.read_text(encoding='utf-8')
code = code.replace("video.addEventListener('error', imageFallback);", "video.addEventListener('error', () => { if (started) imageFallback(); });")
code = code.replace("      layer.dataset.aspect = layer.clientHeight / Math.max(1, layer.clientWidth) >= 1.95 ? 'tall' : 'standard';\n",'')
old = """      video.src = layer.dataset.aspect === 'tall'
        ? '/media/app/launch/flower-tall.mp4?v=silk-native-20261014'
        : '/media/app/launch/flower-720.mp4?v=silk-native-20261014';
      video.muted = true; video.defaultMuted = true; video.playsInline = true;
"""
assert old in code
code = code.replace(old,'')
code = code.replace("      video.play().catch(imageFallback);", "      if (video.error) imageFallback();\n      else video.play().catch(imageFallback);")
insert = """    layer.dataset.aspect = layer.clientHeight / Math.max(1, layer.clientWidth) >= 1.95 ? 'tall' : 'standard';
    video.muted = true; video.defaultMuted = true; video.playsInline = true;
    video.src = layer.dataset.aspect === 'tall'
      ? '/media/app/launch/flower-fast-tall.mp4?v=JAPP138'
      : '/media/app/launch/flower-fast-standard.mp4?v=JAPP138';
    video.load();
"""
code = code.replace("    document.getElementById('launch-status')?.removeAttribute('hidden');", insert+"    document.getElementById('launch-status')?.removeAttribute('hidden');")
js.write_text(code,encoding='utf-8',newline='\n')
html = S/'app/index.html'
html.write_text(html.read_text(encoding='utf-8').replace('launch.css?v=silk-20261014','launch.css?v=JAPP138').replace('launch.js?v=silk-return-25-20261014','launch.js?v=JAPP138'),encoding='utf-8',newline='\n')
records=[]
for mode,source in [('standard','flower-720.mp4'),('tall','flower-tall.mp4')]:
    dest=S/'media/app/launch'/f'flower-fast-{mode}.mp4'
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(C/'media/app/launch'/source),'-t','4.2','-vf','scale=540:-2:flags=lanczos,fps=24','-c:v','libx264','-profile:v','baseline','-level','3.1','-preset','slow','-crf','25','-pix_fmt','yuv420p','-movflags','+faststart','-an',str(dest)],check=True)
    records.append({'file':dest.name,'before':(C/'media/app/launch'/source).stat().st_size,'after':dest.stat().st_size})
subprocess.run(['node','scripts/build-static.mjs'],cwd=S,check=True)
(A/'media-sizes.json').write_text(json.dumps(records,indent=2),encoding='utf-8')
print(json.dumps(records,indent=2))
