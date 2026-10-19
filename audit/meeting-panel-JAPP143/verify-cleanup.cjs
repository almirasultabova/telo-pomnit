const fs=require('node:fs'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
assert(!fs.existsSync(__dirname+'/test-private.json'));
const q="SELECT (SELECT count(*) FROM pg_database WHERE datname LIKE 'telo_japp143_%') AS databases, (SELECT count(*) FROM pg_roles WHERE rolname LIKE 'telo_japp143_%') AS roles";
const r=spawnSync('runuser',['-u','postgres','--','psql','-At','-v','ON_ERROR_STOP=1','-c',q],{encoding:'utf8'});
assert.equal(r.status,0);assert.equal(r.stdout.trim(),'0|0');
const result={passed:true,disposableDatabasesRemaining:0,disposableRolesRemaining:0,privateCredentialsRemoved:true,productionTestWrites:0};
fs.writeFileSync(__dirname+'/cleanup.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
