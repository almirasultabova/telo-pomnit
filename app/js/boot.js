// Startup must stay visible even when storage, a script or the connection fails.
const AppLocalStorage = (() => {
  const memory = new Map();
  const unsaved = new Set();
  let persistent = null;
  let writable = false;
  try {
    persistent = window.localStorage;
    const probe = 'tp_storage_probe';
    persistent.setItem(probe, '1');
    persistent.removeItem(probe);
    writable = true;
  } catch { /* Quota/write denial must not prevent reading an acquired store. */ }
  return {
    isPersistent() { return persistent !== null && writable && unsaved.size === 0; },
    keys(prefix = '') {
      const names = new Set(memory.keys());
      try { for (let i = 0; i < persistent?.length; i++) names.add(persistent.key(i)); } catch {}
      return [...names].filter(name => typeof name === 'string' && name.startsWith(prefix));
    },
    getItem(key) {
      if (unsaved.has(key)) return memory.get(key) ?? null;
      try { return persistent ? persistent.getItem(key) : memory.get(key) ?? null; }
      catch { return memory.get(key) ?? null; }
    },
    setItem(key, value) {
      memory.set(key, String(value));
      if (!persistent) return false;
      try { persistent.setItem(key, String(value)); writable = true; unsaved.delete(key); return true; }
      catch { unsaved.add(key); return false; }
    },
    removeItem(key) {
      memory.delete(key);
      try { persistent?.removeItem(key); unsaved.delete(key); }
      catch { unsaved.add(key); }
    }
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
