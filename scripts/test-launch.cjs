const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app/js/launch.js', 'utf8');

function fixture({ seen = false, reduced = false, authed = true, unsupported = false, play = 'success', frameCallbacks = false } = {}) {
  let now = 0, id = 0;
  const timers = new Map(), store = new Map(), writes = [], draws = [];
  const key = 'tp_user:fixture:launch_seen_v1';
  if (seen) store.set(key, '1');
  function element() {
    const listeners = {}, classes = new Set();
    return { hidden: true, inert: false, style: {}, dataset: {}, clientWidth: 390, clientHeight: 844,
      addEventListener(name, callback) { (listeners[name] ||= []).push(callback); },
      emit(name, event = {}) { for (const callback of listeners[name] || []) callback(event); },
      classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
      focus() {}, removeAttribute(name) { delete this[name]; },
    };
  }
  const app = element(), layer = element(), canvas = element(), poster = element(), video = element(), title = element(), error = element();
  poster.naturalWidth = 720; poster.naturalHeight = 1280;
  video.currentTime = 0; video.videoWidth = 720; video.videoHeight = 1280;
  video.readyState = 2;
  if (frameCallbacks) video.requestVideoFrameCallback = () => 999;
  video.pause = () => {}; video.load = () => {};
  video.play = () => play === 'reject' ? Promise.reject(new Error('NotAllowedError')) : play === 'pending' ? new Promise(() => {}) : Promise.resolve();
  canvas.getContext = () => ({ clearRect() {}, drawImage: (...args) => draws.push(args) });
  const elements = { app, 'launch-overlay': layer, 'launch-canvas': canvas, 'launch-poster': poster, 'launch-video': video, 'launch-title': title, 'startup-error': error };
  const document = element(); document.getElementById = name => elements[name]; document.querySelector = () => app;
  const observers = [];
  class Observer { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() {} }
  const schedule = (callback, wait, interval = 0) => { timers.set(++id, { callback, at: now + wait, interval }); return id; };
  const window = element(); window.devicePixelRatio = 1.5; window.matchMedia = () => ({ matches: reduced, addEventListener() {} });
  const context = { window, document, navigator: {}, ResizeObserver: Observer, MutationObserver: Observer,
    performance: { now: () => now }, Api: { isAuthed: () => authed, clubBlocked: false },
    Storage: { _userId: 'fixture', key: () => key },
    AppLocalStorage: { getItem: k => store.get(k), setItem(k, value) { writes.push(k); store.set(k, value); } },
    setTimeout: (cb, ms) => schedule(cb, ms), clearTimeout: handle => timers.delete(handle),
    setInterval: (cb, ms) => schedule(cb, ms, ms), clearInterval: handle => timers.delete(handle),
    requestAnimationFrame: cb => schedule(cb, 16), cancelAnimationFrame: handle => timers.delete(handle),
  };
  if (unsupported) delete context.ResizeObserver;
  vm.runInNewContext(source, context);
  document.emit('DOMContentLoaded');
  function advance(ms) {
    const target = now + ms;
    while (true) {
      const next = [...timers.entries()].filter(([, value]) => value.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at;
      if (next[1].interval) next[1].at += next[1].interval; else timers.delete(next[0]);
      next[1].callback();
    }
    now = target;
  }
  return { api: window.LaunchSplash, window, document, app, layer, video, error, observers, writes, draws, timers, advance };
}

(async () => {
  const results = [];
  const markup = fs.readFileSync('app/index.html', 'utf8');
  const openingLayer = markup.match(/<div id="launch-overlay"[^>]*>/)[0];
  assert(!/\shidden(?:\s|=|>)/.test(openingLayer), 'initial markup exposes the old splash before scripts execute');
  // iOS-style delayed media must not exit before its first playing event.
  const delayed = fixture({ play: 'pending', frameCallbacks: true }); delayed.api.ready();
  delayed.advance(1200); assert.equal(delayed.layer.hidden, false, 'cold video exited before 1.2-second startup');
  delayed.video.emit('playing');
  for (let i = 1; i <= 17; i++) { delayed.video.currentTime = i * 0.25; delayed.advance(250); }
  delayed.advance(800);
  assert.equal(delayed.layer.hidden, true); assert.equal(delayed.writes.length, 1, 'unreported compositor frames must not freeze canvas at the bud');
  results.push('delayed startup and non-delivering video-frame callbacks: bloom completes');
  const first = fixture(); first.api.ready(); await Promise.resolve(); first.video.emit('playing');
  for (let i = 1; i <= 17; i++) { first.video.currentTime = i * 0.25; first.advance(250); }
  first.advance(800); await first.api.whenVisible();
  assert.equal(first.layer.hidden, true); assert.equal(first.app.inert, false);
  assert.deepEqual(first.writes, ['tp_user:fixture:launch_seen_v1']);
  assert.equal(first.video.src, undefined); assert.equal(first.timers.size, 0);
  // The full source width and the bottom source row survive viewport adaptation.
  assert(first.draws.some(args => args[1] === 0 && args[3] === 720 && args[2] + args[4] === 1280));
  results.push('first: bounded presentation, full source width, user-scoped marker and media cleanup');
  const returning = fixture({ seen: true }); returning.api.ready();
  assert.equal(returning.video.src, undefined); returning.advance(800); await returning.api.whenVisible();
  assert.equal(returning.layer.hidden, true); results.push('return: static 800 ms, no video request');
  for (const options of [{ reduced: true }, { authed: false }, { unsupported: true }]) {
    const f = fixture(options); f.api.ready(); await f.api.whenVisible();
    assert.equal(f.layer.hidden, true); assert.equal(f.video.src, undefined); assert.equal(f.writes.length, 0);
  }
  results.push('reduced motion / unverified identity / unsupported canvas setup: immediate release, no video or cosmetic write');
  for (const play of ['reject', 'pending']) {
    const f = fixture({ play }); f.api.ready(); await Promise.resolve(); await Promise.resolve(); f.advance(2800);
    await f.api.whenVisible(); assert.equal(f.layer.hidden, true); assert.equal(f.writes.length, 0);
  }
  results.push('autoplay rejection / unavailable media: bounded fallback without marking a completed intro');
  const stall = fixture(); stall.api.ready(); await Promise.resolve(); stall.video.emit('playing');
  stall.video.currentTime = 0.5; stall.advance(500); stall.advance(1800);
  await stall.api.whenVisible(); assert.equal(stall.layer.hidden, true); assert.equal(stall.timers.size, 0);
  results.push('playback stall: ready application released, no infinite layer');
  const denied = fixture(); denied.error.hidden = false; denied.observers[1].callback(); denied.api.ready();
  assert.equal(denied.layer.hidden, true); assert.equal(denied.video.src, undefined);
  results.push('startup error: layer cancelled and cannot restart');
  const background = fixture(); background.api.ready(); await Promise.resolve(); background.document.hidden = true;
  background.document.emit('visibilitychange'); background.api.cancel(); await background.api.whenVisible();
  assert.equal(background.layer.hidden, true); assert.equal(background.timers.size, 0);
  results.push('background / repeated cancellation: media and timers released once');
  console.log(JSON.stringify({ passed: results.length, cases: results }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
