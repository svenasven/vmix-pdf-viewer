// Выполняется до загрузки CSS, чтобы сохранённая тема не мигала при открытии.
(() => {
  const key = 'vmix-pdf-viewer-theme';
  let saved;
  try { saved = document.cookie.split('; ').find(value => value.startsWith(key + '='))?.slice(key.length + 1); } catch {}
  if (!['light', 'dark'].includes(saved)) {
    try { saved = localStorage.getItem(key); } catch {}
  }
  let theme = ['light', 'dark'].includes(saved) ? saved :
    (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  function apply() {
    const dark = theme === 'dark';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#111722' : '#f3f5f9');
    const button = document.getElementById('theme-toggle');
    if (button) {
      const label = dark ? 'Включить светлую тему' : 'Включить тёмную тему';
      button.setAttribute('aria-pressed', String(dark));
      button.setAttribute('aria-label', label);
      button.title = label;
    }
  }
  apply();
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      // Cookie привязан к хосту, а не порту: выбор сохраняется при смене порта.
      try { document.cookie = `${key}=${theme}; Path=/; Max-Age=31536000; SameSite=Strict`; } catch {}
      try { localStorage.setItem(key, theme); } catch {}
      apply();
    });
  }, { once: true });
})();
