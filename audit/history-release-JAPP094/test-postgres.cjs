// Isolated PostgreSQL and native routes. No production rows, bot, OpenAI or notifications.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),{randomBytes,randomUUID}=require('node:crypto');
const stage=__dirname,live='/var/www/telo-pomnit/backend',base=stage+'/backend',configFile=stage+'/test-private.json';
const migration=base+'/prisma/migrations/20261018172000_diary_important/migration.sql';
function run(cmd,args,env=process.env){const r=spawnSync(cmd,args,{env,encoding:'utf8',maxBuffer:16e6});if(r.status!==0){fs.writeFileSync(stage+'/private-test-error.log',r.stdout+'\n'+r.stderr,{mode:0o600});throw Error(cmd+' failed; diagnostics private')}return r.stdout}
function pg(url){const u=new URL(url);return {...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGDATABASE:u.pathname.slice(1),PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGOPTIONS:'-c lock_timeout=5000 -c statement_timeout=30000',...(u.searchParams.has('sslmode')?{PGSSLMODE:u.searchParams.get('sslmode')}:{})}}
function config(){const c=JSON.parse(fs.readFileSync(configFile));assert(/^telo_japp094_[a-f0-9]{12}$/.test(c.name));assert.equal(new URL(c.url).pathname,'/'+c.name);return c}
async function main(){
 const env={};require(live+'/node_modules/dotenv').config({path:live+'/.env',processEnv:env,quiet:true});
 if(process.argv.includes('--prepare')){
  assert(!fs.existsSync(configFile));const name='telo_japp094_'+randomBytes(6).toString('hex'),password=randomBytes(24).toString('hex');
  const c={name,url:`postgresql://${name}:${password}@127.0.0.1:5432/${name}?connection_limit=8`};
  assert.notEqual(new URL(env.DIRECT_URL||env.DATABASE_URL).pathname,'/'+name);
  fs.writeFileSync(configFile,JSON.stringify(c),{mode:0o600});
  run('pg_dump',['--schema-only','--no-owner','--no-privileges','--file='+stage+'/baseline-schema.sql'],pg(env.DIRECT_URL||env.DATABASE_URL));
  run('runuser',['-u','postgres','--','psql','-v','ON_ERROR_STOP=1','-c',`CREATE ROLE ${name} LOGIN PASSWORD '${password}'`]);
  run('runuser',['-u','postgres','--','createdb','--owner='+name,name]);
  run('psql',['-v','ON_ERROR_STOP=1','-f',stage+'/baseline-schema.sql'],pg(c.url));
  run('psql',['-v','ON_ERROR_STOP=1','-f',migration],pg(c.url));
  const schema=fs.readFileSync(base+'/prisma/schema.prisma','utf8').replace('provider = "prisma-client-js"','provider = "prisma-client-js"\n  output = "'+stage+'/test-client"');
  fs.writeFileSync(stage+'/test-schema.prisma',schema);
  run('node',[live+'/node_modules/prisma/build/index.js','generate','--schema',stage+'/test-schema.prisma'],{...process.env,DATABASE_URL:c.url,DIRECT_URL:c.url});
  console.log('PASS schema-only clone, exact additive migration, isolated Prisma client; no personal rows copied');return;
 }
 const c=config();
 if(process.argv.includes('--cleanup')){
  run('runuser',['-u','postgres','--','dropdb','--if-exists',c.name]);
  run('runuser',['-u','postgres','--','psql','-v','ON_ERROR_STOP=1','-c',`DROP ROLE ${c.name}`]);fs.unlinkSync(configFile);console.log('PASS disposable database/role/private credentials removed');return;
 }
 Object.assign(process.env,{DATABASE_URL:c.url,DIRECT_URL:c.url,JWT_SECRET:randomBytes(32).toString('hex'),BOT_TOKEN:'',ADMIN_TELEGRAM_IDS:'900003'});
 let external=0;global.fetch=async()=>{external++;throw Error('External calls forbidden')};
 const {PrismaClient}=require(stage+'/test-client'),db=new PrismaClient({datasources:{db:{url:c.url}}});
 db.$on('error',e=>fs.writeFileSync(stage+'/private-query-error.log',e.message,{mode:0o600}));
 const runtime=process.argv.includes('--installed')?live:base;
 require.cache[require.resolve(runtime+'/src/db.js')]={exports:db};
 const app=require(live+'/node_modules/fastify')({logger:false});
 app.register(require(runtime+'/src/routes/after-meeting.js'));
 app.register(require(runtime+'/src/routes/diary-history.js'));
 app.register(require(runtime+'/src/routes/gdpr.js'),{prefix:'/gdpr'});
 const auth=require(runtime+'/src/services/auth.js');
 const users=[];
 try{
  assert.equal((await db.$queryRawUnsafe('SELECT current_database() AS name'))[0].name,c.name);
  for(const model of ['diaryImportant','afterMeetingNote','diaryEntry','checkin','triggerEntry'])await db[model].deleteMany();await db.user.deleteMany();
  for(let i=0;i<5;i++)users.push(await db.user.create({data:{id:randomUUID(),telegramId:BigInt(900001+i),accessStatus:i===3?'pending':'approved',deletedAt:i===4?new Date():null,consentGivenAt:new Date()}}));
  const token=i=>auth.createToken(users[i].id,users[i].tokenVersion);
  const request=(method,url,payload,i=0)=>app.inject({method,url,payload,headers:i===null?{}:{authorization:'Bearer '+token(i)}});
  const search=(payload={},i=0)=>request('POST','/diary-history/search',payload,i);
  const detail=(row,i=0)=>request('GET','/diary-history/'+row.source+'/'+row.id,null,i);
  const mark=(row,value=true,i=0)=>request('PUT','/diary-history/'+row.source+'/'+row.id+'/important',{important:value},i);
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),now=new Date(day+'T09:00:00Z');
  const collision=randomUUID(),bodyRows=[];
  for(let i=0;i<106;i++)bodyRows.push(await db.diaryEntry.create({data:{id:i===0?collision:randomUUID(),userId:users[0].id,zone:'chest',sensations:['tension'],note:i===105?'Вымышленная ёлка тихая пауза %_ <img src=x onerror=alert(1)>':('Учебное наблюдение '+i),createdAt:new Date(now.getTime()-i*86400000)}}));
  const checkin=await db.checkin.create({data:{id:collision,userId:users[0].id,bodyScore:6,tension:4,anxiety:3,energy:5,safety:6,bodyContact:7,note:'Вымышленная отметка состояния',createdAt:now}});
  const reaction=await db.triggerEntry.create({data:{userId:users[0].id,situation:'Вымышленный сложный разговор',reactionType:'freeze',sensations:['tension'],zone:'jaw',intensity:4,note:'Заметила челюсть',createdAt:now}});
  const meeting=await db.afterMeetingNote.create({data:{userId:users[0].id,kind:'practice',meetingDate:new Date(day),text:'Вымышленная заметка после практики',clientId:randomUUID(),createdAt:now}});
  await db.afterMeetingNote.create({data:{userId:users[0].id,kind:'analysis',meetingDate:new Date(day),text:'Вымышленная заметка после разбора',clientId:randomUUID(),createdAt:now}});
  const other=await db.diaryEntry.create({data:{userId:users[1].id,zone:'head',sensations:[],note:'ЧУЖАЯ СЕКРЕТНАЯ УЧЕБНАЯ ЗАПИСЬ',createdAt:now}});
  assert.equal((await search({},null)).statusCode,401);assert.equal((await search({},3)).statusCode,403);assert.equal((await search({},4)).statusCode,401);
  const all=await search({limit:100});assert.equal(all.statusCode,200,all.body);assert.equal(all.json().total,110);assert.equal(all.json().entries.length,100);assert(all.json().hasMore);assert.equal(all.headers['cache-control'],'private, no-store');
  const next=await search({limit:100,offset:100});assert.equal(next.json().entries.length,10);assert(!next.json().hasMore);assert.equal(new Set(all.json().entries.concat(next.json().entries).map(r=>r.source+':'+r.id)).size,110);
  assert(all.json().entries.every(r=>!('payload'in r)&&!('userId'in r)));
  const old=await search({query:'елка пауза'});assert.equal(old.json().total,1);assert.equal(old.json().entries[0].id,bodyRows[105].id);
  assert.equal((await search({query:'%_'})).json().total,1);assert.equal((await search({query:"' OR 1=1 --"})).json().total,0);
  assert.equal((await search({query:'ЧУЖАЯ'})).json().total,0);assert.equal((await search({},1)).json().total,1);assert.equal((await search({},2)).json().total,0);
  for(const kind of ['body','state','reaction','analysis','practice'])assert.equal((await search({kind})).json().total,kind==='body'?106:1);
  assert.equal((await search({period:'week'})).json().total,11);assert.equal((await search({period:'month'})).json().total,34);
  assert.equal((await search({period:'custom',from:day,to:day})).json().total,5);
  for(const invalid of [{period:'custom',from:'2026-10-18',to:'2026-09-01'},{from:'2026-02-30'},{limit:101},{offset:-1},{kind:'unknown'},{query:'q '.repeat(17)},{query:'x'.repeat(201)}])assert.equal((await search(invalid)).statusCode,400);
  const row={id:collision,source:'body'},stateRow={id:collision,source:'state'},foreign={id:other.id,source:'body'},meetingRow={id:meeting.id,source:'meeting'};
  assert.equal((await detail(row)).statusCode,200);assert.equal((await detail(foreign)).statusCode,404);assert.equal((await detail(row,2)).statusCode,404);assert.equal((await mark(foreign)).statusCode,404);assert.equal((await mark(row,true,2)).statusCode,404);
  assert.equal((await request('PUT','/diary-history/unknown/'+collision+'/important',{important:true})).statusCode,400);assert.equal((await request('GET','/diary-history/body/not-uuid')).statusCode,400);
  const concurrent=await Promise.all(Array.from({length:12},()=>mark(row)));assert(concurrent.every(r=>r.statusCode===200),concurrent.map(r=>r.body));assert.equal(await db.diaryImportant.count(),1);
  assert((await detail(row)).json().important);assert(!(await detail(stateRow)).json().important);
  assert.equal((await mark(stateRow)).statusCode,200);assert.equal((await search({important:true})).json().total,2);
  assert.equal((await mark(row,false)).statusCode,200);assert.equal((await mark(row,false)).statusCode,200);assert.equal((await search({important:true})).json().total,1);
  await mark(meetingRow);await db.afterMeetingNote.update({where:{id:meeting.id},data:{kind:'analysis'}});assert((await detail(meetingRow)).json().important);assert.equal((await detail(meetingRow)).json().kind,'analysis');
  // Exact Moscow midnight and inclusive period boundaries, not browser timezone.
  const boundary=await db.diaryEntry.create({data:{userId:users[0].id,zone:'chest',sensations:[],note:'Учебная граница дня',createdAt:new Date(new Date(day+'T00:00:00Z').getTime()-3*3600000)}});
  assert.equal((await detail({id:boundary.id,source:'body'})).json().day,day);await db.diaryEntry.delete({where:{id:boundary.id}});
  const sample=(await search({limit:100})).json();sample.entries.push(...(await search({limit:100,offset:100})).json().entries);sample.hasMore=false;
  fs.writeFileSync(stage+'/fictional-records.json',JSON.stringify(sample.entries,null,2));
  const exported=await request('GET','/gdpr/my-data');assert.equal(exported.statusCode,200,exported.body);assert.equal(exported.json().diaryImportant.length,2);assert(exported.json().diaryImportant.every(n=>!('userId'in n)));
  await mark(foreign,true,1);
  const removed=await app.inject({method:'DELETE',url:'/gdpr/delete-me',headers:{authorization:'Bearer '+auth.createDataRightsToken(users[0].id,users[0].tokenVersion)},payload:{confirm:'DELETE_MY_DATA'}});
  assert.equal(removed.statusCode,200,removed.body);assert.equal(await db.diaryImportant.count({where:{userId:users[0].id}}),0);assert.equal(await db.diaryImportant.count({where:{userId:users[1].id}}),1);assert.equal(await db.diaryEntry.count({where:{userId:users[1].id}}),1);
  assert.equal((await mark(row)).statusCode,401);assert.equal(external,0);
  const result={migration:true,nativePostgreSQLRoutes:true,syntheticRows:111,allHistorySearch:true,pagination:true,literalSearch:true,multiwordRussianSearch:true,MoscowDates:true,typeAndPeriodFilters:true,invalidInputs:9,parallelMarkRetries:12,noDuplicateMarks:true,sourceCollisionIsolation:true,ownerIsolation:true,hostIsolation:true,markSurvivesKindEdit:true,idempotentUnmark:true,exportOwnMarks:true,erasureOwnMarks:true,deletedWriteDenied:true,externalCalls:external,productionDataRowsRead:0,productionDataRowsWritten:0,notifications:0,openai:0};
  fs.writeFileSync(stage+(process.argv.includes('--installed')?'/installed-postgres-results.json':'/postgres-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await app.close();await db.$disconnect()}
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
