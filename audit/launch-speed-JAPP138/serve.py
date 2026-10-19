from pathlib import Path
import importlib.util, sys
import time
R=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('fixture',R/'audit/silk-launch-integration/preview.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.BUILD=R/('output/silk-launch-release/output/app' if '--before' in sys.argv else 'output/launch-speed-JAPP138/source/output/app')
port=int(sys.argv[sys.argv.index('--port')+1]) if '--port' in sys.argv else 11378
print(f'http://127.0.0.1:{port}/review',flush=True)
class Handler(m.Handler):
    def do_GET(self):
        if self.path.split('?')[0] == '/review-fast':
            html=Path(__file__).with_name('preview.html').read_bytes()
            self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8')
            self.send_header('Content-Length',str(len(html)));self.end_headers();self.wfile.write(html);return
        if self.path.split('?')[0].endswith('.mp4') and self.scenario() == 'slow':
            time.sleep(1.2)
        return super().do_GET()
m.ThreadingHTTPServer(('127.0.0.1',port),Handler).serve_forever()
