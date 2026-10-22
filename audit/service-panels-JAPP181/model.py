from pathlib import Path
from urllib.parse import urlsplit,parse_qs
import copy,json
DATA=json.loads((Path(__file__).parent/'data.json').read_text(encoding='utf-8'))
class Model:
 def __init__(self,count=65,owner=True):
  self.people=copy.deepcopy(DATA['people'][:count]);self.streams=copy.deepcopy(DATA['streams']);self.actions={};self.calls=[];self.owner=owner;self.denied=False;self.confirm_error=0;self.open_error=0;self.list_error=0;self.applied_error=False;self.confirmed=0;self.auditRows=[];self.fail={};self.statsValues={}
 def respond(self,url,method='GET',body=None):
  u=urlsplit(url);path=u.path.removeprefix('/api');q=parse_qs(u.query);body=body or{};self.calls.append({'method':method,'path':path,'body':body})
  if path in self.fail:return self.fail[path],{'error':'Учебный сбой чтения раздела.'}
  if self.denied:return 403,{'error':'Учебный доступ отозван.'}
  if path=='/access-admin/session':return 200,{'owner':self.owner,'id':'demo-owner'}
  if path=='/access-admin/streams':return 200,self.streams
  if path=='/access-admin/users':
   if self.list_error:return self.list_error,{'error':'Учебный сбой загрузки списка.'}
   rows=self.people
   for key,field in [('status','accessStatus'),('role','role')]:
    if q.get(key):rows=[r for r in rows if r[field]==q[key][0]]
   if q.get('search'):rows=[r for r in rows if q['search'][0].removeprefix('@').lower()in(r['name']+' '+r['telegramUsername']).lower()]
   if q.get('stream'):rows=[r for r in rows if any(e['streamId']==q['stream'][0]for e in r['enrollments'])]
   page=int(q.get('page',['1'])[0]);return 200,{'items':copy.deepcopy(rows[(page-1)*30:page*30]),'total':len(rows),'page':page,'pageSize':30}
  if path=='/access-admin/audit':return 200,copy.deepcopy(self.auditRows)
  if path=='/access-admin/stats':return 200,{**{k:0 for k in ['pending','approved','rejected','entered','paid','free','diary','checkins','triggers']},'errors':[],**self.statsValues}
  if path=='/access-admin/actions'and method=='POST':
   if self.open_error:return self.open_error,{'error':'Учебный сбой проверки.'}
   key='draft-'+str(len(self.actions)+1);person=next(r for r in self.people if r['id']==body['targetId']);self.actions[key]={'id':key,'targetId':body['targetId'],'role':person['role'],'status':'approved','streamId':None,'basis':'none','used':False};return 200,copy.deepcopy(self.actions[key])
  if path.startswith('/access-admin/actions/'):
   key=path.split('/')[3];a=self.actions[key]
   if a['used']:return 409,{'error':'Решение устарело или уже принято. Обновите список.'}
   if method=='PATCH':
    a.update(body)
    if a['status']=='rejected':a.update(role=next(r['role']for r in self.people if r['id']==a['targetId']),streamId=None,basis='none')
    return 200,copy.deepcopy(a)
   if path.endswith('/confirm'):
    if self.confirm_error and not self.applied_error:return self.confirm_error,{'error':'Учебный сбой подтверждения.'}
    person=next(r for r in self.people if r['id']==a['targetId']);person.update(accessStatus=a['status'],role=a['role'],accessRevision=person['accessRevision']+1)
    if a['streamId']and a['basis']!='none':person['enrollments']=[{'streamId':a['streamId'],'status':'active','accessBasis':a['basis'],'paidAt':'2026-10-22T08:00:00Z'if a['basis']in ['paid','cash']else None,'stream':{'name':self.streams[0]['name']}}]
    a['used']=True;self.confirmed+=1
    if self.applied_error:return 503,{'error':'Учебный ответ потерялся после сохранения.'}
    return 200,{'ok':True,'after':{'status':a['status'],'role':a['role']}}
  return 404,{'error':'Неизвестный учебный маршрут.'}
