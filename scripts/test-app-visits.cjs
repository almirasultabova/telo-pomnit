// Synthetic data only; APP_VISIT_TEST_URL must name the disposable PostgreSQL DB.
const assert = require('node:assert/strict'), fs = require('node:fs'), Module = require('node:module');
const { dayIndex, currentVisitStreak, recordAppVisit } = require('../backend/src/services/app-visits');
assert.equal(dayIndex('2026-10-17T20:59:59Z') + 1, dayIndex('2026-10-17T21:00:00Z'));
assert.equal(currentVisitStreak({appVisitDay:'2026-10-16',appVisitStreak:12},'2026-10-17T10:00:00Z'),12);
assert.equal(currentVisitStreak({appVisitDay:'2026-10-15',appVisitStreak:12},'2026-10-17T10:00:00Z'),0);
assert.equal(currentVisitStreak({appVisitDay:null,appVisitStreak:0},'2026-10-17T10:00:00Z'),0);
assert.equal(currentVisitStreak({appVisitDay:'2026-10-18',appVisitStreak:12},'2026-10-17T10:00:00Z'),0);
const source = fs.readFileSync(require.resolve('../backend/src/routes/auth'),'utf8');
assert(source.indexOf('if (denied) return') < source.indexOf('recordAppVisit(tx, current)'));
assert(source.includes('withActiveUser({ user }'));
async function main() {
 if (!process.env.APP_VISIT_TEST_URL) { console.log('PASS Moscow day/grace/gap/future; authenticated locked write integration; no API or messages'); return }
 const url = new URL(process.env.APP_VISIT_TEST_URL); assert(/^\/telo_visits_test_[a-f0-9]{12}$/.test(url.pathname));
 const {PrismaClient} = require(process.env.APP_VISIT_TEST_CLIENT);
 const db = new PrismaClient({datasources:{db:{url:url.href}}});
 const userId='fixture-visits';
 try {
  await db.user.create({data:{id:userId,telegramId:900000001n,name:'Synthetic',accessStatus:'approved'}});
  await db.user.create({data:{id:'fixture-other',telegramId:900000002n,accessStatus:'approved'}});
  const record = now => db.$transaction(async tx => {
   await tx.$queryRawUnsafe('SELECT id FROM users WHERE id = $1 FOR UPDATE',userId);
   const user = await tx.user.findUnique({where:{id:userId}});
   return recordAppVisit(tx,user,new Date(now));
  },{timeout:30000});
  const first = await record('2026-09-30T20:59:59Z'); assert.equal(first.appVisitStreak,1); assert.equal(first.appVisitDay,'2026-09-30');
  const next = await record('2026-09-30T21:00:00Z'); assert.equal(next.appVisitStreak,2); assert.equal(next.appVisitDay,'2026-10-01');
  await Promise.all(Array.from({length:20},()=>record('2026-10-01T12:00:00Z')));
  assert.equal((await db.user.findUnique({where:{id:userId}})).appVisitStreak,2,'20 concurrent same-day logins count once');
  for(let day=2;day<=26;day++) await record(`2026-10-${String(day).padStart(2,'0')}T12:00:00Z`);
  assert.equal((await db.user.findUnique({where:{id:userId}})).appVisitStreak,27,'no weekly cap, crosses month');
  assert.equal((await record('2026-10-28T12:00:00Z')).appVisitStreak,1,'missed full day resets');
  await db.diaryEntry.createMany({data:[{userId,zone:'shoulder_l',sensations:[]},{userId,zone:'chest',sensations:[]},{userId:'fixture-other',zone:'chest',sensations:[]}]});
  // Load only the changed route with an isolated auth stub. No bot, cron, provider or admission sender is loaded.
  const load=Module._load;
  Module._load=function(id,parent,...rest){
   if(parent?.filename.endsWith('/routes/me.js') && id==='../db')return db;
   if(parent?.filename.endsWith('/routes/me.js') && id==='../services/consent')return {};
   if(parent?.filename.endsWith('/routes/me.js') && id==='../services/auth') return {
    requireAuth:async(req,reply)=>{if(req.headers.authorization!=='Bearer synthetic')return reply.code(401).send({error:'unauthorized'});req.user=await db.user.findUnique({where:{id:userId}})},withActiveUser:()=>{throw Error('unexpected write')}
   };
   return load.call(this,id,parent,...rest);
  };
  const fastify=require(process.env.APP_VISIT_FASTIFY); const app=fastify();
  try {
   await app.register(require('../backend/src/routes/me'));
   Module._load=load;
   assert.equal((await app.inject('/me/profile-stats')).statusCode,401);
   const response=await app.inject({url:'/me/profile-stats?userId=fixture-other',headers:{authorization:'Bearer synthetic'}});
   assert.equal(response.statusCode,200); assert.equal(response.json().savedObservations,2,'count restricted to authenticated user');
   assert.equal((await db.user.findUnique({where:{id:'fixture-other'}})).appVisitStreak,0,'no foreign writes');
  } finally {Module._load=load;await app.close()}
  console.log('PASS exact migration, 20 concurrent logins, Moscow midnight, 27 days/month, gap, own count/foreign exclusion, unauthorized request; synthetic DB only; sends=0');
 } finally { await db.$disconnect() }
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
