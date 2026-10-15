// Authorized J-APP-027 release. No test events, SMTP calls or Telegram sends.
// Database/code backup stays private on the existing production host.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto'), { spawnSync } = require('node:child_process');
const stage = '/root/telo-japp027-release', base = '/var/www/telo-pomnit/backend';
const backup = '/root/telo-backups/mail-reminders-JAPP027-20261015';
const manifest = JSON.parse(fs.readFileSync(stage + '/release-manifest.json'));
const env = {}; require(base + '/node_modules/dotenv').config({ path: base + '/.env', processEnv: env, quiet: true });
const databaseUrl = env.DIRECT_URL || env.DATABASE_URL;
const u = new URL(databaseUrl), pg = { ...process.env, PGHOST: u.hostname, PGPORT: u.port || '5432', PGDATABASE: u.pathname.slice(1), PGUSER: decodeURIComponent(u.username), PGPASSWORD: decodeURIComponent(u.password), PGOPTIONS: '-c lock_timeout=5000 -c statement_timeout=30000' };
if (u.searchParams.has('sslmode')) pg.PGSSLMODE = u.searchParams.get('sslmode');
const { PrismaClient } = require(stage + '/test-client');
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function run(command, args, childEnv = process.env) {
  const result = spawnSync(command, args, { env: childEnv, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw Error(command + ' failed; inspect private server diagnostics');
  return result.stdout;
}
function targets() {
  return manifest.files.map(file => {
    const target = file.path.startsWith('backend/') ? path.join(base, file.path.slice(8)) : '/var/www/telo-site/thanks.html';
    assert(file.path.startsWith('backend/') || file.path === 'site/thanks.html');
    assert(target.startsWith(base + '/') || target === '/var/www/telo-site/thanks.html');
    assert.equal(hash(stage + '/' + file.path), file.afterSha256, 'Staged source drift: ' + file.path);
    assert.equal(fs.existsSync(target) ? hash(target) : null, file.beforeSha256, 'Live source drift: ' + file.path);
    return { ...file, target };
  });
}
async function counts() {
  const result = {};
  for (const table of ['users', 'payment_orders', 'enrollments', 'diary_entries', 'trigger_entries', 'questionnaires', 'feedback']) result[table] = Number((await db.$queryRawUnsafe('SELECT count(*) AS n FROM ' + table))[0].n);
  return result;
}
async function preflight() {
  const files = targets();
  const present = await db.$queryRawUnsafe("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND ((table_name='users' AND column_name IN ('daily_reminder_attempt_day','questionnaire_reminder_attempt_day')) OR (table_name='payment_orders' AND column_name IN ('welcome_email_status','welcome_email_sent_at')))");
  assert.equal(present.length, 0, 'Unexpected prior/partial migration');
  const appUrl = new URL('/thanks.html', env.APP_URL || 'https://telo-pomnit.ru');
  assert(['https://telo-pomnit.ru', 'https://www.telo-pomnit.ru'].includes(appUrl.origin), 'Configured payment return is not on the deployed site');
  const processes = JSON.parse(run('pm2', ['jlist'])), process = processes.find(p => p.name === 'telo-backend');
  assert.equal(process?.pm2_env?.status, 'online'); assert.equal(processes.filter(p => p.name === 'telo-backend').length, 1);
  run('nginx', ['-t']);
  return { files, before: await counts(), returnOrigin: appUrl.origin };
}
async function activate() {
  const checked = await preflight(); assert(!fs.existsSync(backup), 'Backup directory already exists');
  fs.mkdirSync(backup, { recursive: true, mode: 0o700 });
  run('tar', ['-czf', backup + '/backend-code-before.tar.gz', '-C', base, 'src', 'prisma', 'package.json', 'package-lock.json']);
  fs.copyFileSync('/var/www/telo-site/thanks.html', backup + '/thanks-before.html');
  run('pg_dump', ['--format=custom', '--file=' + backup + '/database-before.dump'], pg);
  assert(fs.statSync(backup + '/database-before.dump').size > 0);
  run('pg_restore', ['--list', backup + '/database-before.dump']);
  const before = await counts(); let stopped = false, changed = false;
  try {
    run('pm2', ['stop', 'telo-backend']); stopped = true;
    const prefs = async () => (await db.$queryRawUnsafe("SELECT md5(coalesce(string_agg(id || ':' || notifications_time || ':' || notifications_enabled::text, ',' ORDER BY id),'')) AS fingerprint FROM users"))[0].fingerprint;
    const frozenPreferences = await prefs();
    const processed = Number((await db.$queryRawUnsafe('SELECT count(*) AS n FROM payment_orders WHERE processed_at IS NOT NULL'))[0].n);
    for (const name of ['20261015120000_welcome_email_claim', '20261015130000_reminder_attempt_days']) run('psql', ['-v', 'ON_ERROR_STOP=1', '-f', stage + '/backend/prisma/migrations/' + name + '/migration.sql'], pg);
    const transition = await require(stage + '/scripts/reminder-release-boundary.cjs').reserveLegacyReminderSlots(db);
    assert.equal(await prefs(), frozenPreferences, 'Notification preferences changed during migration');
    assert.equal(Number((await db.$queryRawUnsafe("SELECT count(*) AS n FROM payment_orders WHERE welcome_email_status='legacy'"))[0].n), processed, 'Historical orders not fully excluded');
    for (const file of checked.files) {
      fs.mkdirSync(path.dirname(file.target), { recursive: true });
      const temp = file.target + '.japp027.tmp'; fs.copyFileSync(stage + '/' + file.path, temp); fs.chmodSync(temp, 0o644); fs.renameSync(temp, file.target);
      changed = true;
    }
    run('node', [base + '/node_modules/prisma/build/index.js', 'generate', '--schema', base + '/prisma/schema.prisma'], { ...process.env, ...env, DIRECT_URL: env.DIRECT_URL || env.DATABASE_URL });
    run('nginx', ['-t']); run('pm2', ['restart', 'telo-backend']); stopped = false;
    let healthy = false;
    for (let n = 0; n < 8; n++) { try { const r = await fetch('http://127.0.0.1:3000/health', { signal: AbortSignal.timeout(2500) }); if (r.ok) { healthy = true; break; } } catch {} await new Promise(r => setTimeout(r, 1000)); }
    assert(healthy, 'Local health after activation failed');
    for (const file of checked.files) assert.equal(hash(file.target), file.afterSha256);
    const columns = await db.$queryRawUnsafe("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND ((table_name='users' AND column_name IN ('daily_reminder_attempt_day','questionnaire_reminder_attempt_day')) OR (table_name='payment_orders' AND column_name IN ('welcome_email_status','welcome_email_sent_at')))");
    assert.equal(columns.length, 4);
    const result = { release: manifest.release, backup, before, after: await counts(), transition, columns: columns.length, preferencesPreserved: true, historicalOrdersExcluded: true, codeHashesMatch: true, health: true, meetingsEnabled: false, testExternalSends: 0 };
    fs.writeFileSync(backup + '/activation-result.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
  } catch (error) {
    if (changed) {
      run('tar', ['-xzf', backup + '/backend-code-before.tar.gz', '-C', base]);
      fs.copyFileSync(backup + '/thanks-before.html', '/var/www/telo-site/thanks.html');
      // New services are unreachable from restored old imports; leave them rather than deleting blindly.
      run('node', [base + '/node_modules/prisma/build/index.js', 'generate', '--schema', base + '/prisma/schema.prisma'], { ...process.env, ...env, DIRECT_URL: env.DIRECT_URL || env.DATABASE_URL });
    }
    if (stopped || changed) run('pm2', ['restart', 'telo-backend']);
    throw error;
  }
}
(async () => {
  if (process.argv.includes('--activate')) await activate();
  else { const result = await preflight(); console.log(JSON.stringify({ preflight: true, files: result.files.length, returnOrigin: result.returnOrigin, before: result.before })); }
})().catch(error => { console.error('Release stopped:', error.message?.slice(0, 240)); process.exitCode = 1; }).finally(() => db.$disconnect());
