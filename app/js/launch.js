// Decorative launch layer; authentication and the live screen remain app.js's responsibility.
window.LaunchSplash = (() => {
  let begin = () => {}, cancel = () => {};
  let resolveVisible;
  const visible = new Promise(resolve => { resolveVisible = resolve; });
  document.addEventListener('DOMContentLoaded', () => {
    const layer = document.getElementById('launch-overlay');
    const poster = document.getElementById('launch-poster');
    const motion = document.getElementById('launch-motion');
    const video = document.getElementById('launch-video');
    const app = document.getElementById('app');
    if (!layer || !poster || !motion || !video || !app) {
      if (layer) layer.hidden = true;
      resolveVisible(); return;
    }
    const originallyInert = app.inert;
    let started = false, finished = false, fading = false, playing = false, usingImage = false;
    let loadTimer, watchTimer, bloomTimer, deadlineTimer, fadeTimer, animationFrame;
    let lastTime = 0, lastProgress = 0, seenKey, bloomMs = 5250, fadeMs = 750;
    const clearWork = () => {
      clearTimeout(loadTimer); clearTimeout(bloomTimer); clearTimeout(deadlineTimer);
      clearInterval(watchTimer); cancelAnimationFrame(animationFrame);
    };
    function release() {
      if (finished) return;
      finished = true; clearWork(); clearTimeout(fadeTimer);
      video.pause(); video.removeAttribute('src'); video.load();
      motion.removeAttribute('src');
      layer.hidden = true;
      document.getElementById('launch-status')?.setAttribute('hidden', '');
      app.inert = originallyInert; app.classList.remove('launch-underlay');
      observer?.disconnect();
      if (started && document.getElementById('startup-error')?.hidden !== false) {
        document.querySelector('.screen--active')?.focus({ preventScroll: true });
      }
      resolveVisible();
    }
    function fade(milliseconds) {
      if (finished || fading) return;
      fading = true; clearWork(); video.pause();
      layer.style.transitionDuration = milliseconds + 'ms';
      layer.classList.add('launch-overlay--leaving');
      fadeTimer = setTimeout(release, milliseconds);
    }
    function complete() {
      if (finished || fading) return;
      if (seenKey) AppLocalStorage.setItem(seenKey, '1');
      fade(fadeMs);
    }
    function movieFrame() {
      if (finished || fading || usingImage) return;
      if (playing && video.currentTime >= 4.1) { complete(); return; }
      animationFrame = requestAnimationFrame(movieFrame);
    }
    function imageFallback() {
      if (finished || fading || usingImage) return;
      usingImage = true; playing = false;
      clearTimeout(loadTimer); clearInterval(watchTimer); cancelAnimationFrame(animationFrame);
      video.pause(); video.hidden = true; video.removeAttribute('src'); video.load();
      poster.hidden = false;
      layer.dataset.media = 'image-loading';
      loadTimer = setTimeout(() => fade(180), 4000);
      const tall = layer.dataset.aspect === 'tall';
      motion.src = layer.dataset.mode === 'return'
        ? (tall ? '/media/app/launch/return-tall.webp?v=silk-native-20261014' : '/media/app/launch/return-standard.webp?v=silk-native-20261014')
        : (tall ? '/media/app/launch/first-tall.webp?v=silk-native-20261014' : '/media/app/launch/first-standard.webp?v=silk-native-20261014');
    }
    motion.addEventListener('load', () => {
      if (finished || fading || !usingImage) return;
      clearTimeout(loadTimer);
      motion.hidden = false; poster.hidden = true;
      layer.dataset.media = 'image';
      bloomTimer = setTimeout(complete, bloomMs);
    });
    motion.addEventListener('error', () => { if (usingImage) fade(180); });
    video.addEventListener('playing', () => {
      if (finished || fading || usingImage) return;
      video.playbackRate = 4.1 / (bloomMs / 1000);
      playing = true; clearTimeout(loadTimer); lastProgress = performance.now();
      poster.hidden = true;
      layer.dataset.media = 'video';
    });
    video.addEventListener('error', imageFallback);
    video.addEventListener('ended', () => {
      if (!usingImage && !finished && !fading) {
        if (video.currentTime >= 4.1) complete(); else imageFallback();
      }
    });
    const error = document.getElementById('startup-error');
    const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => {
      if (error?.hidden === false) release();
    });
    if (error) observer?.observe(error, { attributes: true, attributeFilter: ['hidden'] });
    document.addEventListener('visibilitychange', () => { if (document.hidden && started) release(); });
    window.addEventListener('pageshow', event => { if (event.persisted) release(); });
    cancel = release;
    begin = () => {
      if (started || finished) return;
      if (!Api.isAuthed() || Api.clubBlocked || !Storage._userId) { release(); return; }
      started = true;
      seenKey = Storage.key('launch_seen_v3');
      const returning = AppLocalStorage.getItem(seenKey) === '1';
      layer.dataset.mode = returning ? 'return' : 'first';
      layer.dataset.aspect = layer.clientHeight / Math.max(1, layer.clientWidth) >= 1.95 ? 'tall' : 'standard';
      layer.dataset.media = 'video-loading';
      bloomMs = returning ? 2550 : 5250; fadeMs = returning ? 450 : 750;
      deadlineTimer = setTimeout(() => fade(180), returning ? 9000 : 12000);
      loadTimer = setTimeout(imageFallback, 1800);
      lastProgress = performance.now();
      watchTimer = setInterval(() => {
        if (video.currentTime > lastTime + 0.01) { lastTime = video.currentTime; lastProgress = performance.now(); }
        else if (playing && performance.now() - lastProgress > 1500) imageFallback();
      }, 250);
      video.src = layer.dataset.aspect === 'tall'
        ? '/media/app/launch/flower-tall.mp4?v=silk-native-20261014'
        : '/media/app/launch/flower-720.mp4?v=silk-native-20261014';
      video.muted = true; video.defaultMuted = true; video.playsInline = true;
      video.defaultPlaybackRate = 4.1 / (bloomMs / 1000);
      video.playbackRate = video.defaultPlaybackRate;
      video.hidden = false;
      movieFrame();
      video.play().catch(imageFallback);
    };
    document.getElementById('launch-status')?.removeAttribute('hidden');
    app.inert = true; app.classList.add('launch-underlay');
    if (error?.hidden === false) release();
  }, { once: true });
  return { ready() { begin(); }, cancel() { cancel(); }, whenVisible() { return visible; } };
})();
