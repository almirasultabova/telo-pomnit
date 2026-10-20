from pathlib import Path
import os
R=Path(__file__).resolve().parents[2]
source=(R/'audit/audit-release-JAPP109/test-startup.py').read_text(encoding='utf-8')
source=source.replace("root = Path(__file__).resolve().parents[2] / 'output/silk-launch-release'", "root = Path(__file__).resolve().parents[2] / 'output/motion-JAPP151/source'")
source=source.replace("'/diary?limit=90'", "'/diary?limit=91'").replace("'/checkins?limit=200'", "'/checkins?limit=201'")
source=source.replace("'/diary?limit=91': [],", "'/diary?limit=91': [], '/diary/days': {'timeZone':'Europe/Moscow','days':['2026-10-04']} if scenario in ('returning-user','blocked-storage') else {'timeZone':'Europe/Moscow','days':[]},")
os.environ['APP_TEST_BASE_URL']='http://127.0.0.1:15151/index.html?automation=1'
exec(compile(source,str(__file__),'exec'))
