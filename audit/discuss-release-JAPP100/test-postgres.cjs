// Isolated PostgreSQL and native routes. No production rows, bot, OpenAI or notifications.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),{randomBytes,randomUUID}=require('node:crypto');
const stage=__dirname,live='/var/www/telo-pomnit/backend',base=stage+'/backend',configFile=stage+'/test-private.json';
const migration=base+'/prisma/migrations/20261018202000_discussion_notes/migration.sql';
function run(cmd,args,env=process.env){const r=spawnSync(cmd,args,{env,encoding:'utf8',maxBuffer:16e6});if(r.status!==0){fs.writeFileSync(stage+'/private-test-error.log',r.stdout+'\n'+r.stderr,{mode:0o600});throw Error(cmd+' failed; diagnostics private')}return r.stdout}
function pg(url){const u=new URL(url);return {...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGDATABASE:u.pathname.slice(1),PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGOPTIONS:'-c lock_timeout=5000 -c statement_timeout=30000',...(u.searchParams.has('sslmode')?{PGSSLMODE:u.searchParams.get('sslmode')}:{})}}
function config(){const c=JSON.parse(fs.readFileSync(configFile));assert(/^telo_japp100_[a-f0-9]{12}$/.test(c.name));assert.equal(new URL(c.url).pathname,'/'+c.name);return c}
async function main(){
 const env={};require(live+'/node_modules/dotenv').config({path:live+'/.env',processEnv:env,quiet:true});
 if(process.argv.includes('--prepare')){
  assert(!fs.existsSync(configFile));const name='telo_japp100_'+randomBytes(6).toString('hex'),password=randomBytes(24).toString('hex');
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
 app.register(require(runtime+'/src/routes/discussion.js'));
 app.register(require(runtime+'/src/routes/gdpr.js'),{prefix:'/gdpr'});
 const auth=require(runtime+'/src/services/auth.js');
 const users=[];
 try{
  assert.equal((await db.$queryRawUnsafe('SELECT current_database() AS name'))[0].name,c.name);
  for(const model of ['discussionNote','diaryImportant','afterMeetingStepEvent','afterMeetingNote','diaryEntry','checkin','triggerEntry'])await db[model].deleteMany();await db.user.deleteMany();
  for(let i=0;i<5;i++)users.push(await db.user.create({data:{id:randomUUID(),telegramId:BigInt(900001+i),role:i===2?'HOST':'PARTICIPANT',accessStatus:i===3?'pending':'approved',deletedAt:i===4?new Date():null,consentGivenAt:new Date()}}));
  const token=i=>auth.createToken(users[i].id,users[i].tokenVersion);
  const req=(method,url,payload,i=0)=>app.inject({method,url,payload,headers:i===null?{}:{authorization:'Bearer '+token(i)}});
  const create=(data={},i=0)=>req('POST','/discussion-notes',{clientId:randomUUID(),text:'Вымышленная запись к разбору',source:null,...data},i);
  const get=(id,i=0)=>req('GET','/discussion-notes/'+id,null,i);
  const put=(row,data,i=0)=>req('PUT','/discussion-notes/'+row.id,{revision:row.revision,...data},i);
  assert.equal((await create({},null)).statusCode,401);assert.equal((await create({},3)).statusCode,403);assert.equal((await create({},4)).statusCode,401);
  const input={clientId:randomUUID(),text:'Одинаковый учебный вопрос <img src=x>',source:null};
  const made=await Promise.all(Array.from({length:12},()=>create(input)));assert(made.every(r=>r.statusCode===200),made.map(r=>r.body));let row=made[0].json();assert(made.every(r=>r.json().id===row.id));assert.equal(await db.discussionNote.count(),1);assert(!('userId'in row));
  assert.equal((await get(row.id)).headers['cache-control'],'private, no-store');
  for(const i of [1,2]){assert.equal((await get(row.id,i)).statusCode,404);assert.deepEqual((await req('GET','/discussion-notes',null,i)).json(),[]);assert.equal((await put(row,{done:true},i)).statusCode,404);}
  assert.equal((await create({...input,text:'Другой текст'})).statusCode,409);
  const savedRevision=row.revision;const mark=await Promise.all(Array.from({length:12},()=>put(row,{done:true})));assert(mark.every(r=>r.statusCode===200),mark.map(r=>r.body));row=mark[0].json();assert(row.done);assert.equal(row.revision,savedRevision+1);
  assert.equal((await put({...row,revision:savedRevision},{text:'Неосторожное старое изменение',source:null})).statusCode,409);
  row=(await put(row,{text:'Мой уточнённый вопрос',source:null})).json();assert.equal(row.text,'Мой уточнённый вопрос');assert(row.done);
  const note=await db.afterMeetingNote.create({data:{userId:users[0].id,kind:'analysis',meetingDate:new Date('2026-10-15T00:00:00Z'),text:'Секретный полный учебный исходник. Выбрана только последняя мысль.',clientId:randomUUID()}});
  const another=await db.afterMeetingNote.create({data:{userId:users[1].id,kind:'practice',meetingDate:new Date('2026-10-15T00:00:00Z'),text:'Чужая искусственная заметка',clientId:randomUUID()}});
  const selected={type:'meeting',id:note.id,excerpt:'Я могу дать себе время перед ответом.'};
  let fragmentResponse=await create({text:'',source:selected});assert.equal(fragmentResponse.statusCode,200,fragmentResponse.body);let fragment=fragmentResponse.json();assert.equal(fragment.source.label,'После разбора');assert.equal(fragment.source.day,'2026-10-15');assert.equal(fragment.source.excerpt,selected.excerpt);assert(!JSON.stringify(fragment).includes('Секретный полный'));assert.equal((await db.afterMeetingNote.findUnique({where:{id:note.id}})).text,note.text);
  assert.equal((await create({source:{...selected,id:another.id}})).statusCode,400);assert.equal((await create({source:{...selected,id:randomUUID()}})).statusCode,400);
  // Fastify strips unknown fields. A supplied owner never changes server ownership.
  const spoof=await create({source:{...selected,userId:users[1].id}});assert.equal(spoof.statusCode,200);assert.equal((await get(spoof.json().id,1)).statusCode,404);await db.discussionNote.delete({where:{id:spoof.json().id}});
  fragment=(await put(fragment,{text:'Уточнение',source:{...selected,excerpt:'Сокращённый фрагмент'}})).json();assert.equal(fragment.source.excerpt,'Сокращённый фрагмент');
  await db.afterMeetingNote.delete({where:{id:note.id}});fragment=(await put(fragment,{text:'Вопрос после удаления оригинала',source:{...selected,excerpt:'Независимая копия фрагмента'}})).json();assert.equal(fragment.source.excerpt,'Независимая копия фрагмента');
  fragment=(await put(fragment,{text:'Остался только мой текст',source:null})).json();assert.equal(fragment.source,null);
  const other=(await create({text:'Чужая искусственная запись'},1)).json();
  for(const payload of [{text:'',source:null},{text:'  ',source:null},{text:'x'.repeat(6001)},{source:{...selected,excerpt:'x'.repeat(6001)}},{source:{...selected,excerpt:'  '}},{clientId:'bad'},{source:{type:'admin',id:note.id,excerpt:'x'}}])assert.equal((await create(payload)).statusCode,400);
  for(const payload of [{revision:row.revision},{revision:row.revision,text:'Нет source'},{revision:row.revision,source:null},{revision:0,done:true},{revision:row.revision,done:'bad'}])assert.equal((await req('PUT','/discussion-notes/'+row.id,payload)).statusCode,400);
  assert.equal((await get('bad')).statusCode,400);assert.equal((await req('GET','/discussion-notes?limit=101')).statusCode,400);
  const list=(await req('GET','/discussion-notes?limit=1&offset=1')).json();assert.equal(list.length,1);assert(list.every(r=>r.id!==other.id));
  const exported=await req('GET','/gdpr/my-data');assert.equal(exported.statusCode,200,exported.body);assert.equal(exported.json().discussionNotes.length,2);assert(exported.json().discussionNotes.every(e=>!('userId'in e)&&e.id!==other.id));
  const removed=await app.inject({method:'DELETE',url:'/gdpr/delete-me',headers:{authorization:'Bearer '+auth.createDataRightsToken(users[0].id,users[0].tokenVersion)},payload:{confirm:'DELETE_MY_DATA'}});assert.equal(removed.statusCode,200,removed.body);assert.equal(await db.discussionNote.count({where:{userId:users[0].id}}),0);assert.equal(await db.discussionNote.count({where:{userId:users[1].id}}),1);assert.equal((await get(row.id)).statusCode,401);
  assert.equal(external,0);
  const result={nativePostgreSQLRoutes:true,exactAdditiveMigration:true,parallelCreateRetries:12,parallelStatusRetries:12,noDuplicates:true,revisionConflict:true,ownerIsolation:true,hostIsolation:true,sourceOwnership:true,snapshotOnly:true,originalUnchanged:true,snapshotSurvivesOriginalRemoval:true,pagination:true,validation:true,ownExport:true,ownErasure:true,otherOwnerPreserved:true,externalCalls:external,productionRowsUsed:0};
  fs.writeFileSync(stage+(process.argv.includes('--installed')?'/installed-postgres-results.json':'/postgres-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await app.close();await db.$disconnect()}
}
main().catch(e=>{fs.writeFileSync(stage+'/private-test-error.log',e.stack||String(e),{mode:0o600});console.error('Isolated test failed; private diagnostics saved');process.exitCode=1});
