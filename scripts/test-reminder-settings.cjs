// Actual Fastify routes/auth with synthetic users and an in-memory DB.
// No .env, bot, SMTP, Telegram or production DB is loaded.
const path = require('node:path'), assert = require('node:assert/strict');
const backend = path.resolve(__dirname, '../backend');
const local = p => require(path.join(backend, p));
process.env.JWT_SECRET = 'reminder-settings-synthetic-only';
process.env.ADMIN_TELEGRAM_IDS = '';
const fixture = id => ({ id, telegramId: id === 'A' ? 1n : 2n, tokenVersion: 0,
  name: 'Synthetic ' + id, role: 'PARTICIPANT', accessStatus: 'approved', deletedAt: null,
  createdAt: new Date('2026-10-15'), notificationsTime: '20:00', notificationsEnabled: true,
  dailyReminderAttemptDay: '2026-10-15', questionnaireReminderAttemptDay: '2026-10-15' });
const users = [fixture('A'), fixture('B')], updates = [], locks = [];
const db = {
  user: {
    findUnique: async ({ where }) => structuredClone(users.find(u => u.id === where.id)),
    update: async ({ where, data }) => {
      updates.push(structuredClone({ where, data }));
      const user = users.find(u => u.id === where.id);
      for (const [key, value] of Object.entries(data)) user[key] = value?.increment ? user[key] + value.increment : value;
      return structuredClone(user);
    }
  },
  $queryRawUnsafe: async (_, id) => { locks.push(id); return [{ id }]; }
};
db.$transaction = async fn => fn(db);
for (const name of ['enrollment', 'diaryEntry', 'triggerEntry', 'checkin', 'diagnosticResult', 'questionnaire', 'aiChatSession', 'feedback', 'accessAction', 'accessNotice']) {
  db[name] = { findMany: async ({ where }) => { assert.equal(where.userId, 'A'); return []; }, deleteMany: async () => ({ count: 0 }) };
}
require.cache[require.resolve(path.join(backend, 'src/db'))] = { exports: db };
// The PDF route is registered but never invoked by this settings test.
require.cache[require.resolve(path.join(backend, 'src/services/diary-pdf'))] = { exports: { createDiaryPdf: () => { throw Error('Unexpected PDF call'); } } };
(async () => {
  const app = local('node_modules/fastify')({ logger: false });
  app.register(local('src/routes/me')); app.register(local('src/routes/gdpr'));
  const auth = local('src/services/auth');
  const headers = { authorization: 'Bearer ' + auth.createToken('A', 0) };
  const patch = payload => app.inject({ method: 'PATCH', url: '/me', headers, payload });
  let response = await patch({ notificationsTime: '08:15', notificationsEnabled: false });
  assert.equal(response.statusCode, 200); assert.equal(response.json().notificationsTime, '08:15'); assert.equal(response.json().notificationsEnabled, false);
  response = await app.inject({ url: '/me', headers });
  assert.equal(response.statusCode, 200); assert.equal(response.json().user.notificationsEnabled, false); assert.equal(response.json().user.notificationsTime, '08:15');
  assert(!('dailyReminderAttemptDay' in response.json().user));
  response = await patch({ notificationsEnabled: true }); assert.equal(response.statusCode, 200); assert.equal(response.json().notificationsTime, '08:15');
  assert.equal(users[0].dailyReminderAttemptDay, '2026-10-15'); assert.equal(users[0].questionnaireReminderAttemptDay, '2026-10-15');
  response = await patch({ userId: 'B', notificationsTime: '09:30', dailyReminderAttemptDay: null, questionnaireReminderAttemptDay: null });
  assert.equal(response.statusCode, 200); assert.equal(users[0].notificationsTime, '09:30'); assert.equal(users[1].notificationsTime, '20:00');
  assert.equal(users[0].dailyReminderAttemptDay, '2026-10-15'); assert.equal(users[0].questionnaireReminderAttemptDay, '2026-10-15');
  assert(updates.every(u => u.where.id === 'A')); assert(locks.every(id => id === 'A'));
  const beforeInvalid = updates.length;
  for (const notificationsTime of ['7:00', '24:00', '12:60', '08:15Z', '']) assert.equal((await patch({ notificationsTime })).statusCode, 400);
  assert.equal((await patch({ notificationsEnabled: 'not-a-boolean' })).statusCode, 400);
  assert.equal((await app.inject({ method: 'PATCH', url: '/me', payload: { notificationsEnabled: false } })).statusCode, 401);
  users[0].accessStatus = 'rejected'; assert.equal((await patch({ notificationsEnabled: false })).statusCode, 403); users[0].accessStatus = 'approved';
  assert.equal(updates.length, beforeInvalid);
  response = await app.inject({ url: '/my-data', headers }); assert.equal(response.statusCode, 200);
  assert.equal(response.json().profile.dailyReminderAttemptDay, '2026-10-15'); assert.equal(response.json().profile.questionnaireReminderAttemptDay, '2026-10-15');
  response = await app.inject({ method: 'DELETE', url: '/delete-me', headers: { authorization: 'Bearer ' + auth.createDataRightsToken('A', 0) }, payload: { confirm: 'DELETE_MY_DATA' } });
  assert.equal(response.statusCode, 200); assert.equal(users[0].notificationsEnabled, false);
  assert.equal(users[0].dailyReminderAttemptDay, null); assert.equal(users[0].questionnaireReminderAttemptDay, null);
  assert.equal(users[1].notificationsEnabled, true); assert.equal(users[1].dailyReminderAttemptDay, '2026-10-15');
  await app.close();
  console.log('PASS settings persistence/readback, time validation, own-account auth, immutable attempt markers, own export/deletion; real sends/network/production DB calls: 0');
})().catch(error => { console.error(error); process.exitCode = 1; });
