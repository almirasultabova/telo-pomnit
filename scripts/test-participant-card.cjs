// Actual Fastify routes/auth, synthetic read-only database. No .env/Prisma/socket/provider calls.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const backend = path.resolve(process.env.PARTICIPANT_CARD_TEST_BACKEND || path.join(root, 'backend'));
const out = path.join(root, 'output/participant-card-JAPP065'); fs.mkdirSync(out, { recursive: true });
process.env.JWT_SECRET = 'JAPP065-synthetic-secret-not-for-production';
process.env.ADMIN_TELEGRAM_IDS = '990001';
process.env.DATABASE_URL = 'postgresql://fictional:fictional@127.0.0.1:1/never_connect';
process.env.BOT_TOKEN = 'synthetic-disabled';
let writes = 0, externalCalls = 0, providerCalls = 0, notices = 0, cardReads = 0;
global.fetch = async () => { externalCalls++; throw Error('External transport forbidden'); };
const now = new Date('2026-10-17T10:00:00Z');
const streamA = { id: '10000000-0000-4000-8000-000000000001', name: 'Fictional A', startDate: now, endDate: now, isActive: true };
const streamB = { ...streamA, id: '10000000-0000-4000-8000-000000000002', name: 'Fictional B' };
const base = { telegramUsername: 'fictional_user', name: 'Учебная участница', firstName: 'Учебная', lastName: null, username: null,
  phone: '+00000000000', role: 'PARTICIPANT', createdAt: now, tokenVersion: 0, accessStatus: 'approved', deletedAt: null,
  consentText: 'DO_NOT_EXPOSE_CONSENT', admissionLeaseUntil: now, admissionDeliveredIds: ['DO_NOT_EXPOSE_LEASE'],
  notificationsTime: '20:00', preferredAppUrl: 'DO_NOT_EXPOSE_INTERNAL', futureSecret: 'DO_NOT_EXPOSE_FUTURE' };
const users = [
  { ...base, id: 'owner', telegramId: 990001n },
  { ...base, id: 'admin', telegramId: 990002n, role: 'ADMIN' },
  { ...base, id: 'host', telegramId: 990003n, role: 'HOST' },
  { ...base, id: 'participant', telegramId: 990004n },
  { ...base, id: 'pending', telegramId: 990005n, accessStatus: 'pending' },
  { ...base, id: 'rejected', telegramId: 990006n, accessStatus: 'rejected' },
  { ...base, id: 'deleted', telegramId: 990007n, deletedAt: now },
  { ...base, id: 'ungranted-host', telegramId: 990008n, role: 'HOST' },
  { ...base, id: 'target', telegramId: 9007199254740993n,
    enrollments: [{ id: 'fictional-enrollment', userId: 'target', streamId: streamA.id, status: 'active', paidAt: null, accessBasis: 'free', accessExpires: null, createdAt: now, stream: streamA }],
    questionnaires: [{ id: 'fictional-pre', userId: 'target', streamId: streamA.id, type: 'pre', formVersion: 1, submittedAt: now, answers: { currentSituation: 'Fictional owner-only answer' } }],
    diagnosticResults: [{ id: 'fictional-result', userId: 'target', patternId: 'synthetic', createdAt: now, scores: { synthetic: 1 } }],
    diaryEntries: [{ note: 'PRIVATE_DIARY_MUST_NOT_APPEAR_IN_CARD' }], aiChatSessions: [{ messages: ['PRIVATE_AI_MUST_NOT_APPEAR_IN_CARD'] }] }
];
const relations = ['enrollments', 'questionnaires', 'diagnosticResults', 'diaryEntries', 'aiChatSessions'];
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some(w => matches(row, w));
    if (key === 'AND') return value.every(w => matches(row, w));
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('in' in value) return value.in.includes(row[key]);
      if ('contains' in value) return String(row[key] || '').toLowerCase().includes(value.contains.toLowerCase());
      throw Error('Unsupported synthetic filter ' + key);
    }
    return (row[key] ?? null) === value;
  });
}
function project(row, spec = {}) {
  if (!row) return null;
  let result = spec.select ? {} : Object.fromEntries(Object.entries(row).filter(([key]) => !relations.includes(key)));
  for (const [key, rule] of Object.entries(spec.select || spec.include || {})) {
    if (rule === true) result[key] = row[key] ?? (relations.includes(key) ? [] : null);
    else if (rule && typeof rule === 'object') {
      const value = row[key];
      result[key] = Array.isArray(value) ? value.slice(0, rule.take ?? value.length).map(v => project(v, rule)) : project(value, rule);
    }
  }
  return result;
}
const diary = users.map(u => ({ id: 'diary-' + u.id, userId: u.id, createdAt: now, zone: 'fictional', sensations: [], note: 'PRIVATE_DIARY_' + u.id }));
const sessions = users.map(u => ({ id: 'session-' + u.id, sessionId: 'conversation-' + u.id, userId: u.id, createdAt: now, messages: ['PRIVATE_AI_' + u.id] }));
const grants = [{ userId: 'host', streamId: streamA.id, stream: streamA }];
const write = async () => { writes++; throw Error('Writes forbidden in participant card tests'); };
const readOnly = methods => new Proxy({ ...methods, create: write, update: write, updateMany: write, delete: write, deleteMany: write, upsert: write }, {
  get(target, key) { if (key in target) return target[key]; throw Error('Unexpected model operation ' + String(key)); }
});
const db = {
  user: readOnly({
    async findUnique(args) { if (args.include?.questionnaires || args.select?.questionnaires) cardReads++; return project(users.find(u => matches(u, args.where)), args); },
    async findMany(args) { return users.filter(u => matches(u, args.where)).map(u => project(u, args)); },
    async count(args) { return users.filter(u => matches(u, args.where)).length; }
  }),
  diaryEntry: readOnly({ async findMany(args) { return diary.filter(r => matches(r, args.where)).map(r => project(r, args)); } }),
  aiChatSession: readOnly({ async findMany(args) { return sessions.filter(r => matches(r, args.where)); }, async findFirst(args) { return sessions.find(r => matches(r, args.where)); } }),
  streamOverviewGrant: readOnly({ async findMany(args) { return grants.filter(r => matches(r, args.where)); } }),
  stream: readOnly({ async findMany(args = {}) { return [streamA, streamB].filter(r => matches(r, args.where)).map(r => project(r, args)); } }),
  $transaction: async callback => callback(db)
};
const modulePath = relative => path.join(backend, relative);
require.cache[require.resolve(modulePath('src/db.js'))] = { exports: db };
require.cache[require.resolve(modulePath('src/bot.js'))] = { exports: new Proxy({}, { get: () => () => { notices++; throw Error('Notifications forbidden'); } }) };
class DisabledOpenAI { constructor() { this.chat = { completions: { create: async () => { providerCalls++; throw Error('Provider disabled'); } } }; } }
require.cache[require.resolve('openai', { paths: [backend] })] = { exports: DisabledOpenAI };
const Fastify = require(modulePath('node_modules/fastify'));
const jwt = require(modulePath('node_modules/jsonwebtoken'));
const token = (id, extra = {}) => jwt.sign({ userId: id, tokenVersion: 0, purpose: 'club', ...extra }, process.env.JWT_SECRET, extra.exp ? {} : { expiresIn: '1h' });
const stringify = value => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v);
const snapshot = stringify({ users, diary, sessions, grants });
const checks = [];
function ok(name) { checks.push(name); console.log('PASS', name); }
(async () => {
  const app = Fastify({ logger: false });
  if (process.argv.includes('--baseline')) {
    // The archived source is the exact pre-fix module; retain its normal relative requires.
    const Module = require('node:module'), filename = modulePath('src/routes/admin.js');
    const archived = new Module(filename, module); archived.filename = filename;
    archived.paths = Module._nodeModulePaths(path.dirname(filename));
    archived._compile(fs.readFileSync(path.join(out, 'admin-before.js'), 'utf8'), filename);
    await app.register(archived.exports);
  } else await app.register(require(modulePath('src/routes/admin.js')));
  await app.register(require(modulePath('src/routes/access-admin.js')));
  await app.register(require(modulePath('src/routes/diary.js')));
  await app.register(require(modulePath('src/routes/ai.js')));
  await app.register(require(modulePath('src/routes/stream-overview.js')));
  const get = (id, url, suppliedToken) => app.inject({ method: 'GET', url, headers: id ? { authorization: 'Bearer ' + (suppliedToken || token(id)) } : {} });
  const card = '/admin/participants/target';
  const before = await get('owner', card);
  if (process.argv.includes('--baseline')) {
    assert.equal(before.statusCode, 500); assert.match(before.body, /BigInt/);
    fs.writeFileSync(path.join(out, 'baseline.json'), JSON.stringify({ status: before.statusCode, response: before.json(), cardReads, writes, externalCalls, providerCalls, notices }, null, 2));
    console.log('CONFIRMED actual Fastify serialization500 on synthetic BigInt; no writes/sends'); await app.close(); return;
  }
  assert.equal(before.statusCode, 200, before.body);
  assert.equal(before.headers['cache-control'], 'private, no-store');
  const body = before.json();
  assert.equal(body.telegramId, '9007199254740993'); assert.equal(typeof body.telegramId, 'string');
  assert.equal(body.enrollments[0].stream.id, streamA.id); assert.equal(body.enrollments[0].status, 'active');
  assert.equal(body.questionnaires[0].type, 'pre'); assert.equal(body.diagnosticResults[0].patternId, 'synthetic');
  ok('owner card200, exact Telegram ID, existing stream/questionnaire/result contract');
  for (const key of ['tokenVersion', 'consentText', 'admissionLeaseUntil', 'admissionDeliveredIds', 'preferredAppUrl', 'futureSecret', 'deletedAt', 'diaryEntries', 'aiChatSessions']) assert(!Object.hasOwn(body, key), key);
  assert(!before.body.includes('DO_NOT_EXPOSE')); assert(!before.body.includes('PRIVATE_'));
  ok('explicit DTO excludes session/internal/future fields, diary and AI');
  for (const [id, expected] of [[null, 401], ['admin', 403], ['host', 403], ['ungranted-host', 403], ['participant', 403], ['pending', 403], ['rejected', 403], ['deleted', 401]]) {
    const readsBefore = cardReads, r = await get(id, card); assert.equal(r.statusCode, expected, id); assert.equal(cardReads, readsBefore, 'target data read before authorization');
    ok('legacy owner-only: ' + (id || 'anonymous') + ' -> ' + expected);
  }
  for (const supplied of ['invalid', token('owner', { tokenVersion: -1 }), token('owner', { exp: Math.floor(Date.now() / 1000) - 60 }), token('owner', { purpose: 'data-rights' })]) {
    const r = await get('owner', card, supplied); assert.equal(r.statusCode, 401); assert(!r.body.includes('Учебная'));
  }
  ok('invalid, revoked, expired and wrong-purpose credentials denied');
  assert.equal((await get('participant', '/admin/participants/participant')).statusCode, 403);
  assert.equal((await get('participant', card + '?role=ADMIN&owner=true')).statusCode, 403);
  ok('own-ID and query role spoofing do not grant card access');
  assert.equal((await get('owner', '/admin/participants/missing')).statusCode, 404);
  assert.equal((await get('owner', '/admin/participants/deleted')).statusCode, 404);
  ok('missing/deleted target ->404');
  const list = await get('owner', '/admin/participants'); assert.equal(list.statusCode, 200);
  assert(!list.json().some(r => r.id === 'deleted')); assert.equal(list.json().find(r => r.id === 'target').telegramId, '9007199254740993');
  ok('existing owner participant list stays serializable and excludes deleted');
  for (const [id, expected] of [['owner', 200], ['admin', 200], ['host', 403], ['participant', 403], ['pending', 403], ['deleted', 401], [null, 401]]) {
    const r = await get(id, '/access-admin/users'); assert.equal(r.statusCode, expected, id);
    if (expected === 200) {
      assert(!r.body.includes('DO_NOT_EXPOSE')); assert(!r.body.includes('Fictional owner-only answer')); assert(!r.body.includes('PRIVATE_'));
      for (const u of r.json().items) for (const key of ['questionnaires', 'diagnosticResults', 'diaryEntries', 'aiChatSessions', 'tokenVersion', 'consentText']) assert(!Object.hasOwn(u, key), key);
    }
    ok('current management list: ' + (id || 'anonymous') + ' -> ' + expected);
  }
  for (const id of ['owner', 'admin', 'host', 'participant']) {
    const d = await get(id, '/diary?userId=target'); assert.equal(d.statusCode, 200); assert.equal(d.json().length, 1); assert.equal(d.json()[0].userId, id);
    const a = await get(id, '/ai/sessions?userId=target'); assert.equal(a.statusCode, 200); assert.equal(a.json().length, 1); assert.equal(a.json()[0].sessionId, 'conversation-' + id);
    assert.equal((await get(id, '/ai/sessions/conversation-target')).statusCode, 404);
    assert.equal((await get(id, '/ai/sessions/conversation-' + id)).statusCode, 200);
    const preview = await app.inject({ method: 'POST', url: '/ai/context-preview', headers: { authorization: 'Bearer ' + token(id) }, payload: { diaryEntryIds: ['diary-target'] } });
    assert.equal(preview.statusCode, 403);
    ok(id + ': own diary/AI history only; foreign session/context denied');
  }
  for (const [id, expected] of [['owner', 200], ['host', 200], ['ungranted-host', 403], ['admin', 403], ['participant', 403], [null, 401]]) {
    const r = await get(id, '/stream-overview/session'); assert.equal(r.statusCode, expected, id);
    if (id === 'host') { assert.equal(r.json().streams.length, 1); assert.equal(r.json().streams[0].id, streamA.id); }
    ok('overview grant boundary: ' + (id || 'anonymous') + ' -> ' + expected);
  }
  assert.equal((await get('host', '/stream-overview/' + streamB.id)).statusCode, 403); ok('HOST cannot read another stream overview');
  assert.equal(stringify({ users, diary, sessions, grants }), snapshot);
  assert.equal(writes + externalCalls + providerCalls + notices, 0); ok('fixture data unchanged; DB writes / external calls / AI / notifications all zero');
  fs.writeFileSync(path.join(out, 'checks.json'), JSON.stringify({ passed: checks.length, checks, writes, externalCalls, providerCalls, notices }, null, 2));
  await app.close(); console.log('PASS', checks.length, 'participant card/access checks');
})().catch(e => { console.error(e); process.exitCode = 1; });
