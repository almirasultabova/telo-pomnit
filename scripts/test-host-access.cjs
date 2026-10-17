// Synthetic accounts only: permanent HOST tools do not grant administration.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
let current;
let managedReads = 0;
const db = {
  enrollment: { findMany: async () => [] },
  stream: { findMany: async () => { managedReads++; return []; } },
  user: { findUnique: async () => current }
};
const env = { ADMIN_TELEGRAM_IDS: '100', JWT_SECRET: 'synthetic' };
function load(relative, dependencies) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, relative), 'utf8'), {
    module, exports: module.exports, require: name => {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      throw Error('Unexpected dependency ' + name);
    }, process: { env }, console, URLSearchParams, Buffer
  });
  return module.exports;
}
const me = load('backend/src/routes/me.js', {
  '../db': db, '../services/auth': {}, '../services/consent': {},
  '../services/app-visits': {
    currentVisitStreak: () => { throw Error('Visit statistics are outside this access test'); },
    recordAppVisit: () => { throw Error('Visit writes are forbidden in this access test'); }
  }
});
const auth = load('backend/src/services/auth.js', {
  crypto: require('crypto'), jsonwebtoken: { verify: () => ({ userId: current.id, tokenVersion: 0, purpose: 'club' }) },
  '../db': db, './admission': { admissionError: u => u.accessStatus === 'approved' ? null : { code: 'CLUB_ACCESS_PENDING' } }
});
(async () => {
  for (const [role, telegramId, expected] of [['HOST', 200n, true], ['PARTICIPANT', 200n, false], ['HOST', 100n, true]]) {
    current = { id: 'fixture', role, telegramId, accessStatus: 'approved', createdAt: new Date('2026-10-01'), tokenVersion: 0 };
    for (const now of [Date.parse('2026-10-11'), Date.parse('2030-01-01')]) {
      const access = await me.getProgramAccess(current, now);
      assert.equal(access.ai.canWrite, expected);
      assert.equal(access.ai.expiresAt, null);
      assert.equal(access.diary, true);
    }
    let status = null;
    const reply = { sent: false, code: n => { status = n; return reply; }, send: () => { reply.sent = true; } };
    await auth.requireAdmin({ headers: { authorization: 'Bearer synthetic' } }, reply);
    assert.equal(status, telegramId === 100n ? null : 403);
  }
  assert.equal(managedReads, 4);
  console.log('Passed: 6 permanent-access cases, 3 administration boundaries; no real DB writes');
})().catch(e => { console.error(e); process.exitCode = 1; });
