import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { createApp } from '../src/server/server.js';

test('Несколько PDF: добавление, порядок, конфликты, выбор и восстановление', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vmix-library-'));
  let server, base;
  async function start() {
    server = createApp({ dataDir: directory });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  const get = async url => (await fetch(base + url)).json();
  const post = (url, body) => fetch(base + url, { method: 'POST', ...(body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}) });
  try {
    await start();
    const pdf = await PDFDocument.create(); pdf.addPage(); pdf.addPage();
    const bytes = await pdf.save();
    for (const name of ['A.pdf', 'B.pdf', 'A.pdf']) {
      const res = await fetch(base + `/api/documents?name=${name}`, { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: bytes });
      assert.equal(res.status, 200);
    }
    const initial = await get('/api/library');
    const [a, b, c] = initial.documents.map(d => d.id);
    assert.equal(new Set([a, b, c]).size, 3); // Одинаковые имена — разные элементы.
    assert.equal(initial.activeId, a);
    const before = await get('/api/state');
    assert.equal((await post('/api/library/order', { ids: [c, a, b], revision: initial.revision })).status, 200);
    assert.deepEqual(await get('/api/state'), before); // Перестановка не меняет эфирный кадр.
    assert.equal((await post('/api/library/order', { ids: [a, b, c], revision: initial.revision })).status, 409);
    const current = await get('/api/library');
    assert.equal((await post('/api/library/order', { ids: [a, a, b], revision: current.revision })).status, 400);
    assert.equal((await post('/api/library/select?id=missing')).status, 404);
    assert.equal((await post(`/api/library/select?id=${c}`)).status, 200);
    await post('/api/page?action=next');
    assert.equal((await get('/api/state')).page, 2);
    const result = await (await post('/api/library/navigate?action=next')).json();
    assert.equal(result.activeId, a); assert.equal(result.page, 1);
    await post('/api/library/navigate?action=next');
    const last = await get('/api/state');
    assert.equal(last.activeId, b);
    assert.deepEqual(await (await post('/api/library/navigate?action=next')).json(), last);
    const bad = await fetch(base + '/api/documents', { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: 'bad' });
    assert.equal(bad.status, 422); assert.equal((await get('/api/library')).documents.length, 3);
    const saved = await get('/api/library');
    await new Promise(resolve => server.close(resolve)); server = null;
    await start();
    assert.deepEqual(await get('/api/library'), saved);
    const restored = await get('/api/state');
    assert.equal(restored.activeId, b); assert.equal(restored.page, 1);
    assert.notEqual(restored.sessionId, last.sessionId);
    assert.deepEqual(Buffer.from(await (await fetch(base + '/document.pdf')).arrayBuffer()), Buffer.from(bytes));
    assert.equal(JSON.parse(await readFile(path.join(directory, 'library.json'), 'utf8')).activeId, b);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
