import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/web/theme.js', import.meta.url), 'utf8');
function launch({ dark = false, jar = { value: '' }, blocked = false, stored = null } = {}) {
  const attrs = {}, values = new Map(), handlers = {};
  if (stored !== null) values.set('vmix-pdf-viewer-theme', stored);
  const button = { setAttribute: (key, value) => attrs[key] = value, addEventListener: (event, handler) => handlers[event] = handler };
  let loaded, color;
  const document = { documentElement: { dataset: {}, style: {} }, getElementById: () => button,
    querySelector: () => ({ setAttribute: (_key, value) => color = value }),
    addEventListener: (_event, handler) => loaded = handler };
  Object.defineProperty(document, 'cookie', { get() { if (blocked) throw Error('blocked'); return jar.value; },
    set(value) { if (blocked) throw Error('blocked'); jar.value = value.split(';')[0]; } });
  const localStorage = { getItem(key) { if (blocked) throw Error('blocked'); return values.get(key); },
    setItem(key, value) { if (blocked) throw Error('blocked'); values.set(key, value); } };
  vm.runInNewContext(source, { document, localStorage, window: { matchMedia: () => ({ matches: dark }) } });
  return { document, attrs, jar, handlers, button, loaded, color: () => color };
}
test('Тема устанавливается до CSS, логотип переключает её и сохраняет при смене порта', () => {
  const first = launch({ dark: true });
  assert.equal(first.document.documentElement.dataset.theme, 'dark');
  first.loaded();
  assert.equal(first.attrs['aria-pressed'], 'true');
  assert.equal(first.attrs['aria-label'], 'Включить светлую тему');
  first.handlers.click();
  assert.equal(first.document.documentElement.dataset.theme, 'light');
  assert.equal(first.color(), '#f3f5f9');
  assert.equal(first.attrs['aria-pressed'], 'false');
  // Новый origin/порт не имеет прежнего localStorage, cookie хоста остаётся.
  const reopened = launch({ dark: true, jar: first.jar });
  assert.equal(reopened.document.documentElement.dataset.theme, 'light');
  reopened.loaded(); reopened.handlers.click();
  assert.equal(reopened.document.documentElement.style.colorScheme, 'dark');
});
test('Заблокированное хранилище не мешает переключать тему', () => {
  const app = launch({ blocked: true }); app.loaded();
  assert.doesNotThrow(() => app.handlers.click());
  assert.equal(app.document.documentElement.dataset.theme, 'dark');
});
test('Повреждённые настройки темы сбрасываются к системному выбору', () => {
  const app = launch({ dark: true, jar: { value: 'vmix-pdf-viewer-theme=invalid' }, stored: '<script>' });
  assert.equal(app.document.documentElement.dataset.theme, 'dark');
});
