// Startup must stay visible even when storage, a script or the connection fails.
const AppLocalStorage = (() => {
  const memory = new Map();
  let persistent = null;
  try {
    persistent = window.localStorage;
    const probe = 'tp_storage_probe';
    persistent.setItem(probe, '1');
    persistent.removeItem(probe);
  } catch { persistent = null; }
  return {
    isPersistent() { return persistent !== null; },
    getItem(key) { try { return persistent ? persistent.getItem(key) : memory.get(key) ?? null; } catch { return memory.get(key) ?? null; } },
    setItem(key, value) {
      memory.set(key, String(value));
      if (!persistent) return false;
      try { persistent.setItem(key, String(value)); return true; } catch { return false; }
    },
    removeItem(key) { memory.delete(key); try { persistent?.removeItem(key); } catch {} }
  };
})();

const AppBoot = (() => {
  let complete = false;
  function fail(message) {
    if (complete) return;
    const panel = document.getElementById('startup-error');
    if (!panel) return;
    panel.hidden = false;
    document.getElementById('startup-error-message').textContent = message;
  }
  const timer = setTimeout(() => fail('Соединение занимает слишком много времени. Можно повторить загрузку.'), 12000);
  window.addEventListener('error', () => fail('Не удалось запустить приложение. Повторите загрузку.'));
  window.addEventListener('unhandledrejection', () => fail('Не удалось завершить загрузку приложения. Повторите попытку.'));
  return {
    fail,
    done() {
      complete = true;
      clearTimeout(timer);
      const panel = document.getElementById('startup-error');
      if (panel) panel.hidden = true;
    }
  };
})();
