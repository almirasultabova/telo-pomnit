from pathlib import Path
import importlib.util
R=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('fixture',R/'audit/silk-launch-integration/preview.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.BUILD=R/'output/word-spacing-JAPP140/app'
print('http://127.0.0.1:11390/?scenario=return#tgWebAppPlatform=ios&tgWebAppVersion=8.0',flush=True)
m.ThreadingHTTPServer(('127.0.0.1',11390),m.Handler).serve_forever()
