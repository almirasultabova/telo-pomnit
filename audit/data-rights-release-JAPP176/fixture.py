from pathlib import Path
import importlib.util,asyncio
R=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('export165',R/'audit/data-export-ux-JAPP165/fixture.py');export=importlib.util.module_from_spec(spec);spec.loader.exec_module(export)
async def boot(browser,origin,width=390):
 p=await export.boot(browser,origin,width);p.delete_calls=[];p.delete_gate=None;p.delete_mode='fail';p.delete_started=asyncio.Event()
 async def deletion(route):
  assert route.request.method=='DELETE';p.delete_calls.append(route.request.post_data_json);p.delete_started.set()
  if p.delete_gate:await p.delete_gate.wait()
  if p.delete_mode=='ok':return await route.fulfill(json={'ok':True})
  return await route.fulfill(status=503,json={'error':'Учебная ошибка: запрос не выполнен. Данные не удалены.'})
 await p.route('**/api/gdpr/delete-me',deletion)
 return p
