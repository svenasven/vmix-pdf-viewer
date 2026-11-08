import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { Library, LibraryError } from './library.js';
import { validRequest, localAddresses, listenAvailable } from './network.js';
import { VmixBridge } from './vmix.js';
import { commands, commandCode, shortcutTemplate } from './vmix-commands.js';
import { exportBackup, readBackup, importDocuments } from './backup.js';
import { diagnose } from './diagnostics.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const MAX = 50 * 1024 * 1024;
export function createApp({ now = Date.now, dataDir = null, vmix = new VmixBridge() } = {}) {
  const library = new Library(dataDir);
  const sessionId = randomUUID();
  const outputs = new Map();
  vmix.outputConfirmed = inputKey => [...outputs.values()].some(client => client.role !== 'preview' &&
    client.inputKey === inputKey && client.sessionId === sessionId && now() - client.lastSeen < 5000);
  let document = null;
  let state = { sessionId, revision: 0, page: 0, pages: 0, name: '', documentId: 0 };
  function saveSession(activeId, page) {
    if (!dataDir) return;
    const file = path.join(dataDir, 'session.json');
    writeFileSync(file + '.tmp', JSON.stringify({ activeId, page }));
    renameSync(file + '.tmp', file);
  }
  let savedSession;
  if (dataDir) { try { savedSession = JSON.parse(readFileSync(path.join(dataDir, 'session.json'), 'utf8')); } catch {} }
  function activate(doc, page = 1) {
    const bytes = library.bytes(doc.id);
    library.select(doc.id);
    saveSession(doc.id, page);
    document = bytes;
    state = { sessionId, revision: state.revision + 1, documentId: state.documentId + 1,
      activeId: doc.id, page, pages: doc.pages, name: doc.name };
  }
  if (library.value.activeId) {
    const doc = library.value.documents.find(d => d.id === library.value.activeId);
    const page = savedSession?.activeId === doc.id && Number.isInteger(savedSession.page) && savedSession.page >= 1 && savedSession.page <= doc.pages ? savedSession.page : 1;
    activate(doc, page);
  }
  let loading = false;
  const json = (res, code, body) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  return http.createServer(async (req, res) => {
    try {
      // Только локальные интерфейсы и узлы LAN, без cross-origin управления.
      const host = req.headers.host || '';
      if (!validRequest(req)) {
        return json(res, 403, { error: 'Недопустимый источник запроса' });
      }
      const url = new URL(req.url, `http://${host}`);
      if (!vmix.port) vmix.port = req.socket.localPort;
      if (req.method === 'GET' && url.pathname === '/api/backup') return await exportBackup(library,state,vmix,res);
      if (req.method === 'POST' && url.pathname === '/api/backup/restore') {
        if (loading) return json(res,409,{error:'Дождитесь завершения текущей загрузки'});
        if (!url.searchParams.has('revision')) return json(res,400,{error:'Требуется ревизия библиотеки'});
        loading = true; let backup;
        try {
          backup = await readBackup(req);
          const empty = !library.value.documents.length;
          const added = importDocuments(library,backup,Number(url.searchParams.get('revision')));
          let warning = '';
          if (empty && added) {
            activate(library.value.documents.find(doc=>doc.id===library.value.activeId),backup.header.page);
            const previous = vmix.settings;
            vmix.settings = {enabled:false,apiPort:backup.header.vmixApiPort,inputKey:null};
            try { vmix.save(); vmix.syncedKey=null; } catch { vmix.settings=previous; warning='Документы восстановлены, но настройки подключения не удалось сохранить.'; }
          }
          return json(res,200,{added,merged:!empty,state,warning});
        } finally { backup?.clean(); loading=false; }
      }
      if (req.method === 'GET' && url.pathname === '/api/vmix/commands') {
        return json(res, 200, { commands: commands.map(command => ({ ...command, code: commandCode(command) })) });
      }
      if (req.method === 'GET' && url.pathname === '/api/vmix/script') {
        const command = commands.find(item => item.id === url.searchParams.get('id'));
        if (!command) return json(res, 404, { error: 'Команда не найдена' });
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': 'attachment; filename="' + command.id + '.txt"', 'Cache-Control': 'no-store' });
        return res.end('﻿' + commandCode(command));
      }
      if (req.method === 'GET' && url.pathname === '/api/vmix/shortcuts') {
        res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': 'attachment; filename="PDF-Viewer.vMixShortcutTemplate"', 'Cache-Control': 'no-store' });
        return res.end(shortcutTemplate());
      }
      if (req.method === 'GET' && url.pathname === '/api/vmix') return json(res, 200, vmix.snapshot());
      if (req.method === 'GET' && url.pathname === '/api/diagnostics') return json(res,200,diagnose(vmix.snapshot(),state,[...outputs.values()],now()));
      if (req.method === 'POST' && url.pathname === '/api/vmix/check') {
        await vmix.refresh();
        return json(res,200,diagnose(vmix.snapshot(),state,[...outputs.values()],now()));
      }
      if (req.method === 'POST' && url.pathname === '/api/vmix/reconnect') {
        if (!vmix.settings.inputKey) return json(res,409,{error:'Сначала выберите источник в мастере настройки vMix'});
        await vmix.connect({...vmix.settings});
        return json(res,200,diagnose(vmix.snapshot(),state,[...outputs.values()],now()));
      }
      if (req.method === 'POST' && url.pathname === '/api/vmix/probe') {
        const apiPort = Number(url.searchParams.get('port'));
        if (!Number.isInteger(apiPort) || apiPort < 1024 || apiPort > 65535) return json(res, 400, { error: 'Укажите порт vMix от 1024 до 65535' });
        try {
          const info = await vmix.inspect(apiPort);
          const linked = vmix.settings.enabled && apiPort === vmix.settings.apiPort && info.inputs.some(input => input.type === 'Browser' && input.key === vmix.settings.inputKey);
          return json(res, 200, { ...vmix.snapshot(), connected: true, version: info.version, edition: info.edition,
            linked, inputKey: linked ? vmix.settings.inputKey : null,
            inputs: info.inputs.filter(item => item.type === 'Browser'), message: 'vMix найден' });
        } catch { return json(res, 502, { error: 'vMix не отвечает. Откройте Settings → Web / Web Controller и проверьте включение и порт.' }); }
      }
      if (req.method === 'POST' && url.pathname === '/api/vmix/connect') {
        return json(res, 200, await vmix.connect({ apiPort: Number(url.searchParams.get('port')), inputKey: url.searchParams.get('input') || '' }));
      }
      if (req.method === 'POST' && url.pathname === '/api/vmix/test') {
        return json(res, 200, await vmix.testCommand(url.searchParams.get('command')));
      }
      if (req.method === 'GET' && url.pathname === '/api/connection') {
        const port = req.socket.localPort;
        return json(res, 200, { port, localUrl: `http://127.0.0.1:${port}`, lanUrls: localAddresses().map(ip => `http://${ip}:${port}`) });
      }
      if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, state);
      if (req.method === 'GET' && url.pathname === '/api/library') return json(res, 200, library.snapshot());
      if (req.method === 'DELETE' && url.pathname === '/api/library/document') {
        const id = url.searchParams.get('id');
        const active = library.value.activeId === id;
        const rawRevision = url.searchParams.get('revision');
        library.remove(id, rawRevision === null ? NaN : Number(rawRevision));
        if (active) {
          const next = library.value.documents.find(doc => doc.id === library.value.activeId);
          if (next) activate(next);
          else {
            saveSession(null, 0);
            document = null;
            state = { sessionId, revision: state.revision + 1, documentId: state.documentId + 1,
              activeId: null, page: 0, pages: 0, name: '' };
          }
        }
        return json(res, 200, state);
      }
      if (req.method === 'POST' && url.pathname === '/api/library/order') {
        let length = 0; const chunks = [];
        for await (const chunk of req) {
          length += chunk.length;
          if (length > 20000) return json(res, 413, { error: 'Список слишком большой' });
          chunks.push(chunk);
        }
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString()); }
        catch { return json(res, 400, { error: 'Требуется JSON' }); }
        if (!body || !Array.isArray(body.ids)) return json(res, 400, { error: 'Требуется массив ids' });
        library.reorder(body.ids, body.revision);
        return json(res, 200, library.snapshot());
      }
      if (req.method === 'POST' && url.pathname === '/api/library/select') {
        const doc = library.value.documents.find(d => d.id === url.searchParams.get('id'));
        if (!doc) return json(res, 404, { error: 'PDF не найден' });
        activate(doc);
        return json(res, 200, state);
      }
      if (req.method === 'POST' && url.pathname === '/api/library/navigate') {
        const action = url.searchParams.get('action');
        if (!['next', 'previous'].includes(action)) return json(res, 400, { error: 'Неизвестная команда' });
        const { documents, activeId } = library.value;
        if (!documents.length) return json(res, 409, { error: 'Добавьте PDF' });
        const index = documents.findIndex(d => d.id === activeId);
        const target = Math.max(0, Math.min(documents.length - 1, index + (action === 'next' ? 1 : -1)));
        if (target !== index) activate(documents[target]);
        return json(res, 200, state);
      }
      if (req.method === 'GET' && url.pathname === '/api/outputs') {
        return json(res, 200, { clients: [...outputs.values()].map(client => ({ ...client,
          online: now() - client.lastSeen < 5000,
          current: client.status === 'ready' && client.sessionId === sessionId &&
            client.documentId === state.documentId && client.revision === state.revision && client.page === state.page
        })) });
      }
      if (req.method === 'POST' && url.pathname === '/api/outputs') {
        let length = 0; const chunks = [];
        for await (const chunk of req) {
          length += chunk.length;
          if (length > 4096) return json(res, 413, { error: 'Отчёт слишком большой' });
          chunks.push(chunk);
        }
        let report;
        try { report = JSON.parse(Buffer.concat(chunks).toString()); }
        catch { return json(res, 400, { error: 'Требуется JSON' }); }
        if (!report || typeof report.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(report.id) ||
            !['idle', 'loading', 'ready', 'error'].includes(report.status) ||
            !['page', 'revision', 'documentId'].every(key => Number.isInteger(report[key]) && report[key] >= 0) ||
            typeof report.sessionId !== 'string' || typeof report.error !== 'string' ||
            typeof report.userAgent !== 'string') return json(res, 400, { error: 'Некорректный отчёт' });
        if (report.sessionId !== sessionId) return json(res, 409, { error: 'Сервер перезапущен' });
        for (const [id, client] of outputs) if (now() - client.lastSeen > 60000) outputs.delete(id);
        if (!outputs.has(report.id) && outputs.size >= 32) return json(res, 429, { error: 'Слишком много выходов' });
        outputs.set(report.id, { id: report.id, sessionId, status: report.status,
          inputKey: typeof report.inputKey === 'string' && /^[a-fA-F0-9-]{36}$/.test(report.inputKey) ? report.inputKey : '',
          page: report.page, revision: report.revision, documentId: report.documentId,
          error: report.error.slice(0, 1000), userAgent: report.userAgent.slice(0, 500), lastSeen: now(),
          role: report.role === 'preview' ? 'preview' : 'output' });
        return json(res, 200, { ok: true });
      }
      if (req.method === 'POST' && ['/api/document', '/api/documents'].includes(url.pathname)) {
        if (loading) return json(res, 409, { error: 'Документ уже загружается' });
        if (req.headers['content-type'] !== 'application/pdf') return json(res, 415, { error: 'Требуется application/pdf' });
        loading = true;
        try {
          let length = 0; const chunks = [];
          for await (const chunk of req) {
            length += chunk.length;
            if (length > MAX) return json(res, 413, { error: 'Лимит PDF: 50 МиБ' });
            chunks.push(chunk);
          }
          const bytes = Buffer.concat(chunks);
          let pdf;
          try { pdf = await PDFDocument.load(bytes, { updateMetadata: false }); }
          catch { return json(res, 422, { error: 'Повреждённый или защищённый PDF' }); }
          const pages = pdf.getPageCount();
          if (!pages) return json(res, 422, { error: 'PDF не содержит страниц' });
          const doc = library.add(bytes, (url.searchParams.get('name') || 'Документ.pdf').slice(0, 200), pages, url.pathname === '/api/document');
          if (!document || url.pathname === '/api/document') activate(doc);
          return json(res, 200, state);
        } finally { loading = false; }
      }
      if (req.method === 'POST' && url.pathname === '/api/page') {
        if (!document) return json(res, 409, { error: 'Сначала откройте PDF' });
        const action = url.searchParams.get('action');
        let page = action === 'next' ? Math.min(state.pages, state.page + 1) :
          action === 'previous' ? Math.max(1, state.page - 1) :
          action === 'first' ? 1 : action === 'last' ? state.pages :
          action === 'goto' ? Number(url.searchParams.get('page')) : NaN;
        if (!Number.isInteger(page) || page < 1 || page > state.pages) return json(res, 400, { error: 'Недопустимая страница или команда' });
        saveSession(state.activeId, page);
        state = { ...state, page, revision: state.revision + 1 };
        return json(res, 200, state);
      }
      if (req.method === 'GET' && url.pathname === '/document.pdf') {
        if ((url.searchParams.has('sessionId') && url.searchParams.get('sessionId') !== sessionId) ||
            (url.searchParams.has('documentId') && Number(url.searchParams.get('documentId')) !== state.documentId)) {
          return json(res, 409, { error: 'Документ уже заменён' });
        }
        if (!document) return json(res, 404, { error: 'Нет документа' });
        res.writeHead(200, { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' });
        return res.end(document);
      }
      if (req.method !== 'GET') return json(res, 405, { error: 'Метод не поддерживается' });
      let file;
      if (url.pathname === '/app-icon.png') {
        file = path.join(root, 'assets/app.png');
      } else if (url.pathname.startsWith('/vendor/')) {
        const relative = url.pathname.slice(8);
        const base = path.join(root, 'node_modules/pdfjs-dist');
        file = path.resolve(base, relative);
        if (!file.startsWith(base + path.sep)) return json(res, 403, { error: 'Нет доступа' });
      } else {
        const files = { '/translations.js': 'translations.js', '/i18n.js': 'i18n.js', '/': 'control.html', '/output': 'output.html', '/control.js': 'control.js', '/output.js': 'output.js', '/style.css': 'style.css', '/theme.css': 'theme.css', '/theme.js': 'theme.js', '/compat.js': 'compat.js', '/pdf-worker.js': 'pdf-worker.js', '/pdf-session.js': 'pdf-session.js', '/thumbnails.js': 'thumbnails.js', '/backup-ui.js': 'backup-ui.js', '/diagnostics-ui.js': 'diagnostics-ui.js', '/dialog-navigation.js': 'dialog-navigation.js' };
        if (!files[url.pathname]) return json(res, 404, { error: 'Не найдено' });
        file = path.join(root, 'src/web', files[url.pathname]);
      }
      const bytes = await readFile(file);
      const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png' };
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
      res.end(bytes);
    } catch (error) {
      if (!res.headersSent) json(res, error instanceof LibraryError ? error.status : error.code === 'ENOENT' ? 404 : 500,
        { error: error instanceof LibraryError ? error.message : 'Ошибка сервера' });
      else res.end();
    }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createApp({ dataDir: path.join(root, 'data') });
  const port = await listenAvailable(server);
  console.log(`Управление: http://127.0.0.1:${port}/\nВывод vMix: http://127.0.0.1:${port}/output`);
  for (const ip of localAddresses()) console.log(`Локальная сеть: http://${ip}:${port}/`);
}

