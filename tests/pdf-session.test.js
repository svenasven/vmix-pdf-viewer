import test from 'node:test';
import assert from 'node:assert/strict';
import { PdfSession } from '../src/web/pdf-session.js';

test('Смена PDF.js 6 без proxy.destroy: прежний worker освобождается до следующего', async () => {
  const events = [], session = new PdfSession();
  const load = ({ name }) => {
    events.push(`load:${name}`);
    return { promise: Promise.resolve({ name }), destroy: async () => events.push(`destroy:${name}`) };
  };
  for (const name of ['A', 'B', 'A']) {
    assert.equal((await session.open(name, { name }, load)).name, name);
    await session.open(name, { name }, load); // Повтор страницы не создаёт документ.
  }
  await session.reset(); await session.reset();
  assert.deepEqual(events, ['load:A', 'destroy:A', 'load:B', 'destroy:B', 'load:A', 'destroy:A']);
});
test('Ошибка загрузки освобождает задачу и позволяет повторить документ', async () => {
  const session = new PdfSession(); let destroyed = false;
  await assert.rejects(session.open('A', {}, () => ({ promise: Promise.reject(new Error('bad PDF')), destroy: async () => { destroyed = true; } })), /bad PDF/);
  assert.equal(destroyed, true); assert.equal(session.pdf, null);
  assert.equal((await session.open('A', {}, () => ({ promise: Promise.resolve({ pages: 1 }), destroy: async () => {} }))).pages, 1);
});
