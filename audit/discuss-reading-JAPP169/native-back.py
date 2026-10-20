from pathlib import Path
import subprocess,json
R=Path(__file__).resolve().parents[2];H=Path(__file__).parent;S=R/'output/discuss-reading-JAPP169/source'
p=S/'app/js/discussion-notes.js';s=p.read_text(encoding='utf-8')
a='  let listReturn=null,detailReturn=null;';b='  let listReturn=null,detailReturn=null,listView=false;';assert s.count(a)==1;s=s.replace(a,b)
a='function view(title,backFn){heading.textContent=title;';b='function view(title,backFn){listView=false;heading.textContent=title;';assert s.count(a)==1;s=s.replace(a,b)
a="view('К разбору',()=>{goBack();switchTab('diary');});";b=a+'listView=true;';assert s.count(a)==1;s=s.replace(a,b)
a='window.DiscussionNotes={refresh,invalidate};';b="window.DiscussionNotes={refresh,invalidate,back(){if(currentScreen!=='discuss'||!ownerNow()||ownerNow()!==owner)return false;if(busy)return true;if(listView)return false;back.click();return true;}};";assert s.count(a)==1;s=s.replace(a,b);p.write_text(s,encoding='utf-8')
p=S/'app/js/app.js';s=p.read_text(encoding='utf-8');a="  if (currentScreen === 'home' && activeTab === 'diag' && habitualView !== 'summary') {";b="  if (currentScreen === 'discuss' && window.DiscussionNotes?.back()) return;\n"+a;assert s.count(a)==1;s=s.replace(a,b);p.write_text(s,encoding='utf-8')
subprocess.run(['node','scripts/build-static.mjs'],cwd=S,check=True)
p=H/'source-baseline.json';m=json.loads(p.read_text(encoding='utf-8'));m['sourceChanges'].append('app/js/app.js');m['nativeBackUsesSameLocalRoute']=True;p.write_text(json.dumps(m,indent=2),encoding='utf-8')
