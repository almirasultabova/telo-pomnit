// Pure calendar/chart fixtures. No server, personal data or external services.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('app/js/app.js', 'utf8');
const calendar = source.slice(source.indexOf('function moscowDay('), source.indexOf('function avgOf('));
const chart = source.slice(source.indexOf('function scaleValue('), source.indexOf('// ─── 3. Итоговое'));
const notes = source.slice(source.indexOf('function renderRecentNotes('), source.indexOf('// ─── Утилита: склонение'));
const october = { id: 'oct', name: 'October fixture', startDate: '2026-10-15T00:00:00Z', endDate: '2026-11-12T00:00:00Z', meetings: [{ id: 'oct1' }, { id: 'oct2' }] };
const archive = { id: 'spring', name: 'Archive fixture', startDate: '2026-04-16T00:00:00Z', endDate: '2026-05-14T00:00:00Z', meetings: [{ id: 'spring1' }] };
let selected = october, rows = [];
const context = vm.createContext({
  Date, Intl, currentProgram: () => selected, programNow: () => Date.parse('2026-10-20T10:00:00Z'),
  Storage: { getCheckins: () => rows, getAttended: () => ['spring1', 'oct2'] },
  CHECKIN_SCALES: ['tension', 'anxiety', 'energy', 'safety', 'bodyContact'].map(key => ({ key, label: key })),
  avgOf: values => values.reduce((a,b) => a+b, 0) / values.length
});
context.escapeAccessText = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
vm.runInContext(calendar + '\n' + chart + '\n' + notes, context);
const { moscowDay, streamPeriod, streamState, getStreamWeek, inStreamPeriod, periodStreak, selectedAttendance, renderCheckinChart, scaleValue } = context;
assert.equal(moscowDay('2026-10-14T21:00:00Z'), '2026-10-15');
assert.equal(streamPeriod(october).weeks, 5);
assert.equal(streamState(october, Date.parse('2026-10-14T20:59:59Z')), 'upcoming');
assert.equal(streamState(october, Date.parse('2026-10-14T21:00:00Z')), 'current');
assert.equal(streamState(october, Date.parse('2026-11-12T20:59:59Z')), 'current');
assert.equal(streamState(october, Date.parse('2026-11-12T21:00:00Z')), 'completed');
assert.equal(streamState(null), 'none');
assert.equal(getStreamWeek('2026-10-14T20:59:59Z'), null);
assert.equal(getStreamWeek('2026-10-14T21:00:00Z'), 1);
assert.equal(getStreamWeek('2026-10-21T21:00:00Z'), 2);
assert.equal(getStreamWeek('2026-11-11T21:00:00Z'), 5);
assert.equal(getStreamWeek('2026-11-12T21:00:00Z'), null);
assert.equal(inStreamPeriod({ date: '2026-04-20T12:00:00Z' }), false);
assert.equal(inStreamPeriod({ date: '2026-10-20T12:00:00Z', streamId: 'spring' }), false);
assert.equal(inStreamPeriod({ date: '2026-10-20T12:00:00Z' }), true);
assert.equal(selectedAttendance().count, 1);
assert.equal(selectedAttendance().total, 2);
assert.equal(periodStreak([{ date: '2026-10-15T21:30:00Z' }, { date: '2026-10-17T12:00:00Z' }, { date: '2026-10-20T12:00:00Z' }]), 2);
const five = { tension: 1, anxiety: 3, energy: 5, safety: 7, bodyContact: 9 };
rows = [{ ...five, date: '2026-10-16T12:00:00Z' }, { bodyScore: 7, legacyScale: true, date: '2026-10-23T12:00:00Z' }];
const graph = renderCheckinChart();
assert.equal((graph.match(/data-scale=/g) || []).length, 5);
assert(!graph.includes('NaN'));
assert(!graph.includes('Ресурс'));
assert.equal(scaleValue({ tension: null }, 'tension'), null);
assert.equal(scaleValue({ tension: 7, legacyScale: true }, 'tension'), null);
rows = [{ bodyScore: 7, legacyScale: true, date: '2026-10-23T12:00:00Z' }];
assert(!renderCheckinChart().includes('data-scale='));
assert(renderCheckinChart().includes('только прежние средние оценки'));
selected = archive;
assert.equal(getStreamWeek('2026-04-16T12:00:00Z'), 1);
assert.equal(getStreamWeek('2026-10-16T12:00:00Z'), null);
assert.equal(selectedAttendance().count, 1);
assert.equal(renderCheckinChart(), '');
const unsafe = '<img src=x onerror="fixture()">';
const noteHTML = context.renderRecentNotes([{ date: '2026-10-14T21:30:00Z', note: unsafe }, { date: '2026-10-16T12:00:00Z', note: 'Plain fixture' }]);
assert(!noteHTML.includes('<img'));
assert(noteHTML.includes('&lt;img'));
assert(noteHTML.includes('15 окт'));
console.log('PASS: Moscow start/end boundaries, archive selection, period filters, attendance, streak, five independent scales, legacy/missing values');
