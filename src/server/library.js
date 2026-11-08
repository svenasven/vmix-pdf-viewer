import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, statSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class LibraryError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Манифест заменяется атомарно до публикации нового состояния в память.
export class Library {
  constructor(directory = null) {
    this.directory = directory;
    this.memory = new Map();
    this.value = { schema: 1, revision: 0, activeId: null, documents: [] };
    if (!directory) return;
    mkdirSync(directory, { recursive: true });
    try {
      const value = JSON.parse(readFileSync(path.join(directory, 'library.json'), 'utf8'));
      if (value.schema !== 1 || !Number.isInteger(value.revision) || value.revision < 0 || !Array.isArray(value.documents) ||
          value.documents.length > 200 || new Set(value.documents.map(d => d.id)).size !== value.documents.length ||
          value.documents.some(d => !/^[a-f0-9-]{36}$/.test(d.id) || typeof d.name !== 'string' ||
            !Number.isInteger(d.pages) || d.pages < 1 || !Number.isInteger(d.size) || d.size < 1 || d.size > 50 * 1024 * 1024) ||
          (value.documents.length ? !value.documents.some(d => d.id === value.activeId) : value.activeId !== null)) {
        throw new Error('Некорректный манифест библиотеки');
      }
      for (const doc of value.documents) {
        if (statSync(path.join(directory, `${doc.id}.pdf`)).size !== doc.size) throw new Error(`PDF недоступен: ${doc.name}`);
      }
      this.value = value;
    } catch (error) {
      // Отсутствующий файл PDF внутри существующего манифеста — ошибка, не пустая библиотека.
      if (error.code !== 'ENOENT' || error.path !== path.join(directory, 'library.json')) throw error;
    }
  }
  snapshot() { return structuredClone(this.value); }
  commit(next) {
    next = { ...next, revision: this.value.revision + 1 };
    if (this.directory) {
      const temp = path.join(this.directory, 'library.json.tmp');
      writeFileSync(temp, JSON.stringify(next, null, 2), 'utf8');
      renameSync(temp, path.join(this.directory, 'library.json'));
    }
    this.value = next;
  }
  add(bytes, name, pages, select = false) {
    const docs = this.value.documents;
    if (docs.length >= 200 || docs.reduce((sum, doc) => sum + doc.size, 0) + bytes.length > 1024 ** 3) {
      throw new LibraryError(413, 'Лимит библиотеки: 200 PDF или 1 ГиБ');
    }
    const doc = { id: randomUUID(), name, pages, size: bytes.length };
    const filename = this.directory && path.join(this.directory, `${doc.id}.pdf`);
    if (filename) writeFileSync(filename, bytes, { flag: 'wx' });
    else this.memory.set(doc.id, bytes);
    try { this.commit({ ...this.value, documents: [...docs, doc], activeId: select || !docs.length ? doc.id : this.value.activeId }); }
    catch (error) {
      if (filename) unlinkSync(filename); else this.memory.delete(doc.id);
      throw error;
    }
    return doc;
  }
  select(id) {
    const doc = this.value.documents.find(d => d.id === id);
    if (!doc) throw new LibraryError(404, 'PDF не найден');
    if (this.value.activeId !== id) this.commit({ ...this.value, activeId: id });
    return doc;
  }
  reorder(ids, revision) {
    if (revision !== this.value.revision) throw new LibraryError(409, 'Список уже изменён. Повторите перестановку.');
    const docs = this.value.documents;
    if (!Array.isArray(ids) || ids.length !== docs.length || new Set(ids).size !== docs.length ||
        ids.some(id => !docs.some(doc => doc.id === id))) throw new LibraryError(400, 'Требуется точный список ID без повторений');
    this.commit({ ...this.value, documents: ids.map(id => docs.find(doc => doc.id === id)) });
  }
  remove(id, revision) {
    if (revision !== this.value.revision) throw new LibraryError(409, 'Список уже изменён. Повторите удаление.');
    const index = this.value.documents.findIndex(doc => doc.id === id);
    if (index < 0) throw new LibraryError(404, 'PDF не найден');
    if (this.value.activeId === id) throw new LibraryError(409, 'Этот PDF сейчас показывается. Сначала переключитесь на другой документ.');
    const documents = this.value.documents.filter(doc => doc.id !== id);
    const activeId = this.value.activeId === id ? (documents[Math.min(index, documents.length - 1)]?.id ?? null) : this.value.activeId;
    this.commit({ ...this.value, documents, activeId });
    // Сначала сохраняем манифест: сбой очистки не оставит ссылку на отсутствующий PDF.
    if (this.directory) {
      try { unlinkSync(path.join(this.directory, `${id}.pdf`)); }
      catch (error) { if (error.code !== 'ENOENT') console.warn('Не удалось очистить копию удалённого PDF:', error.message); }
    } else this.memory.delete(id);
  }
  bytes(id) {
    return this.directory ? readFileSync(path.join(this.directory, `${id}.pdf`)) : this.memory.get(id);
  }
}
