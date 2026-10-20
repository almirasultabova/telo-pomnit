from pathlib import Path
H=Path(__file__).parent;R=H.parents[1];G=H/'regression';G.mkdir(exist_ok=True)
(G/'fixture.py').write_text("from pathlib import Path\nimport importlib.util\nspec=importlib.util.spec_from_file_location('regression161',Path(__file__).resolve().parents[2]/'discuss-ux-JAPP161/fixture.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\nboot=m.boot;TEXT=m.TEXT\n",encoding='utf-8')
for name in ['test-ui.py','test-edges.py']:
 t=(R/'audit/discuss-ux-JAPP161'/name).read_text(encoding='utf-8').replace('http://127.0.0.1:15361/','http://127.0.0.1:15369/');(G/name).write_text(t,encoding='utf-8')
