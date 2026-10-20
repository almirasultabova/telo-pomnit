from pathlib import Path
import hashlib,json
ROOT=Path(__file__).resolve().parents[2]
HERE=Path(__file__).parent
SOURCE=ROOT/'output/visual-consistency-JAPP149/source'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def public_sha(p):
    data=p.read_bytes()
    if p.suffix in ['.html','.css','.js','.txt','.svg','.json']:data=data.replace(b'\r\n',b'\n')
    return hashlib.sha256(data).hexdigest()
manifest=json.loads((HERE/'manifest.json').read_text())
baseline=json.loads((HERE/'baseline.json').read_text())
changed={row['file'] for row in manifest['changed']}
actual={name for name,h in baseline.items() if sha(SOURCE/name)!=h}
assert actual==changed,(actual,changed)
for row in manifest['changed']:
    assert sha(ROOT/row['file'])==sha(SOURCE/row['file'])==row['after'],row['file']
before=json.loads((HERE/'root-before.json').read_text())
root_changes={name for name,h in before.items() if sha(ROOT/name)!=h}
docs={'app/PRODUCT.md','app/DESIGN.md','app/CLAUDE.md'}
assert root_changes==changed|docs,root_changes
public={str(p.relative_to(SOURCE/'output/app')).replace('\\','/'):public_sha(p)for p in(SOURCE/'output/app').rglob('*')if p.is_file()}
published=json.loads((ROOT/'audit/ui-release-JAPP148/manifest.json').read_text())['publicAfter']
assert set(public)==set(published)
public_changes={name for name,h in public.items()if h!=published[name]}
expected={name.removeprefix('app/')for name in changed}|{'index.html','screen-review.html'}
assert public_changes==expected,(public_changes,expected)
assert len(public)==96
manifest['publicFiles']=public
manifest['unchangedOtherRootFiles']=len(before)-len(root_changes)
manifest['documentationChanged']=sorted(docs)
(HERE/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
tests=json.loads((HERE/'visual-results.json').read_text())
regression=json.loads((HERE/'regression147/ui-results.json').read_text())
result={'passed':True,'sourceChanged':sorted(changed),'rootDocumentationChanged':sorted(docs),'otherRootFilesUnchanged':len(before)-len(root_changes),'publicChanged':sorted(public_changes),'publicUnchanged':len(public)-len(public_changes),'newGroups':sum(len(r.get('groups',[]))+len(r.get('edgeGroups',[]))for r in tests),'regressionGroups':sum(len(r.get('groups',[]))+len(r.get('extra',[]))for r in regression),'published':False}
(HERE/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False))
