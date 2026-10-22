from pathlib import Path
import re,json,hashlib,urllib.parse
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent;C=R/'output/silk-launch-release'
assert (R/'app/PRODUCT.md').read_bytes()==(C/'app/PRODUCT.md').read_bytes()
checks=[]
for root in [R,C]:
 p=root/'app/PRODUCT.md';text=p.read_text(encoding='utf-8')
 assert '<!-- impeccable:product-schema 1 -->'in text and re.search(r'^## Platform\s+web\s*$',text,re.M)
 for raw in re.findall(r'\]\(([^\n]+?)\)',text):
  raw=raw.strip('<>');url=urllib.parse.unquote(raw.split('#')[0]);target=(p.parent/url).resolve();assert target.exists(),str(target);checks.append(str(target.relative_to(root)))
def hash(p):
 b=p.read_bytes()
 if p.suffix in ['.html','.js','.css','.svg','.txt','.json']:b=b.replace(b'\r\n',b'\n')
 return hashlib.sha256(b).hexdigest()
m=json.loads((R/'audit/service-panels-release-JAPP182/manifest.json').read_text(encoding='utf-8'))
actual={p.relative_to(C/'output/app').as_posix():hash(p)for p in sorted((C/'output/app').rglob('*'))if p.is_file()}
assert actual==m['publicAfter'];assert not any('PRODUCT' in p or p.endswith('.md')for p in actual)
result={'passed':True,'publicFiles':len(actual),'identicalToAcceptedJ181':True,'productDocumentPublic':False,'productLinksCheckedRootAndCheckout':len(checks),'snapshotSHA256':hashlib.sha256((H/'PRODUCT-before.md').read_bytes()).hexdigest()}
expected=json.loads((H/'checks.json').read_text(encoding='utf-8'));assert result['snapshotSHA256']==expected['beforeSHA256']
(H/'build-unchanged.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
(C/'audit/product-context-20261022/build-unchanged.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print('PASS product schema, all new product links, exact archive; all100 public hashes unchanged by documentation')
