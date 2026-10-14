// Decorative launch layer. Authentication and the real screen remain app.js's responsibility.
window.LaunchSplash = (() => {
  let begin = () => {}, cancel = () => {};
  let resolveVisible;
  const visible = new Promise(resolve => { resolveVisible = resolve; });
  document.addEventListener('DOMContentLoaded', () => {
    const layer = document.getElementById('launch-overlay');
    const canvas = document.getElementById('launch-canvas');
    const poster = document.getElementById('launch-poster');
    const video = document.getElementById('launch-video');
    const title = document.getElementById('launch-title');
    const app = document.getElementById('app');
    const context = canvas?.getContext('2d');
    if (!layer || !context || !video || !poster || !title || !app || typeof ResizeObserver === 'undefined' || typeof MutationObserver === 'undefined') {
      if (layer) layer.hidden = true;
      resolveVisible(); return;
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const originallyInert = app.inert;
    let started = false, finished = false, fading = false, playing = false;
    let loadTimer, watchTimer, deadlineTimer, fadeTimer, animationFrame;
    let paintedTime = -1;
    let lastTime = 0, lastProgress = 0, lastSource = poster;
    let sourceWidth = 0, sourceHeight = 0, slices = [];
    let seenKey = null;

    // Match the viewport without cropping: translate the unchanged flower
    // toward the centre and distribute extra height across both background edges.
    function resize() {
      const width = Math.min(720, Math.round(layer.clientWidth * Math.min(window.devicePixelRatio || 1, 1.5)));
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, Math.round(width * layer.clientHeight / Math.max(1, layer.clientWidth)));
      sourceWidth = 0;
      paint(lastSource);
    }
    function paint(source) {
      try {
        const sw = source.videoWidth || source.naturalWidth;
        const sh = source.videoHeight || source.naturalHeight;
        if (!sw || !sh) return;
        if (canvas.height < canvas.width * 1.35) {
          const fit = Math.min(canvas.width / sw, canvas.height / sh);
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(source, 0, 0, sw, sh, (canvas.width - sw * fit) / 2, 0, sw * fit, sh * fit);
          lastSource = source; canvas.hidden = false; poster.style.visibility = 'hidden'; return;
        }
        if (sourceWidth !== sw || sourceHeight !== sh) {
          sourceWidth = sw; sourceHeight = sh; slices = [];
          const top = sh * 0.20, anchor = sh * 0.75, scale = canvas.width / sw;
          const extra = canvas.height - sh * scale;
          const position = y => {
            const upper = Math.min(1, y / top), lower = Math.max(0, (y - anchor) / (sh - anchor));
            const ease = t => extra < 0 ? t : t * t * (3 - 2 * t);
            return y * scale + extra * (0.58 * ease(upper) + 0.42 * ease(lower));
          };
          for (let y = 0; y < top; y += 8) {
            const end = Math.min(top, y + 8);
            slices.push([y, end - y, position(y), position(end) - position(y)]);
          }
          slices.push([top, anchor - top, position(top), (anchor - top) * scale]);
          for (let y = anchor; y < sh; y += 8) {
            const end = Math.min(sh, y + 8);
            slices.push([y, end - y, position(y), position(end) - position(y)]);
          }
        }
        context.clearRect(0, 0, canvas.width, canvas.height);
        for (const slice of slices) context.drawImage(source, 0, slice[0], sw, slice[1], 0, slice[2], canvas.width, slice[3]);
        lastSource = source;
        canvas.hidden = false; poster.style.visibility = 'hidden';
      } catch { if (started) fade(180); }
    }
    function release() {
      if (finished) return;
      finished = true;
      clearTimeout(loadTimer); clearTimeout(deadlineTimer); clearTimeout(fadeTimer); clearInterval(watchTimer);
      cancelAnimationFrame(animationFrame);
      video.pause(); video.removeAttribute('src'); video.load();
      layer.hidden = true;
      document.getElementById('launch-status')?.setAttribute('hidden', '');
      app.inert = originallyInert;
      app.classList.remove('launch-underlay');
      const error = document.getElementById('startup-error');
      if (started && error?.hidden !== false) document.querySelector('.screen--active')?.focus({ preventScroll: true });
      errorObserver.disconnect(); resizeObserver.disconnect();
      resolveVisible();
    }
    function fade(milliseconds) {
      if (finished || fading) return;
      fading = true;
      clearTimeout(loadTimer); clearTimeout(deadlineTimer); clearInterval(watchTimer);
      video.pause(); title.style.opacity = '0';
      layer.style.transitionDuration = milliseconds + 'ms';
      layer.classList.add('launch-overlay--leaving');
      fadeTimer = setTimeout(release, milliseconds);
    }
    function movieFrame() {
      if (finished || fading) return;
      const time = video.currentTime;
      if (video.readyState >= 2 && time !== paintedTime) { paint(video); paintedTime = time; }
      title.style.opacity = String(Math.max(0, Math.min(1, (time - 2.35) / 0.8)) * Math.max(0, Math.min(1, (4.15 - time) / 0.3)));
      if (playing && time >= 4.1) {
        if (seenKey) AppLocalStorage.setItem(seenKey, '1');
        fade(750); return;
      }
      // A transparent source video may never be submitted to the compositor.
      // Keep painting with the page clock even when video-frame callbacks exist.
      animationFrame = requestAnimationFrame(movieFrame);
    }
    const resizeObserver = new ResizeObserver(resize);
    const errorObserver = new MutationObserver(() => {
      if (document.getElementById('startup-error')?.hidden === false) release();
    });
    resizeObserver.observe(layer);
    const error = document.getElementById('startup-error');
    if (error) errorObserver.observe(error, { attributes: true, attributeFilter: ['hidden'] });
    poster.addEventListener('load', () => { if (!finished) paint(poster); });
    video.addEventListener('error', () => fade(180));
    video.addEventListener('playing', () => {
      if (finished || fading) return;
      clearTimeout(loadTimer); lastProgress = performance.now();
      if (!playing) {
        playing = true;
        deadlineTimer = setTimeout(() => fade(180), 5500);
      }
    });
    video.addEventListener('ended', () => { if (!fading) fade(180); });
    reduced.addEventListener?.('change', () => { if (reduced.matches) release(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && started) release(); });
    window.addEventListener('pageshow', event => { if (event.persisted) release(); });
    cancel = release;
    begin = () => {
      if (started || finished) return;
      // Only a confirmed, bound user selects the cosmetic per-device marker.
      if (!Api.isAuthed() || Api.clubBlocked || !Storage._userId) { release(); return; }
      started = true;
      seenKey = Storage.key('launch_seen_v1');
      if (reduced.matches || navigator.connection?.saveData || layer.clientHeight < layer.clientWidth * 1.35) {
        layer.dataset.mode = 'static'; release(); return;
      }
      if (AppLocalStorage.getItem(seenKey) === '1') {
        layer.dataset.mode = 'return';
        poster.style.visibility = '';
        poster.src = '/media/app/launch/open.webp?v=silk-centre-20261014';
        fade(800); return;
      }
      layer.dataset.mode = 'first';
      lastProgress = performance.now();
      loadTimer = setTimeout(() => fade(180), 2500);
      watchTimer = setInterval(() => {
        if (video.currentTime > lastTime + 0.01) { lastTime = video.currentTime; lastProgress = performance.now(); }
        else if (playing && performance.now() - lastProgress > 1500) fade(180);
      }, 250);
      video.src = '/media/app/launch/flower-720.mp4?v=silk-centre-20261014';
      video.muted = true; video.defaultMuted = true; video.playsInline = true;
      movieFrame();
      video.play().catch(() => fade(180));
    };
    layer.hidden = false;
    document.getElementById('launch-status')?.removeAttribute('hidden');
    app.inert = true; app.classList.add('launch-underlay');
    resize();
    if (error?.hidden === false) release();
  }, { once: true });
  return { ready() { begin(); }, cancel() { cancel(); }, whenVisible() { return visible; } };
})();
