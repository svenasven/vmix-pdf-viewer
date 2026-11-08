import { networkInterfaces } from 'node:os';
import http from 'node:http';
import { randomUUID } from 'node:crypto';

async function ownsLoopback(server, port) {
  const token = randomUUID(); let received = false;
  const observe = req => { if (req.headers['x-pdf-viewer-probe'] === token) received = true; };
  server.on('request', observe);
  try {
    await new Promise(resolve => {
      const request = http.get({ hostname: '127.0.0.1', port, path: '/.well-known/port-check', headers: { 'X-Pdf-Viewer-Probe': token } }, response => { response.resume(); response.on('end', resolve); });
      request.setTimeout(1500, () => request.destroy()); request.on('error', resolve);
    });
    return received;
  } finally { server.off('request', observe); }
}

export function privateAddress(ip) {
  return /^(127\.|10\.|192\.168\.|169\.254\.)/.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip) || ip === '::1';
}
export function localAddresses() {
  return [...new Set(Object.values(networkInterfaces()).flat().filter(item => item && item.family === 'IPv4' && !item.internal).map(item => item.address))];
}
export function localPeer(ip, interfaces = Object.values(networkInterfaces()).flat()) {
  if (ip === '::1' || ip.startsWith('127.')) return true;
  const number = value => value.split('.').reduce((result, part) => (result << 8) | Number(part), 0) >>> 0;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return false;
  return interfaces.some(item => item && item.family === 'IPv4' && !item.internal && item.netmask !== '0.0.0.0' &&
    (number(ip) & number(item.netmask)) === (number(item.address) & number(item.netmask)));
}
export function validRequest(req) {
  const host = req.headers.host || '';
  const match = /^([a-zA-Z0-9.]+):(\d+)$/.exec(host);
  const peer = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  if (!match || Number(match[2]) !== req.socket.localPort || !localPeer(peer)) return false;
  if (!['127.0.0.1', 'localhost', ...localAddresses()].includes(match[1].toLowerCase())) return false;
  return !req.headers.origin || req.headers.origin === `http://${host}`;
}
export async function listenAvailable(server, { startPort = 18765, host = '0.0.0.0', attempts = 100 } = {}) {
  for (let offset = 0; offset < attempts; offset++) {
    const port = startPort === 0 ? 0 : startPort + offset;
    if (port > 65535) break;
    try {
      await new Promise((resolve, reject) => {
        const failed = error => { server.off('listening', ready); reject(error); };
        const ready = () => { server.off('error', failed); resolve(); };
        server.once('error', failed); server.once('listening', ready);
        server.listen({ port, host, exclusive: true });
      });
      const actual = server.address().port;
      // Windows допускает wildcard bind рядом с существующим loopback bind.
      // Проверяем, что именно наш HTTP-сервер обслуживает локальное окно.
      if (await ownsLoopback(server, actual)) return actual;
      await new Promise(resolve => server.close(resolve));
    } catch (error) { if (!['EADDRINUSE', 'EACCES'].includes(error.code)) throw error; }
  }
  if (startPort !== 0) return listenAvailable(server, { startPort: 0, host, attempts: 1 });
  throw new Error('Не удалось выбрать свободный порт');
}
