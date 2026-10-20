from pathlib import Path
import copy,asyncio,importlib.util
spec=importlib.util.spec_from_file_location('original_fixture147',Path(__file__).resolve().parents[1]/'ui-consistency-JAPP147/fixture.py')
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)

ROW={'id':'15300000-0000-4000-8000-000000000001','clientId':'15300000-0000-4000-8000-000000000002','kind':'analysis','meetingDate':'2026-10-15','text':'Учебная заметка после встречи. Мне важно дать себе время перед ответом.','stepText':'Давать себе паузу перед ответом.','stepPaused':False,'revision':1,'events':[],'createdAt':'2026-10-15T18:00:00Z','updatedAt':'2026-10-15T18:00:00Z'}

async def boot(browser,origin,width=390):
    p=await base.boot(browser,origin,width)
    p.row=copy.deepcopy(ROW);p.writes=[];p.fault='ok';p.gate=None;p.write_done=asyncio.Event()
    async def route(req):
        request=req.request;path=request.url.split('/api/',1)[-1].split('?')[0]
        if request.method=='GET':return await req.fulfill(json=[p.row]if path=='after-meeting-notes'else p.row)
        data=request.post_data_json;p.writes.append(copy.deepcopy(data))
        if p.gate:await p.gate.wait()
        if p.fault=='fail':return await req.fulfill(status=503,json={'error':'Учебный отказ соединения'})
        if data.get('revision')!=p.row['revision']:return await req.fulfill(status=409,json={'error':'Шаг изменился в другом окне.'})
        old=p.row['stepText']
        if 'stepText'in data:
            p.row['stepText']=data['stepText'];p.row['events'].append({'id':'fixture-change','type':'change','date':'2026-10-20T10:00:00Z','text':data['stepText'],'stepText':data['stepText'],'from':old})
        if 'stepPaused'in data:p.row['stepPaused']=data['stepPaused']
        p.row['revision']+=1
        result=copy.deepcopy(p.row)
        if p.fault=='bad-ack':result['stepText']='Другой текст'
        await req.fulfill(json=result)
        p.write_done.set()
    await p.route('**/api/after-meeting-notes**',route)
    await p.evaluate('(id)=>AfterMeeting.openStepById(id)',ROW['id'])
    return p
