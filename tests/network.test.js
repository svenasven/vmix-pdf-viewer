import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/server/server.js';
import { listenAvailable, localAddresses, privateAddress, localPeer } from '../src/server/network.js';

test('Занятый порт пропускается; адреса соответствуют фактическому порту', async () => {
  const occupied = http.createServer((_req, res) => res.end('occupied'));
  await listenAvailable(occupied, { startPort: 0, host: '127.0.0.1' });
  const app = createApp();
  try {
    const first = occupied.address().port;
    const port = await listenAvailable(app, { startPort: first });
    assert.notEqual(port, first);
    const base = `http://127.0.0.1:${port}`;
    const info = await (await fetch(base + '/api/connection')).json();
    assert.equal(info.port, port); assert.equal(info.localUrl, base);
    assert.deepEqual(info.lanUrls, localAddresses().map(ip => `http://${ip}:${port}`));
    assert.equal((await fetch(base + '/api/state', { headers: { Origin: 'http://example.com' } })).status, 403);
    const invalidHost = await new Promise((resolve, reject) => {
      const request = http.get(base + '/api/state', { headers: { Host: `evil.test:${port}` } }, response => { response.resume(); resolve(response.statusCode); });
      request.on('error', reject);
    });
    assert.equal(invalidHost, 403);
    for (const ip of localAddresses()) {
      assert.equal((await fetch(`http://${ip}:${port}/api/state`)).status, 200);
    }
    assert.equal(privateAddress('192.168.1.10'), true);
    assert.equal(privateAddress('172.32.0.1'), false);
    assert.equal(privateAddress('8.8.8.8'), false);
    const customNetwork = [{ family: 'IPv4', internal: false, address: '2.0.0.90', netmask: '255.255.255.0' }];
    assert.equal(localPeer('2.0.0.91', customNetwork), true);
    assert.equal(localPeer('2.0.1.91', customNetwork), false);
  } finally {
    await new Promise(resolve => occupied.close(resolve));
    await new Promise(resolve => app.close(resolve));
  }
});
