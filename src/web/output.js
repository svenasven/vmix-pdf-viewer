import '/compat.js';
import { PdfSession } from '/pdf-session.js';
const pdfSession = new PdfSession();
// Последовательная обработка: медленный рендер не может заменить более новый кадр.
let pdfjs, pdf, documentId = -1, revision = -1, sessionId = '', sizeVersion = 0;
const id = `out_${Date.now()}_${Math.random().toString(36).slice(2)}`;
let report = { id, sessionId: '', status: 'idle', documentId: 0, page: 0, revision: 0,
  error: '', userAgent: navigator.userAgent,
  role: new URLSearchParams(location.search).get('role') === 'preview' ? 'preview' : 'output',
  inputKey: new URLSearchParams(location.search).get('vmixInput') || '' };
async function heartbeat() {
  try {
    if (report.sessionId) {
      const response = await fetch('/api/outputs', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) });
      // Освобождаем поток каждого ответа, в том числе при ошибке HTTP.
      await response.text();
    }
  } catch { /* Повторная попытка после восстановления связи. */ }
  setTimeout(heartbeat, 1000);
}
function status(value, state, error = '') {
  report = { ...report, sessionId: state.sessionId, status: value, error,
    documentId: state.documentId, page: state.page, revision: state.revision };
}
const visible = document.querySelector('canvas');
async function poll() {
  let state;
  try {
    const response = await fetch('/api/state');
    if (!response.ok) throw new Error('Состояние недоступно');
    state = await response.json();
    if (sessionId !== state.sessionId) {
      await pdfSession.reset();
      pdf = null; sessionId = state.sessionId; documentId = -1; revision = -1;
      visible.width = visible.height = 0;
    }
    if (!state.pages) {
      if (pdf || visible.width || visible.height) {
        await pdfSession.reset(); pdf = null;
        visible.width = visible.height = 0;
      }
      documentId = state.documentId; revision = state.revision;
      status('idle', state);
    }
    if (state.pages && revision !== state.revision) {
      status('loading', state);
      const renderingSize = sizeVersion;
      if (!pdfjs) {
        const module = await import('/vendor/legacy/build/pdf.mjs');
        module.GlobalWorkerOptions.workerSrc = '/pdf-worker.js';
        pdfjs = module;
      }
      if (documentId !== state.documentId) {
        pdf = await pdfSession.open(`${sessionId}:${state.documentId}`, {
          url: `/document.pdf?sessionId=${encodeURIComponent(sessionId)}&documentId=${state.documentId}`, cMapUrl: '/vendor/cmaps/', cMapPacked: true,
          standardFontDataUrl: '/vendor/standard_fonts/', wasmUrl: '/vendor/wasm/', isEvalSupported: false }, options => pdfjs.getDocument(options));
        documentId = state.documentId;
      }
      const page = await pdf.getPage(state.page);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(innerWidth / base.width, innerHeight / base.height, 3840 / base.width, 2160 / base.height) });
      const back = document.createElement('canvas'); back.width = Math.ceil(viewport.width); back.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: back.getContext('2d'), viewport, background: 'white' }).promise;
      const latest = await (await fetch('/api/state')).json();
      if (latest.sessionId === state.sessionId && latest.revision === state.revision && renderingSize === sizeVersion) {
        visible.width = back.width; visible.height = back.height;
        visible.getContext('2d').drawImage(back, 0, 0); revision = state.revision;
        status('ready', state);
      }
      page.cleanup();
    }
  } catch (error) {
    console.error('vMix PDF Viewer:', error);
    if (state) status('error', state, String(error.message || error));
  }
  setTimeout(poll, report.status === 'error' ? 2000 : 200);
}
addEventListener('resize', () => { revision = -1; sizeVersion++; }); heartbeat(); poll();
