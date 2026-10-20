(function () {
  'use strict';
  const classes = ['screen--enter', 'screen--exit', 'screen--enter-back', 'screen--exit-back'];
  const pending = new WeakMap();
  const milliseconds = value => {
    const number = parseFloat(value) || 0;
    return value.trim().endsWith('ms') ? number : number * 1000;
  };

  function clear(element) {
    if (!element) return;
    const timer = pending.get(element);
    if (timer !== undefined) clearTimeout(timer);
    pending.delete(element);
    element.classList.remove(...classes);
  }

  function animate(element, className) {
    if (!element) return;
    element.classList.add(className);
    const style = getComputedStyle(element);
    if (style.animationName === 'none') { clear(element); return; }
    const durations = style.animationDuration.split(',').map(milliseconds);
    const delays = style.animationDelay.split(',').map(milliseconds);
    const duration = Math.max(...durations.map((value, index) => value + delays[index % delays.length]));
    if (duration <= 0) { clear(element); return; }
    const timer = setTimeout(() => {
      if (pending.get(element) !== timer) return;
      pending.delete(element);
      element.classList.remove(...classes);
    }, duration + 32);
    pending.set(element, timer);
  }

  function transition(previous, next, back) {
    clear(previous);
    clear(next);
    previous?.classList.remove('screen--active');
    next.classList.add('screen--active');
    animate(previous, back ? 'screen--exit-back' : 'screen--exit');
    animate(next, back ? 'screen--enter-back' : 'screen--enter');
  }

  window.ScreenMotion = Object.freeze({ transition });
})();
