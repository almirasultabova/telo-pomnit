// J-APP-027: isolated PostgreSQL migration and concurrency tests on the existing VPS.
// --prepare reads production SCHEMA ONLY; --test uses only the disposable DB.
// No application runtime, real SMTP, provider or Telegram calls are loaded.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { spawnSync, spawn } = require('node:child_process'), { randomBytes, randomUUID } = require('node:crypto');
const { EventEmitter } = require('node:events'), Module = require('node:module');
const stage = '/root/telo-japp027-release', live = '/var/www/telo-pomnit/backend';
const backend = path.join(stage, 'backend'), configFile = path.join(stage, 'test-private.json');
const migrations = ['20261015120000_welcome_email_claim', '20261015130000_reminder_attempt_days'];
const time = new Date('2026-10-15T05:15:00Z');
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw Error(command + ' failed (private diagnostics only)');
  return result.stdout;
}
function pgEnv(url) {
  const u = new URL(url), env = { ...process.env, PGHOST: u.hostname, PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username), PGPASSWORD: decodeURIComponent(u.password), PGDATABASE: u.pathname.slice(1) };
  if (u.searchParams.has('sslmode')) env.PGSSLMODE = u.searchParams.get('sslmode');
  return env;
}
function config() {
  const c = JSON.parse(fs.readFileSync(configFile));
  assert(/^telo_japp027_[a-f0-9]{12}$/.test(c.name));
  const u = new URL(c.url); assert.equal(u.pathname, '/' + c.name); assert.equal(u.username, c.name); assert.equal(u.hostname, '127.0.0.1');
  return c;
}
function prepare() {
  assert(!fs.existsSync(configFile), 'Disposable database already prepared');
  const env = {}; require(live + '/node_modules/dotenv').config({ path: live + '/.env', processEnv: env, quiet: true });
  const sourceUrl = env.DIRECT_URL || env.DATABASE_URL; assert(sourceUrl);
  const name = 'telo_japp027_' + randomBytes(6).toString('hex'), password = randomBytes(24).toString('hex');
  assert.notEqual(new URL(sourceUrl).pathname.slice(1), name);
  const c = { name, url: `postgresql://${name}:${password}@127.0.0.1:5432/${name}?connection_limit=3` };
  fs.writeFileSync(configFile, JSON.stringify(c), { mode: 0o600 });
  run('pg_dump', ['--schema-only', '--no-owner', '--no-privileges', '--file=' + stage + '/baseline-schema.sql'], pgEnv(sourceUrl));
  run('runuser', ['-u', 'postgres', '--', 'psql', '-v', 'ON_ERROR_STOP=1', '-c', `CREATE ROLE ${name} LOGIN PASSWORD '${password}'`]);
  run('runuser', ['-u', 'postgres', '--', 'createdb', '--owner=' + name, name]);
  run('psql', ['-v', 'ON_ERROR_STOP=1', '-f', stage + '/baseline-schema.sql'], pgEnv(c.url));
  run('psql', ['-v', 'ON_ERROR_STOP=1', '-c', `
    INSERT INTO streams(id,name,start_date,end_date) VALUES ('fixture-stream','Synthetic only','2026-10-01','2026-10-31');
    INSERT INTO users(id,telegram_id,notifications_time,notifications_enabled) VALUES ('fixture-before',100,'08:15',false);
    INSERT INTO payment_orders(id,amount,currency,shop_id,stream_id,email,telegram_username,processed_at)
      VALUES ('fixture-legacy','15000.00','RUB','fixture-shop','fixture-stream','legacy@example.invalid','fixture',now()),
             ('fixture-pending','15000.00','RUB','fixture-shop','fixture-stream','pending@example.invalid','fixture',null);
  `], pgEnv(c.url));
  for (const migration of migrations) run('psql', ['-v', 'ON_ERROR_STOP=1', '-f', backend + '/prisma/migrations/' + migration + '/migration.sql'], pgEnv(c.url));
  const schema = fs.readFileSync(backend + '/prisma/schema.prisma', 'utf8')
    .replace('provider = "prisma-client-js"', 'provider = "prisma-client-js"\n  output = "' + stage + '/test-client"');
  fs.writeFileSync(stage + '/test-schema.prisma', schema);
  run('node', [live + '/node_modules/prisma/build/index.js', 'generate', '--schema', stage + '/test-schema.prisma'], { ...process.env, DATABASE_URL: c.url, DIRECT_URL: c.url });
  console.log('PASS disposable database: schema only, synthetic legacy/pending/preferences seeded, both exact SQL migrations applied, isolated Prisma client generated');
}
function cleanup() {
  const c = config();
  run('runuser', ['-u', 'postgres', '--', 'dropdb', c.name]);
  run('runuser', ['-u', 'postgres', '--', 'dropuser', c.name]);
  fs.unlinkSync(configFile);
  console.log('PASS disposable database and role removed; no production data copied');
}
async function test(worker) {
  const c = config(); Object.assign(process.env, { DATABASE_URL: c.url, DIRECT_URL: c.url,
    JWT_SECRET: 'japp027-synthetic-key', BOT_TOKEN: '', SMTP_USER: 'sender@example.invalid', SMTP_PASS: '',
    YUKASSA_SHOP_ID: 'fixture-shop', YUKASSA_SECRET_KEY: 'fixture-key', APP_URL: 'https://telo-pomnit.ru' });
  const { PrismaClient } = require(stage + '/test-client');
  const db = new PrismaClient({ datasources: { db: { url: c.url } } });
  const local = p => require(path.join(backend, p));
  require.cache[require.resolve(backend + '/src/db')] = { exports: db };
  let app;
  try {
    assert.equal((await db.$queryRawUnsafe('SELECT current_database() AS name'))[0].name, c.name);
    const { createReminderService } = local('src/services/reminders');
    if (worker) {
      const service = createReminderService({ sendMessage: async () => fs.appendFileSync(stage + '/worker-attempts.log', worker + '\n'), miniAppUrl: 'https://example.invalid' });
      await (worker === 'daily' ? service.sendDailyReminder(time) : service.sendQuestionnaireReminders(time));
      return;
    }
    const before = await db.user.findUnique({ where: { id: 'fixture-before' } });
    assert.equal(before.notificationsTime, '08:15'); assert.equal(before.notificationsEnabled, false);
    assert.equal(before.dailyReminderAttemptDay, null); assert.equal(before.questionnaireReminderAttemptDay, null);
    assert.equal((await db.paymentOrder.findUnique({ where: { id: 'fixture-legacy' } })).welcomeEmailStatus, 'legacy');
    assert.equal((await db.paymentOrder.findUnique({ where: { id: 'fixture-pending' } })).welcomeEmailStatus, 'pending');
    await assert.rejects(db.$executeRawUnsafe("UPDATE payment_orders SET welcome_email_status='invalid' WHERE id='fixture-pending'"));
    for (const migration of migrations) {
      const result = spawnSync('psql', ['-v', 'ON_ERROR_STOP=1', '-f', backend + '/prisma/migrations/' + migration + '/migration.sql'], { env: pgEnv(c.url), encoding: 'utf8' });
      assert.notEqual(result.status, 0, 'Reapplying raw SQL must fail rather than reset delivery markers');
    }
    assert.equal(await db.paymentOrder.count(), 2); assert.equal(await db.user.count(), 1);
    console.log('PASS migration preservation, defaults, legacy exclusion, CHECK constraint and safe rejection of duplicate raw application');
    const smtp = [], telegram = []; let smtpFail = false, providerBody;
    require.cache[require.resolve(live + '/node_modules/nodemailer')] = { exports: { createTransport: () => ({ sendMail: async mail => { smtp.push(mail); await new Promise(r => setTimeout(r, 20)); if (smtpFail) throw Error('Synthetic uncertain SMTP'); } }) } };
    const botStub = { bot: { api: { sendMessage: async (...args) => telegram.push(args) } } };
    const fakeHttps = { request(options, callback) {
      const req = new EventEmitter(); let body = ''; req.setTimeout = () => req; req.write = value => body += value;
      req.destroy = error => req.emit('error', error);
      req.end = () => { void (async () => {
        let value;
        if (options.method === 'POST') { providerBody = JSON.parse(body); value = { id: randomUUID(), confirmation: { confirmation_url: 'https://example.invalid/checkout' } }; }
        else { const order = await db.paymentOrder.findUnique({ where: { paymentId: options.path.split('/').pop() } }); assert(order);
          value = { id: order.paymentId, status: 'succeeded', paid: true, test: false, amount: { value: order.amount, currency: order.currency }, recipient: { account_id: order.shopId },
            metadata: { orderId: order.id, streamId: order.streamId, email: order.email, name: order.name, telegramUsername: order.telegramUsername } }; }
        const response = new EventEmitter(); response.statusCode = 200; callback(response); response.emit('data', JSON.stringify(value)); response.emit('end');
      })().catch(error => req.emit('error', error)); }; return req;
    } };
    const paymentPath = backend + '/src/routes/payment.js', payment = new Module(paymentPath);
    payment.filename = paymentPath; payment.paths = Module._nodeModulePaths(path.dirname(paymentPath));
    const realRequire = Module.createRequire(paymentPath);
    payment.require = name => name === 'https' ? fakeHttps : name === '../bot' ? botStub : realRequire(name);
    payment._compile(fs.readFileSync(paymentPath, 'utf8'), paymentPath);
    app = require(live + '/node_modules/fastify')({ logger: false }); app.register(local('src/routes/email')); app.register(payment.exports);
    const NativeDate = Date;
    global.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : ['2026-10-10T12:00:00Z'])); } static now() { return NativeDate.parse('2026-10-10T12:00:00Z'); } };
    let response;
    try { response = await app.inject({ method: 'POST', url: '/create-payment', payload: { email: 'checkout@example.invalid', name: '<img/src=x> Анна', telegramUsername: 'synthetic27' } }); }
    finally { global.Date = NativeDate; }
    assert.equal(response.statusCode, 200);
    const returned = new URL(providerBody.confirmation.return_url), fragment = new URLSearchParams(returned.hash.slice(1));
    assert.equal(returned.origin, 'https://telo-pomnit.ru'); assert.equal(returned.pathname, '/thanks.html'); assert.equal(returned.search, '');
    const cap = { orderId: fragment.get('welcome_order'), token: fragment.get('welcome_token') };
    const post = payload => app.inject({ method: 'POST', url: '/send-welcome', payload });
    assert.equal((await post({ email: 'arbitrary@example.invalid', name: 'Fake' })).statusCode, 403);
    assert.equal((await post({ ...cap, email: 'arbitrary@example.invalid' })).statusCode, 403);
    assert.equal((await post(cap)).statusCode, 409); assert.equal(smtp.length, 0);
    const order = await db.paymentOrder.findUnique({ where: { id: cap.orderId } });
    const webhook = () => app.inject({ method: 'POST', url: '/webhook/yukassa', payload: { event: 'payment.succeeded', object: { id: order.paymentId } } });
    const results = await Promise.all([...Array.from({ length: 8 }, webhook), ...Array.from({ length: 8 }, () => post(cap))]);
    assert(results.every(r => [200, 202, 409].includes(r.statusCode)), JSON.stringify(results.map(r => r.statusCode)));
    assert.equal(smtp.length, 1); assert.equal(smtp[0].to, order.email); assert(!smtp[0].html.includes('<img/src=x>')); assert(smtp[0].html.includes('&lt;img/src=x&gt;'));
    assert.equal((await db.paymentOrder.findUnique({ where: { id: order.id } })).welcomeEmailStatus, 'sent');
    assert.equal(await db.pendingEnrollment.count({ where: { paymentId: order.paymentId } }), 1);
    await webhook(); await post(cap); assert.equal(smtp.length, 1);
    const welcome = local('src/services/welcome-email');
    await welcome.sendPaidWelcome('fixture-legacy'); assert.equal(smtp.length, 1);
    const uncertain = await db.paymentOrder.create({ data: { amount: '15000.00', currency: 'RUB', shopId: 'fixture-shop', streamId: 'fixture-stream', email: 'uncertain@example.invalid', telegramUsername: 'synthetic', paymentId: randomUUID(), processedAt: new Date() } });
    smtpFail = true; assert.equal(await welcome.sendPaidWelcome(uncertain.id), 'unconfirmed'); smtpFail = false;
    await welcome.sendPaidWelcome(uncertain.id); assert.equal(smtp.length, 2);
    console.log('PASS actual Fastify checkout/return capability, pending/forged control, 16 concurrent webhook/manual calls, one durable SMTP claim, legacy and uncertain exclusion; all delivery/provider transports are stubs');
    await db.user.create({ data: { id: 'fixture-reminder', telegramId: 200n, accessStatus: 'approved', notificationsTime: '08:15' } });
    await db.stream.create({ data: { id: 'fixture-stream-2', name: 'Synthetic second', startDate: time, endDate: time } });
    for (const streamId of ['fixture-stream', 'fixture-stream-2']) await db.enrollment.create({ data: { userId: 'fixture-reminder', streamId, status: 'active', createdAt: new Date(time - 86400000) } });
    let attempts = 0;
    const make = fail => createReminderService({ sendMessage: async () => { attempts++; if (fail) throw Error('Synthetic timeout'); }, miniAppUrl: 'https://example.invalid' });
    await Promise.all(Array.from({ length: 8 }, () => make().sendDailyReminder(time))); assert.equal(attempts, 1);
    await Promise.all(Array.from({ length: 8 }, () => make().sendQuestionnaireReminders(time))); assert.equal(attempts, 2);
    await db.user.update({ where: { id: 'fixture-reminder' }, data: { notificationsTime: '09:15' } });
    await make().sendDailyReminder(new Date(time.getTime() + 3600000)); assert.equal(attempts, 2);
    await db.user.update({ where: { id: 'fixture-reminder' }, data: { notificationsEnabled: false } });
    await make().sendDailyReminder(new Date(time.getTime() + 86400000 + 3600000)); assert.equal(attempts, 2);
    await db.user.update({ where: { id: 'fixture-reminder' }, data: { notificationsEnabled: true } });
    await make(true).sendDailyReminder(new Date(time.getTime() + 86400000 + 3600000)); await make().sendDailyReminder(new Date(time.getTime() + 86400000 + 3600000)); assert.equal(attempts, 3);
    await db.user.update({ where: { id: 'fixture-reminder' }, data: { notificationsTime: '08:15', dailyReminderAttemptDay: null, questionnaireReminderAttemptDay: null } });
    fs.writeFileSync(stage + '/worker-attempts.log', '');
    const child = kind => new Promise((resolve, reject) => { const p = spawn(process.execPath, [__filename, '--worker', kind], { stdio: ['ignore', 'pipe', 'pipe'] }); let out = ''; p.stdout.on('data', x => out += x); p.stderr.on('data', x => out += x); p.on('error', reject); p.on('exit', code => code === 0 ? resolve() : reject(Error('Isolated claim worker failed'))); });
    await Promise.all([...Array.from({ length: 4 }, () => child('daily')), ...Array.from({ length: 4 }, () => child('questionnaire'))]);
    const workerLines = fs.readFileSync(stage + '/worker-attempts.log', 'utf8').trim().split('\n').sort();
    assert.deepEqual(workerLines, ['daily', 'questionnaire']);
    console.log('PASS actual PostgreSQL reminder claims: saved time, duplicate enrollments, 16 concurrent runners, off/time changes, uncertain retention, 8 independent processes produce exactly one attempt per kind');
    const { reserveLegacyReminderSlots } = require(stage + '/scripts/reminder-release-boundary.cjs');
    await reserveLegacyReminderSlots(db, new Date('2026-10-15T06:59:00Z'));
    assert.equal((await db.user.findUnique({ where: { id: 'fixture-before' } })).questionnaireReminderAttemptDay, null);
    await reserveLegacyReminderSlots(db, new Date('2026-10-15T07:00:00Z'));
    let boundary = await db.user.findUnique({ where: { id: 'fixture-before' } });
    assert.equal(boundary.questionnaireReminderAttemptDay, '2026-10-15'); assert.equal(boundary.dailyReminderAttemptDay, null);
    await reserveLegacyReminderSlots(db, new Date('2026-10-15T17:00:00Z'));
    boundary = await db.user.findUnique({ where: { id: 'fixture-before' } });
    assert.equal(boundary.dailyReminderAttemptDay, '2026-10-15'); assert.equal(boundary.notificationsEnabled, false); assert.equal(boundary.notificationsTime, '08:15');
    const repeat = await reserveLegacyReminderSlots(db, new Date('2026-10-15T17:00:00Z')); assert.equal(repeat.dailyReserved, 0); assert.equal(repeat.questionnaireReserved, 0);
    console.log('PASS one-time release boundary: previous 10:00/20:00 Moscow cron cannot cause a second same-day attempt; preferences and existing claims preserved');
    console.log('PASS real external email/provider/Telegram sends: 0; production rows read/copied/modified by tests: 0 (schema only)');
  } finally { if (app) await app.close(); await db.$disconnect(); }
}
(async () => {
  if (process.argv.includes('--prepare')) prepare();
  else if (process.argv.includes('--cleanup')) cleanup();
  else await test(process.argv.includes('--worker') ? process.argv.at(-1) : null);
})().catch(error => { console.error('Isolated PostgreSQL test failed:', error.name, error.code || '', error.message?.slice(0, 300)); process.exitCode = 1; });
