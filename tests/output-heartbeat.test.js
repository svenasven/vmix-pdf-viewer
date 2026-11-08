import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = (await readFile(new URL('../src/web/output.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?$/gm, '')
  .replace('heartbeat(); poll();', '');
function setup(fetch) {
  const timers = [];
  const context = vm.createContext({ fetch, setTimeout: (fn, ms) => timers.push({ fn, ms }),
    PdfSession: class {}, URLSearchParams, location: { search: '' },
    navigator: { userAgent: 'test-output' }, document: { querySelector: () => ({}) }, addEventListener() {} });
  vm.runInContext(source, context);
  vm.runInContext("report.sessionId = 'current-session'", context);
  return { context, timers };
}
for (const status of [200, 409]) {
  test(`Отчёт выхода: ответ ${status} полностью прочитан до следующего запроса`, async () => {
    let finishBody, reading = false;
    const { context, timers } = setup(async (url, options) => {
      assert.equal(url, '/api/outputs');
      assert.equal(JSON.parse(options.body).sessionId, 'current-session');
      return { status, ok: status === 200, text: () => {
        reading = true;
        return new Promise(resolve => { finishBody = resolve; });
      } };
    });
    const heartbeat = vm.runInContext('heartbeat()', context);
    await new Promise(setImmediate);
    assert.equal(reading, true);
    assert.equal(timers.length, 0, 'Новый отчёт не планируется с непрочитанным ответом');
    finishBody('{"ok":true}');
    await heartbeat;
    assert.equal(timers.length, 1);
    assert.equal(timers[0].ms, 1000);
  });
}
test('Отчёт выхода: сетевая ошибка не останавливает повторные попытки', async () => {
  const { context, timers } = setup(async () => { throw Error('offline'); });
  await vm.runInContext('heartbeat()', context);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 1000);
});
