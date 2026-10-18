// Isolated PostgreSQL and native routes. No production rows, bot, OpenAI or notifications.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),{randomBytes,randomUUID}=require('node:crypto');
const stage=__dirname,live='/var/www/telo-pomnit/backend',base=stage+'/backend',configFile=stage+'/test-private.json';
const migration=base+'/prisma/migrations/20261018194000_after_meeting_steps/migration.sql';
function run(cmd,args,env=process.env){const r=spawnSync(cmd,args,{env,encoding:'utf8',maxBuffer:16e6});if(r.status!==0){fs.writeFileSync(stage+'/private-test-error.log',r.stdout+'\n'+r.stderr,{mode:0o600});throw Error(cmd+' failed; diagnostics private')}return r.stdout}
function pg(url){const u=new URL(url);return {...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGDATABASE:u.pathname.slice(1),PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGOPTIONS:'-c lock_timeout=5000 -c statement_timeout=30000',...(u.searchParams.has('sslmode')?{PGSSLMODE:u.searchParams.get('sslmode')}:{})}}
function config(){const c=JSON.parse(fs.readFileSync(configFile));assert(/^telo_japp097_[a-f0-9]{12}$/.test(c.name));assert.equal(new URL(c.url).pathname,'/'+c.name);return c}
async function main(){
 const env={};require(live+'/node_modules/dotenv').config({path:live+'/.env',processEnv:env,quiet:true});
 if(process.argv.includes('--prepare')){
  assert(!fs.existsSync(configFile));const name='telo_japp097_'+randomBytes(6).toString('hex'),password=randomBytes(24).toString('hex');
  const c={name,url:`postgresql://${name}:${password}@127.0.0.1:5432/${name}?connection_limit=8`};
  assert.notEqual(new URL(env.DIRECT_URL||env.DATABASE_URL).pathname,'/'+name);
  fs.writeFileSync(configFile,JSON.stringify(c),{mode:0o600});
  run('pg_dump',['--schema-only','--no-owner','--no-privileges','--file='+stage+'/baseline-schema.sql'],pg(env.DIRECT_URL||env.DATABASE_URL));
  run('runuser',['-u','postgres','--','psql','-v','ON_ERROR_STOP=1','-c',`CREATE ROLE ${name} LOGIN PASSWORD '${password}'`]);
  run('runuser',['-u','postgres','--','createdb','--owner='+name,name]);
  run('psql',['-v','ON_ERROR_STOP=1','-f',stage+'/baseline-schema.sql'],pg(c.url));
  const legacyUser=randomUUID(),legacyNote=randomUUID();
  run('psql',['-v','ON_ERROR_STOP=1','-c',`INSERT INTO users(id,telegram_id) VALUES ('${legacyUser}',900009); INSERT INTO after_meeting_notes(id,user_id,kind,meeting_date,text,client_id,updated_at) VALUES ('${legacyNote}','${legacyUser}','practice','2026-10-17','Legacy synthetic note','${randomUUID()}',now());`],pg(c.url));
  run('psql',['-v','ON_ERROR_STOP=1','-f',migration],pg(c.url));
  assert.equal(run('psql',['-At','-c',`SELECT (step_text='' AND step_paused=false AND text='Legacy synthetic note') FROM after_meeting_notes WHERE id='${legacyNote}'`],pg(c.url)).trim(),'t');

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
  for(const model of ['diaryImportant','afterMeetingStepEvent','afterMeetingNote','diaryEntry','checkin','triggerEntry'])await db[model].deleteMany();await db.user.deleteMany();
  for(let i=0;i<5;i++)users.push(await db.user.create({data:{id:randomUUID(),telegramId:BigInt(900001+i),accessStatus:i===3?'pending':'approved',deletedAt:i===4?new Date():null,consentGivenAt:new Date()}}));
  const token=i=>auth.createToken(users[i].id,users[i].tokenVersion);
  const req=(method,url,payload,i=0)=>app.inject({method,url,payload,headers:i===null?{}:{authorization:'Bearer '+token(i)}});
  const create=(data={},i=0)=>req('POST','/after-meeting-notes',{clientId:randomUUID(),kind:'practice',meetingDate:'2026-10-17',text:'Вымышленная заметка',...data},i);
  const step=(id,data,i=0)=>req('PUT','/after-meeting-notes/'+id+'/step',data,i);
  const observe=(id,data,i=0)=>req('POST','/after-meeting-notes/'+id+'/observations',data,i);
  const get=(id,i=0)=>req('GET','/after-meeting-notes/'+id,null,i);
  assert.equal((await create({},null)).statusCode,401);assert.equal((await create({},3)).statusCode,403);assert.equal((await create({},4)).statusCode,401);
  const legacy=(await create()).json();assert.equal(legacy.stepText,'');assert.equal(legacy.stepPaused,false);assert.deepEqual(legacy.events,[]);
  const body={clientId:randomUUID(),kind:'analysis',meetingDate:'2026-10-18',text:'Учебная заметка с шагом',stepText:'Дать себе паузу перед ответом.'};
  const made=await Promise.all(Array.from({length:12},()=>create(body)));assert(made.every(r=>r.statusCode===200),made.map(r=>r.body));let row=made[0].json();assert(made.every(r=>r.json().id===row.id));assert.equal(await db.afterMeetingNote.count(),2);
  assert.equal((await get(row.id)).headers['cache-control'],'private, no-store');assert.equal((await get(row.id,1)).statusCode,404);assert.equal((await get(row.id,2)).statusCode,404);
  assert.equal((await step(row.id,{stepPaused:true,revision:row.revision},1)).statusCode,404);
  const oldApi=await req('PUT','/after-meeting-notes/'+row.id,{kind:row.kind,meetingDate:row.meetingDate,text:'Изменена только заметка старым клиентом',revision:row.revision});assert.equal(oldApi.statusCode,200,oldApi.body);row=oldApi.json();assert.equal(row.stepText,body.stepText);
  const observation={clientId:randomUUID(),stepText:row.stepText,text:'Сиреневый вымышленный пример <img src=x> — заметила паузу.'};
  const ack=await Promise.all(Array.from({length:12},()=>observe(row.id,observation)));assert(ack.every(r=>r.statusCode===200),ack.map(r=>r.body));row=ack[0].json();assert.equal(row.events.length,1);assert.equal(await db.afterMeetingStepEvent.count(),1);assert.equal(row.events[0].stepText,body.stepText);assert(!('userId'in row.events[0]));
  assert.equal((await observe(row.id,{...observation,text:'Другой текст'})).statusCode,409);assert.equal((await observe(legacy.id,observation)).statusCode,409);
  const before=row.revision,changedText='Сначала заметить, чего я хочу.';
  const changes=await Promise.all(Array.from({length:12},()=>step(row.id,{stepText:changedText,revision:before})));assert(changes.every(r=>r.statusCode===200),changes.map(r=>r.body));row=changes[0].json();assert.equal(row.events.length,2);assert.equal(row.events[0].stepText,body.stepText);assert.equal(row.events[1].from,body.stepText);
  assert.equal((await step(row.id,{stepText:'Устаревшее изменение',revision:before})).statusCode,409);
  assert.equal((await observe(row.id,{...observation,clientId:randomUUID()})).statusCode,409);
  // Lost observation ACK still resolves after the step changes; it never binds to the new step.
  const resolved=await observe(row.id,observation);assert.equal(resolved.statusCode,200);assert.equal(resolved.json().events.filter(e=>e.type==='observation').length,1);
  for(const text of ['Первое независимое наблюдение','Второе независимое наблюдение'])assert.equal((await observe(row.id,{clientId:randomUUID(),text,stepText:changedText})).statusCode,200);
  row=(await get(row.id)).json();assert.equal(row.events.length,4);
  const pauseVersion=row.revision;row=(await step(row.id,{stepPaused:true,revision:pauseVersion})).json();assert(row.stepPaused);const repeated=await step(row.id,{stepPaused:true,revision:pauseVersion});assert.equal(repeated.statusCode,200);assert.equal(repeated.json().revision,row.revision);row=(await step(row.id,{stepPaused:false,revision:row.revision})).json();assert(!row.stepPaused);
  const search=await req('POST','/diary-history/search',{query:'Сиреневый'});assert.equal(search.statusCode,200,search.body);assert.equal(search.json().total,1);assert(search.json().entries[0].hasStep);assert(search.json().entries[0].text.includes(observation.text));
  await req('PUT','/diary-history/meeting/'+row.id+'/important',{important:true});assert((await req('POST','/diary-history/search',{important:true})).json().entries[0].hasStep);
  for(const data of [{text:''},{text:'  '},{text:'x'.repeat(4001)},{clientId:'bad'},{stepText:'x'.repeat(1201)}])assert.equal((await observe(row.id,{clientId:randomUUID(),text:'Учебное',stepText:changedText,...data})).statusCode,400);
  for(const data of [{revision:row.revision},{stepText:'x'.repeat(1201),revision:row.revision},{stepPaused:'bad',revision:row.revision}])assert.equal((await step(row.id,data)).statusCode,400);
  assert.equal((await step(legacy.id,{stepPaused:true,revision:legacy.revision})).statusCode,400);
  assert.equal((await get('bad')).statusCode,400);assert.equal((await observe(row.id,{clientId:randomUUID(),text:'Чужое',stepText:changedText},2)).statusCode,404);
  // Clearing an optional step retains its past observations for reading/export.
  row=(await step(row.id,{stepText:'',revision:row.revision})).json();assert.equal(row.stepText,'');assert.equal(row.events.length,5);
  assert.equal((await observe(row.id,{clientId:randomUUID(),text:'Без шага',stepText:changedText})).statusCode,409);
  const other=(await create({stepText:'Чужой учебный шаг'},1)).json();await observe(other.id,{clientId:randomUUID(),stepText:other.stepText,text:'Чужое учебное наблюдение'},1);
  const exported=await req('GET','/gdpr/my-data');assert.equal(exported.statusCode,200,exported.body);assert.equal(exported.json().afterMeetingStepEvents.length,5);assert(exported.json().afterMeetingStepEvents.every(e=>!('userId'in e)));assert.equal(exported.json().afterMeetingNotes.length,2);
  const removed=await app.inject({method:'DELETE',url:'/gdpr/delete-me',headers:{authorization:'Bearer '+auth.createDataRightsToken(users[0].id,users[0].tokenVersion)},payload:{confirm:'DELETE_MY_DATA'}});assert.equal(removed.statusCode,200,removed.body);assert.equal(await db.afterMeetingStepEvent.count({where:{userId:users[0].id}}),0);assert.equal(await db.afterMeetingStepEvent.count({where:{userId:users[1].id}}),1);assert.equal(await db.afterMeetingNote.count({where:{userId:users[1].id}}),1);assert.equal((await step(row.id,{stepText:'x',revision:row.revision})).statusCode,401);
  assert.equal(external,0);
  const result={migrationPreservesLegacyNote:true,nativePostgreSQLRoutes:true,parallelNoteRetries:12,parallelObservationRetries:12,parallelStepRetries:12,noDuplicateRows:true,ownerIsolation:true,hostIsolation:true,legacyClientPreservesStep:true,staleStep409:true,observationContextPreserved:true,clearStepRetainsHistory:true,pauseResumeReplay:true,searchFindsObservations:true,importantRetained:true,exportOwnEvents:true,erasureOwnEvents:true,deletedWriteDenied:true,externalCalls:0,productionDataRowsRead:0,productionDataRowsWritten:0,notifications:0,openai:0};
  fs.writeFileSync(stage+(process.argv.includes('--installed')?'/installed-postgres-results.json':'/postgres-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await app.close();await db.$disconnect()}
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
