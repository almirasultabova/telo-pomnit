from pathlib import Path
import subprocess,json,hashlib,sys
ROOT=Path(__file__).resolve().parents[2];HERE=Path(__file__).parent
assert '--live-confirmed' in sys.argv,'A new paid request requires explicit authorization; pass --live-confirmed only then'
command=['ssh','-i','C:/tmp/beget_key','-o','BatchMode=yes','-o','ConnectTimeout=15','root@45.11.93.236','node /root/telo-japp073-release/ai-probe.cjs --live-confirmed']
# Only redacted metadata and the fictional reply can leave the private process.
result=subprocess.run(command,capture_output=True,text=True,encoding='utf-8',timeout=60)
try:data=json.loads(result.stdout.strip())
except ValueError:raise SystemExit('Probe did not return structured metadata; raw diagnostics not printed')
for f,h in data.get('hashes',{}).items():
    assert hashlib.sha256((ROOT/'output/silk-launch-release/backend'/f).read_bytes().replace(b'\r\n',b'\n')).hexdigest()==h,'Installed route drift: '+f
(HERE/'ai-result.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(data,ensure_ascii=False,indent=2))
raise SystemExit(result.returncode)
