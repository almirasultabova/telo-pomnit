// Synthetic storage/API regression: no production API or participant data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const source = fs.readFileSync('app/js/storage.js', 'utf8');
const backing = new Map();
let unavailable = false;
const localStorage = {
  getItem: key => { if (unavailable) throw Error('blocked'); return backing.get(key) ?? null; },
  setItem: (key, value) => { if (unavailable) throw Error('blocked'); backing.set(key, String(value)); },
  removeItem: key => { if (unavailable) throw Error('blocked'); backing.delete(key); }
};
function boot(api) {
  const memory = new Map();
  const context = vm.createContext({
    window: { localStorage, addEventListener() {} }, crypto: { randomUUID },
    AppLocalStorage: {
      getItem: key => { try { return localStorage.getItem(key); } catch { return memory.get(key) ?? null; } },
      setItem: (key, value) => { memory.set(key, value); try { localStorage.setItem(key, value); } catch {} },
      removeItem: key => { memory.delete(key); try { localStorage.removeItem(key); } catch {} }
    },
    Api: api, setTimeout: () => 1, clearTimeout() {}, console
  });
  return vm.runInContext(source + '\nStorage', context);
}
const record = { date: '2026-10-08T12:00:00.000Z', zone: 'chest', sensations: ['heat'], note: 'Synthetic fixture' };
async function main() {
  let fail = true;
  const server = new Map();
  const sent = [];
  const api = {
    isAuthed: () => true,
    getDiary: async () => [...server.values()], getDiagResult: async () => null,
    getHabitualResult: async () => null,
    getTriggers: async () => [], getCheckins: async () => [],
    saveDiaryEntry: async body => {
      sent.push(body);
      if (fail) throw Object.assign(Error('server unavailable'), { status: 500 });
      if (!server.has(body.clientId)) server.set(body.clientId, { ...body, id: 'server-' + body.clientId });
      return server.get(body.clientId);
    }
  };
  backing.set('tp_diary_entries', JSON.stringify([{ ...record, id: 'legacy' }]));
  backing.set('tp_consent_given', 'true');
  let storage = boot(api);
  storage.bindUser('A');
  assert.equal(storage.getDiaryEntries().length, 0);
  assert.equal(storage.isConsentGiven(), false);
  assert.equal(storage.hasLegacyData(), true);
  const pending = storage.saveDiaryEntry(record);
  await storage.flushPending();
  assert.equal(pending.syncStatus, 'pending');
  storage = boot(api); // closing/reopening destroys all JS memory
  storage.bindUser('A');
  await storage.initFromApi();
  assert.equal(storage.getDiaryEntries()[0].clientId, pending.clientId);
  assert.equal(storage.getDiaryEntries()[0].syncStatus, 'pending');
  // Nonempty server history must not overwrite unsent text.
  server.set('older', { ...record, id: 'older', date: '2026-10-07T12:00:00Z' });
  await storage.initFromApi();
  assert.equal(storage.getDiaryEntries().length, 2);
  await storage.flushPending(); // finish the failed background attempt
  fail = false;
  await storage.flushPending();
  assert.equal(storage.getDiarySyncStatus(pending.clientId), 'synced');
  assert.equal(server.size, 2);
  assert(sent.every(body => body.clientId === pending.clientId));
  storage.bindUser('B');
  assert.equal(storage.getDiaryEntries().length, 0);
  storage.setConsentFromServer(false);
  assert.equal(storage.isConsentGiven(), false);
  storage.bindUser('A');
  assert.equal(storage.getDiaryEntries().length, 2);
  storage.setConsentFromServer(true);
  assert.equal(storage.isOnboardingDone(), true);
  storage.setConsentFromServer(false);
  assert.equal(storage.isOnboardingDone(), false);
  // Lost response after commit: replay must retain the same client ID.
  let lostResponse = true;
  api.saveDiaryEntry = async body => {
    if (!server.has(body.clientId)) server.set(body.clientId, { ...body, id: 'server-' + body.clientId });
    if (lostResponse) { lostResponse = false; throw Error('response lost'); }
    return server.get(body.clientId);
  };
  const second = storage.saveDiaryEntry({ ...record, note: 'Second synthetic fixture' });
  await storage.flushPending();
  await storage.flushPending();
  assert.equal(server.size, 3);
  assert.equal(storage.getDiarySyncStatus(second.clientId), 'synced');
  // A late GET for account A must never hydrate account B.
  const oldGet = api.getDiary;
  let completeRead;
  api.getDiary = () => new Promise(resolve => { completeRead = resolve; });
  const oldInit = storage.initFromApi();
  storage.bindUser('B');
  completeRead([{ ...record, id: 'late-private-A' }]);
  await oldInit;
  assert.equal(storage.getDiaryEntries().length, 0);
  api.getDiary = oldGet;
  // Blocked browser storage cannot be labelled as durable local success.
  unavailable = true;
  storage = boot(api);
  storage.bindUser('C');
  const volatile = storage.saveDiaryEntry(record);
  assert.equal(volatile.syncStatus, 'memory-only');
  await storage.flushPending();
  assert.equal(storage.getDiarySyncStatus(volatile.clientId), 'synced');
  storage.clearUser();
  assert.equal(storage.getDiaryEntries().length, 0);
  assert.throws(() => storage.saveDiaryEntry(record), /USER_REQUIRED/);
  // A POST still awaiting its transport timeout must not hold the splash.
  unavailable = false;
  storage = boot({ ...api, saveDiaryEntry: () => new Promise(() => {}) });
  storage.bindUser('startup');
  const waiting = storage.saveDiaryEntry(record);
  await Promise.race([
    storage.initFromApi(),
    new Promise((_, reject) => setTimeout(() => reject(Error('Startup waits for pending POST')), 100))
  ]);
  assert.equal(storage.getDiarySyncStatus(waiting.clientId), 'pending');
  const durableRows = JSON.parse(backing.get(storage.key('diary_v2')));
  assert(durableRows.some(row => row.clientId === waiting.clientId));
  // Returning to the same identity starts a new auth generation; a stale
  // hanging transport cannot permanently block its queue.
  const newApi = { ...api, saveDiaryEntry: async body => ({ ...body, id: 'returned-' + body.clientId }) };
  // boot exposes no production global: replace the method on the shared mock.
  const startupApi = { ...api, saveDiaryEntry: () => new Promise(() => {}) };
  storage = boot(startupApi);
  storage.bindUser('returning');
  const returning = storage.saveDiaryEntry(record);
  await Promise.resolve();
  storage.clearUser();
  storage.bindUser('returning');
  startupApi.saveDiaryEntry = newApi.saveDiaryEntry;
  await storage.flushPending();
  assert.equal(storage.getDiarySyncStatus(returning.clientId), 'synced');
  console.log('PASS: pending survives reload/merge; stable retry; account isolation; legacy quarantine; consent; memory-only ack');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
