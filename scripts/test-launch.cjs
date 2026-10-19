const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app/js/launch.js', 'utf8');

function fixture({ seen = false, authed = true, play = 'success', height = 844 } = {}) {
  let now = 0, id = 0;
  const timers = new Map(), store = new Map(), writes = [], observers = [];
  const key = 'tp_user:fixture:launch_seen_v3';
  if (seen) store.set(key, '1');
  function element() {
    const listeners = {}, classes = new Set();
    return { hidden: true, inert: false, style: {}, dataset: {}, clientWidth: 390, clientHeight: height,
      addEventListener(name, cb) { (listeners[name] ||= []).push(cb); },
      emit(name, event = {}) { if (name === 'playing') this.running = true; for (const cb of listeners[name] || []) cb(event); },
      classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
      focus() {}, removeAttribute(name) { delete this[name]; },
    };
  }
  const app = element(), layer = element(), poster = element(), motion = element(), video = element(), error = element();
  layer.hidden = false;
  video.currentTime = 0; video.playbackRate = 1; video.running = false;
  video.pause = () => { video.running = false; }; video.load = () => {};
  video.play = () => play === 'reject' ? Promise.reject(new Error('NotAllowedError')) : play === 'pending' ? new Promise(() => {}) : Promise.resolve();
  const elements = { app, 'launch-overlay': layer, 'launch-poster': poster, 'launch-motion': motion, 'launch-video': video, 'startup-error': error };
  const document = element(); document.getElementById = name => elements[name]; document.querySelector = () => app;
  class Observer { constructor(cb) { this.callback = cb; observers.push(this); } observe() {} disconnect() {} }
  const schedule = (cb, wait, interval = 0) => { timers.set(++id, { cb, at: now + wait, interval }); return id; };
  const window = element();
  const context = { window, document, performance: { now: () => now }, MutationObserver: Observer,
    Api: { isAuthed: () => authed, clubBlocked: false }, Storage: { _userId: 'fixture', key: () => key },
    AppLocalStorage: { getItem: k => store.get(k), setItem(k, v) { writes.push(k); store.set(k,v); } },
    setTimeout: (cb, ms) => schedule(cb,ms), clearTimeout: handle => timers.delete(handle),
    setInterval: (cb, ms) => schedule(cb,ms,ms), clearInterval: handle => timers.delete(handle),
    requestAnimationFrame: cb => schedule(cb,16), cancelAnimationFrame: handle => timers.delete(handle),
  };
  vm.runInNewContext(source, context); document.emit('DOMContentLoaded');
  function elapse(target) {
    if (video.running) video.currentTime += (target-now)/1000 * video.playbackRate;
    now = target;
  }
  function advance(ms) {
    const target = now+ms;
    while (true) {
      const next = [...timers.entries()].filter(([,v]) => v.at <= target).sort((a,b) => a[1].at-b[1].at)[0];
      if (!next) break;
      elapse(next[1].at);
      if (next[1].interval) next[1].at += next[1].interval; else timers.delete(next[0]);
      next[1].cb();
    }
    elapse(target);
  }
  return { api: window.LaunchSplash, window, document, app, layer, poster, motion, video, error, observers, writes, timers, advance };
}

(async () => {
  const results=[];
  const markup = fs.readFileSync('app/index.html','utf8');
  const css = fs.readFileSync('app/css/launch.css','utf8');
  assert(!/\shidden(?:\s|=|>)/.test(markup.match(/<div id="launch-overlay"[^>]*>/)[0]));
  assert(!markup.includes('launch-canvas'));
  assert(/#launch-title\{[^}]*opacity:1/.test(css), 'brand must be visible before playback');
  results.push('initial paint: brand visible; no old splash, canvas or transparent source');

  for (const [seen, seconds] of [[false,6],[true,2.5]]) {
    const f=fixture({seen}); f.api.ready(); await Promise.resolve();
    f.video.playbackRate = 1; // Some clients reset rate while loading metadata.
    f.video.emit('playing');
    assert.equal(f.video.playbackRate, (seen ? 3.6 : 4.1) / (seen ? 2.05 : 5.25));
    assert(f.video.src?.endsWith('.mp4?v=JAPP138'));
    assert.equal(f.video.hidden,false); assert.equal(f.poster.hidden,true);
    f.advance(seconds*1000-100); assert.equal(f.layer.hidden,false);
    f.advance(200); assert.equal(f.layer.hidden,true); assert.equal(f.app.inert,false);
    assert.equal(f.writes.length,1); assert.equal(f.video.src,undefined); assert.equal(f.timers.size,0);
  }
  results.push('native animation: first 6 s, returning 2.5 s; shorter tail, both reveal the flower and clean up');

  const cold=fixture(); cold.api.ready(); cold.advance(1200);
  assert.equal(cold.layer.hidden,false); cold.video.emit('playing'); cold.advance(6100);
  assert.equal(cold.layer.hidden,true); assert.equal(cold.writes.length,1);
  results.push('cold 1.2-second video start does not skip animation');

  for (const [seen,seconds] of [[false,6],[true,2.5]]) {
    const f=fixture({seen,play:'reject'}); f.api.ready(); await Promise.resolve(); await Promise.resolve();
    assert.equal(f.layer.dataset.media,'image-loading'); assert.equal(f.video.hidden,true);
    assert(f.motion.src.endsWith((seen?'return':'first')+'-tall.webp?v='+(seen?'silk-return-25-20261014':'silk-native-20261014')));
    f.motion.emit('load'); assert.equal(f.motion.hidden,false);
    f.advance(seconds*1000-1); assert.equal(f.layer.hidden,false);
    f.advance(1); assert.equal(f.layer.hidden,true); assert.equal(f.writes.length,1); assert.equal(f.timers.size,0);
  }
  results.push('autoplay rejection: animated fallback also lasts 6/2.5 s, never static return');

  const unavailable=fixture({play:'pending'}); unavailable.api.ready(); unavailable.advance(1800);
  assert.equal(unavailable.layer.dataset.media,'image-loading');
  unavailable.motion.emit('error'); unavailable.advance(180);
  assert.equal(unavailable.layer.hidden,true); assert.equal(unavailable.writes.length,0);
  const deadline=fixture({play:'pending'}); deadline.api.ready(); deadline.advance(6100);
  assert.equal(deadline.layer.hidden,true); assert.equal(deadline.timers.size,0);
  results.push('unavailable video and fallback: bounded release, no false completion');

  const stalled=fixture(); stalled.api.ready(); stalled.video.emit('playing'); stalled.advance(500);
  stalled.video.running=false; stalled.advance(1800);
  assert.equal(stalled.layer.dataset.media,'image-loading');
  stalled.motion.emit('load'); stalled.advance(6000); assert.equal(stalled.layer.hidden,true);
  results.push('stalled video switches to animated media instead of silently skipping');

  const denied=fixture({authed:false}); denied.api.ready();
  assert.equal(denied.layer.hidden,true); assert.equal(denied.video.src,undefined);
  const error=fixture(); error.error.hidden=false; error.observers[0].callback(); error.api.ready();
  assert.equal(error.layer.hidden,true); assert.equal(error.video.src,undefined);
  results.push('unverified identity and startup errors cannot open home or play media');

  const standard=fixture({height:724}); standard.api.ready();
  assert(standard.video.src.includes('flower-fast-standard.mp4')); standard.api.cancel();
  const background=fixture(); background.api.ready(); background.document.hidden=true;
  background.document.emit('visibilitychange'); background.api.cancel(); background.motion.emit('load');
  assert.equal(background.layer.hidden,true); assert.equal(background.timers.size,0); assert.equal(background.writes.length,0);
  results.push('aspect selection, background exit and late image events preserve cleanup');
  const early = fixture({play:'pending'});
  assert(early.video.src.includes('flower-fast-tall.mp4'));
  assert(!early.video.running && early.layer.hidden === false);
  early.video.error = new Error('preload 404'); early.video.emit('error');
  assert(!early.layer.dataset.media && !early.motion.src);
  early.api.ready();
  assert.equal(early.layer.dataset.media, 'image-loading');
  early.motion.emit('load'); early.advance(6000);
  assert(early.layer.hidden && !early.app.inert);
  const cancelled = fixture(); cancelled.api.cancel(); cancelled.api.ready();
  assert(!cancelled.video.src && cancelled.layer.hidden && cancelled.timers.size === 0);
  results.push('preload before auth: no play or fallback; early media failure recovered after auth; cancel cleans preloaded source');
  assert(css.includes('object-fit:cover'));
  console.log(JSON.stringify({passed:results.length,cases:results},null,2));
})().catch(error => { console.error(error); process.exitCode=1; });
