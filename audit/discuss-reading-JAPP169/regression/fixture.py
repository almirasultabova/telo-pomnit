from pathlib import Path
import importlib.util
spec=importlib.util.spec_from_file_location('regression161',Path(__file__).resolve().parents[2]/'discuss-ux-JAPP161/fixture.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
boot=m.boot;TEXT=m.TEXT
