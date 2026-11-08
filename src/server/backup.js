import { createGzip, createGunzip } from 'node:zlib';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, unlinkSync, rmdirSync, openSync, closeSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { PDFDocument } from 'pdf-lib';
import { LibraryError } from './library.js';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export async function exportBackup(library, state, vmix, response) {
  const snapshot = library.snapshot();
  // Снимок берётся до первого await: дальнейшие изменения списка не смешиваются с копией.
  const copies = [];
  try { for (const doc of snapshot.documents) copies.push({ doc, fd: library.directory ? openSync(path.join(library.directory,doc.id+'.pdf'),'r') : null, bytes: library.directory ? null : library.bytes(doc.id) }); }
  catch(error) { for(const copy of copies)if(copy.fd!==null)closeSync(copy.fd); throw error; }
  async function* records() {
    yield JSON.stringify({ format: 'pdf-viewer-backup', version: 1, createdAt: new Date().toISOString(),
      activeId: snapshot.activeId, page: state.page, count: copies.length, vmixApiPort: vmix.settings.apiPort }) + '\n';
    for (const copy of copies) { const bytes=copy.bytes || readFileSync(copy.fd); yield JSON.stringify({ ...copy.doc, sha256: digest(bytes), data: bytes.toString('base64') }) + '\n'; }
    yield JSON.stringify({ end: true, count: copies.length }) + '\n';
  }
  response.writeHead(200, { 'Content-Type': 'application/gzip', 'Content-Disposition': `attachment; filename="PDF-Viewer-${new Date().toISOString().slice(0,10)}.pdfviewer-backup"`, 'Cache-Control': 'no-store' });
  try { await pipeline(Readable.from(records()), createGzip(), response); }
  finally { for(const copy of copies)if(copy.fd!==null)closeSync(copy.fd); }
}

export async function readBackup(request) {
  const directory = mkdtempSync(path.join(tmpdir(), 'pdf-viewer-backup-'));
  const files = [];
  const clean = () => { for (const file of files) { try { unlinkSync(file); } catch {} } try { rmdirSync(directory); } catch {} };
  const unzip = createGunzip();
  const aborted = () => unzip.destroy(new Error('Загрузка прервана'));
  request.once('aborted', aborted); request.once('error', aborted);
  request.pipe(unzip);
  let pending = '', header, ended = false, total = 0, expanded = 0; const documents = [], ids = new Set();
  const decoder = new StringDecoder('utf8');
  async function record(line) {
    if (ended) throw new Error('Данные после конца копии');
    const item = JSON.parse(line);
    if (!header) {
      if (item.format !== 'pdf-viewer-backup' || item.version !== 1 || !Number.isInteger(item.count) || item.count < 0 || item.count > 200 ||
          !Number.isInteger(item.page) || item.page < 0 || !Number.isInteger(item.vmixApiPort) || item.vmixApiPort < 1024 || item.vmixApiPort > 65535) throw new Error('Неизвестный формат');
      header = item; return;
    }
    if (item.end === true) { if (item.count !== documents.length || item.count !== header.count) throw new Error('Неполная копия'); ended = true; return; }
    if (documents.length >= 200 || typeof item.id !== 'string' || !/^[a-f0-9-]{36}$/.test(item.id) || ids.has(item.id) || typeof item.name !== 'string' || !item.name.length || item.name.length > 200 ||
        !Number.isInteger(item.size) || item.size < 1 || item.size > 50 * 1024 ** 2 || typeof item.data !== 'string' ||
        item.data.length > 70 * 1024 ** 2) throw new Error('Некорректный PDF в копии');
    const bytes = Buffer.from(item.data, 'base64');
    if (bytes.length !== item.size || bytes.toString('base64') !== item.data || digest(bytes) !== item.sha256) throw new Error('Контрольная сумма не совпала');
    total += bytes.length; if (total > 1024 ** 3) throw new Error('Копия больше 1 ГиБ');
    const pdf = await PDFDocument.load(bytes, { updateMetadata: false }); const pages = pdf.getPageCount();
    if (!pages || pages !== item.pages) throw new Error('Неверное число страниц');
    const file = path.join(directory, randomUUID()); files.push(file); writeFileSync(file, bytes);
    documents.push({ oldId: item.id, name: item.name, pages, size: bytes.length, file }); ids.add(item.id);
  }
  try {
    for await (const chunk of unzip) {
      expanded += chunk.length; if (expanded > 1450 * 1024 ** 2) throw new Error('Копия слишком большая');
      pending += decoder.write(chunk);
      let end;
      while ((end = pending.indexOf('\n')) !== -1) { const line = pending.slice(0,end); pending = pending.slice(end+1); if (line.length > 70 * 1024 ** 2) throw new Error('Запись слишком большая'); await record(line); }
      if (pending.length > 70 * 1024 ** 2) throw new Error('Запись слишком большая');
    }
    pending += decoder.end();
    if (pending.trim() || !ended || !header || (documents.length ? !ids.has(header.activeId) : header.activeId !== null)) throw new Error('Неполная копия');
    const active = documents.find(doc => doc.oldId === header.activeId);
    if (active && (header.page < 1 || header.page > active.pages)) throw new Error('Неверная страница');
    return { header, documents, clean };
  } catch (error) { clean(); throw new LibraryError(422, 'Не удалось прочитать копию: файл повреждён или имеет неподдерживаемый формат.'); }
  finally { request.off('aborted', aborted); request.off('error', aborted); request.unpipe(unzip); unzip.destroy(); }
}

export function importDocuments(library, backup, revision) {
  if (revision !== library.value.revision) throw new LibraryError(409, 'Библиотека изменилась. Проверьте список и повторите восстановление.');
  const old = library.value, added = [], written = [];
  if (old.documents.length + backup.documents.length > 200 || old.documents.reduce((n,d)=>n+d.size,0) + backup.documents.reduce((n,d)=>n+d.size,0) > 1024 ** 3) throw new LibraryError(413, 'В библиотеке недостаточно места: лимит 200 PDF или 1 ГиБ.');
  try {
    for (const source of backup.documents) {
      const doc = { id: randomUUID(), name: source.name, pages: source.pages, size: source.size };
      const bytes = readFileSync(source.file);
      if (library.directory) { const file = path.join(library.directory, doc.id+'.pdf'); written.push(file); writeFileSync(file,bytes,{flag:'wx'}); }
      else library.memory.set(doc.id,bytes);
      added.push(doc);
    }
    const activeIndex = backup.documents.findIndex(doc=>doc.oldId===backup.header.activeId);
    library.commit({ ...old, documents: [...old.documents,...added], activeId: old.activeId || added[activeIndex]?.id || null });
    return added.length;
  } catch(error) {
    for (const file of written) { try { unlinkSync(file); } catch {} }
    for (const doc of added) library.memory.delete(doc.id);
    throw error;
  }
}
