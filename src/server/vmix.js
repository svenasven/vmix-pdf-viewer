import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { LibraryError } from './library.js';
import { commands, commandCode } from './vmix-commands.js';
import { productName, isViewerInputTitle, isLegacyInputTitle, viewerInputTitle } from './brand.js';

const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false, processEntities: true });
export function parseVmix(xml) {
  if (xml.length > 2 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Некорректный ответ vMix');
  const value = parser.parse(xml).vmix;
  if (!value || !/^\d+\.\d+/.test(value.version || '')) throw new Error('По этому адресу не найден vMix');
  const input = value.inputs?.input;
  const inputs = (Array.isArray(input) ? input : input ? [input] : []).map(item => ({
    key: item['@_key'], number: Number(item['@_number']), type: item['@_type'], title: item['@_title']
  })).filter(item => typeof item.key === 'string');
  return { version: value.version, edition: value.edition || '', inputs };
}
export class VmixBridge {
  constructor({ profileDir = null, fetchImpl = fetch, wait = ms => new Promise(resolve => setTimeout(resolve,ms)) } = {}) {
    this.profileDir = profileDir; this.fetch = fetchImpl; this.port = 0; this.syncedKey = null;
    this.settings = { enabled: false, apiPort: 8088, inputKey: null };
    this.status = { connected: false, message: 'Подключите vMix', inputs: [] };
    this.busy = false; this.timer = null;
    this.wait = wait;
    if (profileDir) {
      try {
        const value = JSON.parse(readFileSync(path.join(profileDir, 'vmix.json'), 'utf8'));
        if (Number.isInteger(value.apiPort) && value.apiPort > 1023 && value.apiPort < 65536 &&
          typeof value.enabled === 'boolean' && (value.inputKey === null || typeof value.inputKey === 'string')) this.settings = value;
      } catch {}
    }
  }
  save() {
    if (!this.profileDir) return;
    mkdirSync(this.profileDir, { recursive: true });
    const target = path.join(this.profileDir, 'vmix.json');
    writeFileSync(target + '.tmp', JSON.stringify(this.settings, null, 2)); renameSync(target + '.tmp', target);
  }
  snapshot() { return structuredClone({ ...this.status, ...this.settings, viewerPort:this.port, outputUrl: `http://127.0.0.1:${this.port}/output` }); }
  async api(params = {}, apiPort = this.settings.apiPort) {
    const url = new URL(`http://127.0.0.1:${apiPort}/api/`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const response = await this.fetch(url, { signal: AbortSignal.timeout(2500), redirect: 'error' });
    if (!response.ok) throw new Error('vMix отклонил команду. Проверьте Web Controller и настройки API.');
    return response.text();
  }
  async inspect(apiPort = this.settings.apiPort) {
    return parseVmix(await this.api({}, apiPort));
  }
  async sync(info) {
    const input = info.inputs.find(item => item.key === this.settings.inputKey && item.type === 'Browser');
    this.status = { connected: true, version: info.version, edition: info.edition,
      inputs: info.inputs.filter(item => item.type === 'Browser'), linked: !!input,
      message: input ? 'Источник PDF подключён' : 'Выберите или добавьте источник PDF' };
    if (this.settings.enabled && input && this.syncedKey !== input.key) {
      await this.api({ Function: 'BrowserNavigate', Input: input.key, Value: `http://127.0.0.1:${this.port}/output?vmixInput=${encodeURIComponent(input.key)}` });
      await this.api({ Function: 'BrowserKeyboardDisabled', Input: input.key });
      const title = viewerInputTitle(this.port, isLegacyInputTitle(input.title));
      await this.api({ Function: 'SetInputName', Input: input.key, Value: title });
      this.syncedKey = input.key;
      input.title = title;
    }
    if (!input) this.syncedKey = null;
  }
  async refresh() {
    if (this.busy) return this.snapshot();
    this.busy = true;
    try {
      const info=await this.inspect();
      try { await this.sync(info); }
      catch(error) { this.syncedKey=null; this.status={...this.status,connected:true,syncError:true,detail:error.message}; }
    }
    catch (error) {
      this.syncedKey = null;
      this.status = { ...this.status, connected: false, linked: false, message: 'Нет связи с vMix. Запустите vMix и проверьте Settings → Web / Web Controller.', detail: error.message };
    } finally { this.status.checkedAt=Date.now(); this.busy = false; }
    return this.snapshot();
  }
  async connect({ apiPort, inputKey = '' }) {
    if (!Number.isInteger(apiPort) || apiPort < 1024 || apiPort > 65535) throw new LibraryError(400, 'Укажите порт vMix от 1024 до 65535');
    if (this.busy) throw new LibraryError(409, 'Подключение уже выполняется');
    this.busy = true;
    try {
      let info = await this.inspect(apiPort);
      let input;
      let created = false;
      if (inputKey) {
        input = info.inputs.find(item => item.key === inputKey && item.type === 'Browser');
        if (!input) throw new LibraryError(404, 'Источник не найден. Обновите список.');
      } else {
        const matches = info.inputs.filter(item => item.type === 'Browser' && isViewerInputTitle(item.title));
        if (matches.length > 1) throw new LibraryError(409, 'Найдено несколько источников vMix PDF Viewer. Выберите нужный в списке.');
        input = matches[0];
        if (!input) {
          const keys = new Set(info.inputs.map(item => item.key));
          await this.api({ Function: 'AddInput', Value: `Browser|http://127.0.0.1:${this.port}/output` }, apiPort);
          info = await this.inspect(apiPort);
          const added = info.inputs.filter(item => item.type === 'Browser' && !keys.has(item.key));
          if (added.length !== 1) throw new Error('Не удалось определить новый источник. Выберите его вручную.');
          input = added[0];
          created = true;
          await this.api({ Function: 'SetInputName', Input: input.key, Value: productName }, apiPort);
        }
      }
      this.settings = { enabled: true, apiPort, inputKey: input.key }; this.syncedKey = null; this.save();
      await this.sync(await this.inspect());
      // Новый Browser Input может проигнорировать навигацию до запуска CEF.
      // Повторяем её только до первого отчёта именно от этого источника.
      if (created && this.outputConfirmed) {
        for (let attempt=0;attempt<8 && !this.outputConfirmed(input.key);attempt++) {
          await this.wait(750);
          if ((attempt===2 || attempt===5) && !this.outputConfirmed(input.key)) {
            this.syncedKey=null;
            await this.sync(await this.inspect());
          }
        }
      }
      this.status.checkedAt = Date.now();
      return this.snapshot();
    } catch (error) {
      if (error instanceof LibraryError) throw error;
      throw new LibraryError(502, 'Не удалось подключить vMix. Проверьте, что он запущен и порт Web / Web Controller указан верно.');
    } finally { this.busy = false; }
  }
  async testCommand(id) {
    const command = commands.find(item => item.id === id);
    if (!command) throw new LibraryError(400, 'Неизвестная команда');
    const info = await this.inspect();
    if (!['Pro', '4K', 'Trial', 'MAX'].includes(info.edition)) throw new LibraryError(409, 'Для команд нужны vMix 4K, Pro или Trial с поддержкой Scripting.');
    await this.api({ Function: 'ScriptStart', Value: command.id });
    return { ok: true, message: 'Команда отправлена через vMix. Проверьте страницу в предпросмотре.' };
  }
  start(port) {
    this.port = port; this.syncedKey = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => { if (this.settings.enabled) this.refresh(); }, 2000); this.timer.unref?.();
    if (this.settings.enabled) this.refresh();
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}
