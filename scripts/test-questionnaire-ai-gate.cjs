// Actual Fastify/auth with isolated database and provider; no real writes or AI calls.
const path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../backend'), local = p => require(path.join(root, p));
process.env.JWT_SECRET = 'questionnaire-gate-fixture';
process.env.ADMIN_TELEGRAM_IDS = '100';
let user = { id: 'A', telegramId: 200n, role: 'PARTICIPANT', accessStatus: 'approved', tokenVersion: 0, createdAt: new Date('2026-10-01') };
let forms = [], providerCalls = 0, sessions = [], status = 'active';
const stream = { id: 'own', name: 'Synthetic', startDate: '2020-01-01', endDate: '2030-01-01', meetings: [] };
const db = {
  user: { findUnique: async () => user },
  enrollment: { findMany: async () => [{ stream, status, accessBasis: 'free', createdAt: new Date('2026-10-01') }] },
  stream: { findMany: async () => [stream] },
  questionnaire: { findMany: async ({ where }) => forms.filter(q => q.userId === where.userId && q.type === where.type && where.streamId.in.includes(q.streamId)) },
  aiChatSession: {
    findMany: async () => sessions,
    findFirst: async ({ where }) => sessions.find(s => s.userId === where.userId && s.sessionId === where.sessionId),
    create: async ({ data }) => { sessions.push(data); return data; },
    update: async ({ where, data }) => Object.assign(sessions.find(s => s.sessionId === where.sessionId), data)
  },
  $queryRawUnsafe: async () => [],
  $transaction: async fn => fn(db)
};
require.cache[require.resolve(path.join(root, 'src/db'))] = { exports: db };
require.cache[require.resolve(path.join(root, 'node_modules/openai'))] = { exports: class {
  chat = { completions: { create: async () => { providerCalls++; return { choices: [{ message: { content: 'Synthetic response' } }] }; } } };
} };
(async () => {
  const app = local('node_modules/fastify')({ logger: false });
  app.register(local('src/routes/me')); app.register(local('src/routes/ai'));
  const headers = { authorization: 'Bearer ' + local('src/services/auth').createToken('A', 0) };
  const access = () => local('src/routes/me').getProgramAccess(user, Date.parse('2026-10-13T10:00:00Z'));
  let result = await access();
  assert.equal(result.ai.reason, 'questionnaire_required'); assert.equal(result.ai.questionnaireStreamId, 'own');
  assert.equal(result.ai.canWrite, false); assert.equal(result.canWrite, false);
  for (const key of ['diary', 'reactions', 'checkins', 'aiHistory']) assert.equal(result[key], true);
  assert.equal(result.streams[0].canAttend, true); assert.equal(result.streams[0].canReadRecordings, true);
  let response = await app.inject({ method: 'POST', url: '/ai/chat', headers, payload: { message: 'Synthetic question' } });
  assert.equal(response.statusCode, 403); assert.equal(response.json().access.reason, 'questionnaire_required');
  assert.equal(providerCalls, 0); assert.equal(sessions.length, 0);
  forms = [{ userId: 'B', streamId: 'own', type: 'pre' }, { userId: 'A', streamId: 'other', type: 'pre' }, { userId: 'A', streamId: 'own', type: 'post' }];
  assert.equal((await access()).ai.canWrite, false);
  forms.push({ userId: 'A', streamId: 'own', type: 'pre' });
  result = await access(); assert.equal(result.ai.canWrite, true); assert.equal(result.ai.questionnaireStreamId, null);
  response = await app.inject({ method: 'POST', url: '/ai/chat', headers, payload: { message: 'Synthetic question', contextMode: 'none' } });
  assert.equal(response.statusCode, 200); assert.equal(providerCalls, 1);
  status = 'cancelled'; assert.equal((await access()).ai.canWrite, false);
  status = 'active'; stream.endDate = '2026-10-12';
  assert.equal((await access()).ai.reason, 'ended'); assert.equal((await access()).ai.canWrite, false);
  stream.endDate = '2030-01-01'; stream.startDate = '2026-10-15'; forms = [];
  assert.equal((await access()).ai.reason, 'not_started');
  for (const [role, telegramId] of [['HOST', 200n], ['PARTICIPANT', 100n]]) {
    user = { ...user, role, telegramId }; assert.equal((await access()).ai.canWrite, true);
  }
  await app.close();
  console.log('PASS: own pre questionnaire gates AI, direct POST denied before provider/session, unlock after save, personal tools/meetings preserved, future/expired/cancelled/service access unchanged');
})().catch(e => { console.error(e); process.exitCode = 1; });
