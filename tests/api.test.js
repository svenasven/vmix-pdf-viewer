import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { createApp } from '../src/server/server.js';

test('Документ, команды, ошибки и локальная граница', async () => {
  const server = createApp();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = url => fetch(base + url, { method: 'POST' });
  try {
    assert.equal((await post('/api/page?action=next')).status, 409);
    const pdf = await PDFDocument.create(); pdf.addPage(); pdf.addPage();
    const upload = await fetch(base + '/api/document?name=test.pdf', { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: await pdf.save() });
    assert.equal(upload.status, 200); assert.equal((await upload.json()).pages, 2);
    assert.equal((await (await post('/api/page?action=next')).json()).page, 2);
    assert.equal((await (await post('/api/page?action=next')).json()).page, 2);
    assert.equal((await post('/api/page?action=goto&page=0')).status, 400);
    assert.equal((await (await post('/api/page?action=previous')).json()).page, 1);
    const bad = await fetch(base + '/api/document', { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: 'broken' });
    assert.equal(bad.status, 422);
    assert.equal((await (await fetch(base + '/api/state')).json()).pages, 2);
    assert.equal((await fetch(base + '/api/state', { headers: { Origin: 'https://example.com' } })).status, 403);
    assert.equal((await fetch(base + '/document.pdf')).headers.get('content-type'), 'application/pdf');
    for (const route of ['/', '/output', '/theme.js', '/theme.css', '/compat.js', '/pdf-session.js', '/pdf-worker.js', '/app-icon.png', '/vendor/legacy/build/pdf.mjs', '/vendor/legacy/build/pdf.worker.mjs']) assert.equal((await fetch(base + route)).status, 200, route);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('Готовность каждого выхода, устаревшие кадры, потеря связи и новый сеанс', async () => {
  let time = 10000;
  const server = createApp({ now: () => time });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async url => (await fetch(base + url)).json();
  const send = body => fetch(base + '/api/outputs', { method: 'POST', body: JSON.stringify(body) });
  try {
    assert.deepEqual(await get('/api/outputs'), { clients: [] });
    const pdf = await PDFDocument.create(); pdf.addPage(); pdf.addPage();
    await fetch(base + '/api/document', { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: await pdf.save() });
    const state = await get('/api/state');
    const report = { id: 'vmix', ...state, status: 'ready', error: '', userAgent: 'Test CEF' };
    assert.equal((await send(report)).status, 200);
    let clients = (await get('/api/outputs')).clients;
    assert.equal(clients[0].current, true); assert.equal(clients[0].online, true);
    await send({ ...report, id: 'browser', status: 'error', error: 'Unsupported feature' });
    clients = (await get('/api/outputs')).clients;
    assert.equal(clients.length, 2); assert.equal(clients[1].current, false);
    assert.equal(clients[1].error, 'Unsupported feature');
    await fetch(base + '/api/page?action=next', { method: 'POST' });
    assert.equal((await get('/api/outputs')).clients[0].current, false);
    await send(report); // Старый heartbeat не подтверждает новую команду.
    assert.equal((await get('/api/outputs')).clients[0].current, false);
    const next = await get('/api/state');
    await send({ ...report, ...next });
    assert.equal((await get('/api/outputs')).clients[0].current, true);
    await send({ ...report, ...next, id: 'panel-preview', role: 'preview' });
    const tagged = (await get('/api/outputs')).clients;
    assert.equal(tagged.find(client => client.id === 'panel-preview').role, 'preview');
    assert.equal(tagged.find(client => client.id === 'vmix').role, 'output');
    time += 5001;
    assert.equal((await get('/api/outputs')).clients[0].online, false);
    assert.equal((await send({ ...report, sessionId: 'old-session' })).status, 409);
    assert.equal((await send({ ...report, page: '1' })).status, 400);
    assert.equal((await send(null)).status, 400);
    assert.equal((await send({ ...report, error: 'x'.repeat(5000) })).status, 413);
    assert.equal((await fetch(base + '/document.pdf?documentId=999')).status, 409);
    assert.equal((await fetch(base + '/document.pdf?sessionId=old')).status, 409);
    time += 60001;
    await send({ ...report, ...next, id: 'new-output' });
    assert.equal((await get('/api/outputs')).clients.length, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
