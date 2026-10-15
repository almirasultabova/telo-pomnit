const fs=require('node:fs'),{spawnSync}=require('node:child_process'),{randomBytes}=require('node:crypto'),assert=require('node:assert/strict');
const stage='/root/telo-japp042-release',live='/var/www/telo-pomnit/backend',config=stage+'/test-private.json';
function run(cmd,args,env=process.env){const r=spawnSync(cmd,args,{env,encoding:'utf8',maxBuffer:8e6});if(r.status!==0){fs.writeFileSync(stage+'/last-error.log',r.stdout+'\n'+r.stderr,{mode:0o600});throw Error(cmd+' failed; private diagnostics in stage')}return r.stdout}
function pg(url){const u=new URL(url);return {...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGDATABASE:u.pathname.slice(1),PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password)}}
function get(){const c=JSON.parse(fs.readFileSync(config));assert(/^telo_overview_test_[a-f0-9]{12}$/.test(c.name));assert.equal(new URL(c.url).pathname,'/'+c.name);return c}
if(process.argv.includes('--prepare')){
 assert(!fs.existsSync(config));const env={};require(live+'/node_modules/dotenv').config({path:live+'/.env',processEnv:env,quiet:true});
 const name='telo_overview_test_'+randomBytes(6).toString('hex'),pw=randomBytes(24).toString('hex'),c={name,url:`postgresql://${name}:${pw}@127.0.0.1:5432/${name}?connection_limit=5`};
 fs.writeFileSync(config,JSON.stringify(c),{mode:0o600});run('pg_dump',['--schema-only','--no-owner','--no-privileges','--file='+stage+'/baseline.sql'],pg(env.DIRECT_URL||env.DATABASE_URL));
 run('runuser',['-u','postgres','--','psql','-v','ON_ERROR_STOP=1','-c',`CREATE ROLE ${name} LOGIN PASSWORD '${pw}'`]);run('runuser',['-u','postgres','--','createdb','--owner='+name,name]);
 run('psql',['-v','ON_ERROR_STOP=1','-f',stage+'/baseline.sql'],pg(c.url));
 run('psql',['-v','ON_ERROR_STOP=1','--single-transaction','-f',stage+'/backend/prisma/migrations/20261015220000_stream_overview/migration.sql'],pg(c.url));
 const schema=fs.readFileSync(stage+'/backend/prisma/schema.prisma','utf8').replace('provider = "prisma-client-js"','provider = "prisma-client-js"\n  output = "'+stage+'/test-client"');fs.writeFileSync(stage+'/test-schema.prisma',schema);
 run('node',[live+'/node_modules/prisma/build/index.js','generate','--schema',stage+'/test-schema.prisma'],{...process.env,DATABASE_URL:c.url,DIRECT_URL:c.url});console.log('PASS exact migration on schema-only disposable PostgreSQL; isolated client ready');
}else if(process.argv.includes('--cleanup')){const c=get();run('runuser',['-u','postgres','--','dropdb',c.name]);run('runuser',['-u','postgres','--','dropuser',c.name]);fs.unlinkSync(config);console.log('PASS disposable database/role removed');}
else{const c=get();process.stdout.write(run('node',[stage+'/scripts/test-stream-overview.cjs'],{...process.env,DATABASE_URL:c.url,DIRECT_URL:c.url}));}
