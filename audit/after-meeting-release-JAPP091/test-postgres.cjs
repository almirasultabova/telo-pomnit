// Isolated PostgreSQL and native routes. No production rows, bot, OpenAI or notifications.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),{randomBytes,randomUUID}=require('node:crypto');
const stage=__dirname,live='/var/www/telo-pomnit/backend',base=stage+'/backend',configFile=stage+'/test-private.json';
const migration=base+'/prisma/migrations/20261018163000_after_meeting_notes/migration.sql';
function run(cmd,args,env=process.env){const r=spawnSync(cmd,args,{env,encoding:'utf8',maxBuffer:16e6});if(r.status!==0){fs.writeFileSync(stage+'/private-test-error.log',r.stdout+'\n'+r.stderr,{mode:0o600});throw Error(cmd+' failed; diagnostics private')}return r.stdout}
function pg(url){const u=new URL(url);return {...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGDATABASE:u.pathname.slice(1),PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGOPTIONS:'-c lock_timeout=5000 -c statement_timeout=30000',...(u.searchParams.has('sslmode')?{PGSSLMODE:u.searchParams.get('sslmode')}:{})}}
function config(){const c=JSON.parse(fs.readFileSync(configFile));assert(/^telo_japp091_[a-f0-9]{12}$/.test(c.name));assert.equal(new URL(c.url).pathname,'/'+c.name);return c}
async function main(){
 const env={};require(live+'/node_modules/dotenv').config({path:live+'/.env',processEnv:env,quiet:true});
 if(process.argv.includes('--prepare')){
  assert(!fs.existsSync(configFile));const name='telo_japp091_'+randomBytes(6).toString('hex'),password=randomBytes(24).toString('hex');
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
 const runtime=process.argv.includes('--installed')?live:base;
 require.cache[require.resolve(runtime+'/src/db.js')]={exports:db};
 const app=require(live+'/node_modules/fastify')({logger:false});
 app.register(require(runtime+'/src/routes/after-meeting.js'));
 app.register(require(runtime+'/src/routes/gdpr.js'),{prefix:'/gdpr'});
 const auth=require(runtime+'/src/services/auth.js');
 const users=[];
 try{
  assert.equal((await db.$queryRawUnsafe('SELECT current_database() AS name'))[0].name,c.name);
  // The same isolated DB can re-check installed source without copying real data.
  await db.afterMeetingNote.deleteMany();await db.user.deleteMany();assert.equal(await db.user.count(),0);
  for(let i=0;i<5;i++)users.push(await db.user.create({data:{id:randomUUID(),telegramId:BigInt(900001+i),accessStatus:i===3?'pending':'approved',deletedAt:i===4?new Date():null,consentGivenAt:new Date()}}));
  const token=i=>auth.createToken(users[i].id,users[i].tokenVersion);
  const request=(method,url,payload,i=0)=>app.inject({method,url,payload,headers:i===null?{}:{authorization:'Bearer '+token(i)}});
  const data={clientId:randomUUID(),kind:'practice',meetingDate:'2026-10-17',text:'Вымышленная заметка после практики <img src=x>'};
  assert.equal((await request('GET','/after-meeting-notes',null,null)).statusCode,401);
  assert.equal((await request('POST','/after-meeting-notes',data,3)).statusCode,403);
  assert.equal((await request('POST','/after-meeting-notes',data,4)).statusCode,401);
  for(const invalid of [{text:'   '},{kind:'unknown'},{meetingDate:'2026-02-30'},{meetingDate:'2099-01-01'},{text:'x'.repeat(20001)},{clientId:'bad'}])assert.equal((await request('POST','/after-meeting-notes',{...data,...invalid})).statusCode,400);
  const concurrent=await Promise.all(Array.from({length:12},()=>request('POST','/after-meeting-notes',data)));
  assert(concurrent.every(r=>r.statusCode===200),concurrent.map(r=>r.statusCode));
  const row=concurrent[0].json();assert(concurrent.every(r=>r.json().id===row.id));assert.equal(await db.afterMeetingNote.count(),1);assert.equal(row.meetingDate,'2026-10-17');assert(!('userId'in row));
  assert.equal((await request('POST','/after-meeting-notes',{...data,text:'Другая заметка'})).statusCode,409);
  assert.equal((await request('GET','/after-meeting-notes',null,1)).json().length,0);
  assert.equal((await request('GET','/after-meeting-notes',null,2)).json().length,0); // Host gets no private records.
  assert.equal((await request('PUT','/after-meeting-notes/'+row.id,{...data,revision:1},1)).statusCode,404);
  const edit={kind:'analysis',meetingDate:'2026-10-16',text:'Вымышленная обновлённая запись',revision:1};
  const edited=await request('PUT','/after-meeting-notes/'+row.id,edit);assert.equal(edited.statusCode,200);assert.equal(edited.json().revision,2);
  const repeat=await request('PUT','/after-meeting-notes/'+row.id,edit);assert.equal(repeat.statusCode,200);assert.equal(repeat.json().revision,2);
  assert.equal((await request('PUT','/after-meeting-notes/'+row.id,{...edit,text:'Устаревшее изменение'})).statusCode,409);
  const second=await request('POST','/after-meeting-notes',{...data,kind:'analysis',clientId:randomUUID()});assert.equal(second.statusCode,200);
  const other=await request('POST','/after-meeting-notes',{...data,clientId:randomUUID()},1);assert.equal(other.statusCode,200);
  const list=await request('GET','/after-meeting-notes?limit=1&offset=1');assert.equal(list.json().length,1);assert.equal(list.headers['cache-control'],'private, no-store');
  assert.equal((await request('GET','/after-meeting-notes?limit=101')).statusCode,400);
  const exported=await request('GET','/gdpr/my-data');assert.equal(exported.statusCode,200);assert.equal(exported.json().afterMeetingNotes.length,2);assert(exported.json().afterMeetingNotes.every(n=>!('userId'in n)));
  const removed=await app.inject({method:'DELETE',url:'/gdpr/delete-me',headers:{authorization:'Bearer '+auth.createDataRightsToken(users[0].id,users[0].tokenVersion)},payload:{confirm:'DELETE_MY_DATA'}});
  assert.equal(removed.statusCode,200);assert.equal(await db.afterMeetingNote.count({where:{userId:users[0].id}}),0);assert.equal(await db.afterMeetingNote.count({where:{userId:users[1].id}}),1);
  assert.equal((await request('POST','/after-meeting-notes',{...data,clientId:randomUUID()})).statusCode,401);
  assert.equal(external,0);
  const result={migration:true,nativePostgreSQLRoutes:true,parallelCreateRetries:12,duplicateRows:0,ownerIsolation:true,hostIsolation:true,invalidInputs:6,editReplay:true,staleEdit409:true,pagination:true,exportOwnNotes:true,erasureOwnNotes:true,deletedWriteDenied:true,externalCalls:external,productionDataRowsRead:0,productionDataRowsWritten:0,notifications:0,openai:0};
  fs.writeFileSync(stage+(process.argv.includes('--installed')?'/installed-postgres-results.json':'/postgres-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await app.close();await db.$disconnect()}
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
