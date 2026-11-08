import test from 'node:test';
import assert from 'node:assert/strict';
import { VmixBridge } from '../src/server/vmix.js';
import { diagnose } from '../src/server/diagnostics.js';
const key = '11111111-1111-4111-8111-111111111111';
test('Переименование сохраняет старые команды; новый источник получает новое имя', async () => {
  for (const legacy of [true, false]) {
    let inputs = legacy ? [{ title: 'PDF Viewer @18765' }] : [];
    const calls = [];
    const bridge = new VmixBridge({ wait: async () => {}, fetchImpl: async url => {
      const fn = url.searchParams.get('Function');
      if (fn) {
        calls.push(Object.fromEntries(url.searchParams));
        if (fn === 'AddInput') inputs.push({ title: 'Browser' });
        if (fn === 'SetInputName') inputs[0].title = url.searchParams.get('Value');
      }
      return new Response(fn ? 'OK' : `<vmix><version>29.0</version><inputs>${inputs.map(i => `<input key="${key}" number="1" type="Browser" title="${i.title}"/>`).join('')}</inputs></vmix>`);
    } });
    bridge.port = 18767;
    await bridge.connect({ apiPort: 8088 });
    assert.equal(inputs.length, 1, 'Существующий вход не дублируется');
    const prefix = legacy ? 'PDF Viewer' : 'vMix PDF Viewer';
    assert.equal(inputs[0].title, `${prefix} @18767`);
    bridge.port = 18768; bridge.syncedKey = null;
    await bridge.refresh();
    assert.equal(inputs[0].title, `${prefix} @18768`);
    assert.ok(calls.some(c => c.Function === 'BrowserNavigate' && c.Value.includes(':18768/output?vmixInput=')));
    const d = diagnose(bridge.snapshot(), { pages: 0 }, [], Date.now());
    assert.equal(d.code, 'empty', 'Диагностика принимает оба имени');
  }
});
test('Диагностика замечает дубли среди старых и новых имён', () => {
  const vmix = { enabled: true, checkedAt: 1, connected: true, linked: true, viewerPort: 18767,
    inputKey: key, inputs: [{ key, title: 'PDF Viewer @18767' }, { key: 'other', title: 'vMix PDF Viewer @18768' }] };
  assert.equal(diagnose(vmix, { pages: 0 }, []).code, 'duplicate');
});
