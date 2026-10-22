from pathlib import Path
import json,hashlib,subprocess,re
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent;C=R/'output/silk-launch-release';S=R/'output/service-panels-JAPP181/source';P=R/'audit/admission-release-JAPP180'
def sha(p):
 b=p.read_bytes()
 if p.suffix in ['.html','.js','.css','.svg','.txt','.json','.prisma','.sql']:b=b.replace(b'\r\n',b'\n')
 return hashlib.sha256(b).hexdigest()
def hashes(d):return {p.relative_to(d).as_posix():sha(p)for p in sorted(d.rglob('*'))if p.is_file()}
m=json.loads((P/'manifest.json').read_text(encoding='utf-8'));before=hashes(C/'output/app');after=hashes(S/'output/app')
assert before==m['publicAfter'];assert [p for p in after if after[p]!=before[p]]==['access-admin.html'];assert len(after)==100
base=subprocess.check_output(['git','-C',str(C),'rev-parse','HEAD'],text=True).strip();assert base=='8beffa9c8f711e6eb83abddc857abac665c157a0'
subprocess.run(['git','-C',str(C),'apply','--check',str(R/'audit/service-panels-JAPP181/candidate.patch')],check=True)
new=(S/'app/access-admin.html').read_bytes();old=(C/'app/access-admin.html').read_text(encoding='utf-8');newtext=new.decode('utf-8').replace('\r\n','\n')
assert re.findall(r'<style[^>]*>(.*?)</style>',old,re.S)==re.findall(r'<style[^>]*>(.*?)</style>',newtext,re.S)
assert all(x not in newtext for x in ['review-marks','data-review-case','synthetic-memory-token','#a66b16'])
m.update(label='JAPP182',previousCommit=base,publicBefore=before,publicAfter=after,changed=['access-admin.html'])
m['sourceBefore']['app/access-admin.html']=sha(C/'app/access-admin.html');m['sourceAfter']['app/access-admin.html']=sha(S/'app/access-admin.html')
(H/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2),encoding='utf-8')
for f in ['activate.cjs','verify-backup.cjs','verify-live.py','verify-api.py','verify-final.py','verify-no-marks.py']:
 (H/f).write_text((P/f).read_text(encoding='utf-8').replace('JAPP180','JAPP182').replace('japp180','japp182'),encoding='utf-8')
for f in ['model.py','data.json','tests.py']:(H/f).write_bytes((R/'audit/service-panels-JAPP181'/f).read_bytes())
t=(H/'tests.py').read_text(encoding='utf-8').replace('import asyncio,json,copy','import asyncio,json,copy,os').replace("b=await getattr(pw,engine).launch()","b=await getattr(pw,engine).launch(args=['--disable-http2']if engine=='chromium'and os.environ.get('J182_HTTP1')else [])").replace("(H/'checks.json')","(H/os.environ.get('J182_CHECKS','checks.json'))")
(H/'tests.py').write_text(t,encoding='utf-8');(H/'admission-tests.py').write_bytes((P/'tests.py').read_bytes())
f=(R/'audit/service-panels-JAPP181/fixture.py').read_text(encoding='utf-8').replace('import asyncio','import asyncio,os\nORIGIN=os.environ.get("J182_ORIGIN","http://127.0.0.1:16181").rstrip("/")').replace('await route.continue_()','await route.fallback()')
f=f.replace(" await p.route('**/*',boundary)"," async def harness(route):\n  await route.fulfill(content_type='text/html',body='<html><script>window.getAccessManagementToken=()=>\"synthetic-memory-token\"</script><style>body{margin:0}iframe{border:0;width:100%;height:100vh}</style><iframe src=\"/access-admin.html\"></iframe></html>')\n await p.route('**/__j180-harness*',harness)\n await p.route('**/*',boundary)").replace("'http://127.0.0.1:16181/harness?side='+side","ORIGIN+'/__j180-harness'")
(H/'fixture.py').write_text(f,encoding='utf-8')
(C/'app/access-admin.html').write_bytes(new)
print('PASS accepted single HTML transferred; 100-file manifest, unchanged CSS, protected files and test adapters prepared')
