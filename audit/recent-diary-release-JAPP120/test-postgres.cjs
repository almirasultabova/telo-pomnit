// Isolated PostgreSQL and native routes. No production rows, bot, OpenAI or notifications.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),{randomBytes,randomUUID}=require('node:crypto');
const stage=__dirname,live='/var/www/telo-pomnit/backend',base=stage+'/backend',configFile=stage+'/test-private.json';
const migration=base+'/prisma/migrations/20261018214000_ai_chat_operations/migration.sql';
function run(cmd,args,env=process.env){const r=spawnSync(cmd,args,{env,encoding:'utf8',maxBuffer:16e6});if(r.status!==0){fs.writeFileSync(stage+'/private-test-error.log',r.stdout+'\n'+r.stderr,{mode:0o600});throw Error(cmd+' failed; diagnostics private')}return r.stdout}
function pg(url){const u=new URL(url);return {...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGDATABASE:u.pathname.slice(1),PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGOPTIONS:'-c lock_timeout=5000 -c statement_timeout=30000',...(u.searchParams.has('sslmode')?{PGSSLMODE:u.searchParams.get('sslmode')}:{})}}
function config(){const c=JSON.parse(fs.readFileSync(configFile));assert(/^telo_japp120_[a-f0-9]{12}$/.test(c.name));assert.equal(new URL(c.url).pathname,'/'+c.name);return c}
async function main(){
 const env={};require(live+'/node_modules/dotenv').config({path:live+'/.env',processEnv:env,quiet:true});
 if(process.argv.includes('--prepare')){
  assert(!fs.existsSync(configFile));const name='telo_japp120_'+randomBytes(6).toString('hex'),password=randomBytes(24).toString('hex');
  const c={name,url:`postgresql://${name}:${password}@127.0.0.1:5432/${name}?connection_limit=8`};
  assert.notEqual(new URL(env.DIRECT_URL||env.DATABASE_URL).pathname,'/'+name);
  fs.writeFileSync(configFile,JSON.stringify(c),{mode:0o600});
  run('pg_dump',['--schema-only','--no-owner','--no-privileges','--file='+stage+'/baseline-schema.sql'],pg(env.DIRECT_URL||env.DATABASE_URL));
  run('runuser',['-u','postgres','--','psql','-v','ON_ERROR_STOP=1','-c',`CREATE ROLE ${name} LOGIN PASSWORD '${password}'`]);
  run('runuser',['-u','postgres','--','createdb','--owner='+name,name]);
  run('psql',['-v','ON_ERROR_STOP=1','-f',stage+'/baseline-schema.sql'],pg(c.url));

  const schema=fs.readFileSync(base+'/prisma/schema.prisma','utf8').replace('provider = "prisma-client-js"','provider = "prisma-client-js"\n  output = "'+stage+'/test-client"');
  fs.writeFileSync(stage+'/test-schema.prisma',schema);
  run('node',[live+'/node_modules/prisma/build/index.js','generate','--schema',stage+'/test-schema.prisma'],{...process.env,DATABASE_URL:c.url,DIRECT_URL:c.url});
  console.log('PASS schema-only clone, isolated Prisma client; no personal rows copied');return;
 }
 const c=config();
 if(process.argv.includes('--cleanup')){
  run('runuser',['-u','postgres','--','dropdb','--if-exists',c.name]);
  run('runuser',['-u','postgres','--','psql','-v','ON_ERROR_STOP=1','-c',`DROP ROLE ${c.name}`]);fs.unlinkSync(configFile);console.log('PASS disposable database/role/private credentials removed');return;
 }
 Object.assign(process.env,{DATABASE_URL:c.url,DIRECT_URL:c.url,JWT_SECRET:randomBytes(32).toString('hex'),BOT_TOKEN:'',ADMIN_TELEGRAM_IDS:'900003'});
 console.log('Private config ready; use test-native.cjs for native routes');
}
main().catch(e=>{fs.writeFileSync(stage+'/private-test-error.log',e.stack||String(e),{mode:0o600});console.error('Isolated setup failed; private diagnostics saved');process.exitCode=1});
