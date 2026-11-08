import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/web/compat.js', import.meta.url), 'utf8');
test('CEF без withResolvers: resolve, reject, подкласс и свойства', async () => {
  const context = vm.createContext({});
  vm.runInContext('delete Promise.withResolvers', context);
  vm.runInContext(source, context);
  const result = vm.runInContext('Promise.withResolvers()', context);
  result.resolve(42); assert.equal(await result.promise, 42);
  const rejected = vm.runInContext('Promise.withResolvers()', context);
  const rejection = assert.rejects(rejected.promise, /test error/);
  rejected.reject(new Error('test error')); await rejection;
  assert.equal(vm.runInContext('class Sub extends Promise {}; Promise.withResolvers.call(Sub).promise instanceof Sub', context), true);
  assert.equal(vm.runInContext('Object.getOwnPropertyDescriptor(Promise, "withResolvers").enumerable', context), false);
});
test('Современный браузер: нативная функция не заменяется', () => {
  const context = vm.createContext({});
  const native = vm.runInContext('Promise.withResolvers', context);
  vm.runInContext(source, context);
  assert.equal(vm.runInContext('Promise.withResolvers', context), native);
});
