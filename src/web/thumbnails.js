import '/compat.js';
import { PdfSession } from '/pdf-session.js';
const session = new PdfSession();
const panel = document.querySelector('#thumbnail-panel'), list = document.querySelector('#thumbnails');
let state, selectPage, key = '', generation = 0, running = false, shown = 0, more;
let wanted = new Set(), observer;
const buttons = new Map();
let pdfjs;
function appendPages() {
  more?.remove();
  const end = Math.min(state.pages, shown + 80);
  for (let page = shown + 1; page <= end; page++) {
    const button = document.createElement('button'); button.className = 'thumbnail'; button.type = 'button';
    button.dataset.page = page; button.setAttribute('aria-label', `Показать страницу ${page}`);
    const sheet = document.createElement('span'); sheet.className = 'thumbnail-sheet'; sheet.textContent = '…';
    const label = document.createElement('span'); label.textContent = page;
    button.append(sheet, label); button.onclick = () => selectPage(page);
    buttons.set(page, button); list.append(button); observer.observe(button);
  }
  shown = end;
  if (shown < state.pages) {
    more = document.createElement('button'); more.className = 'button secondary thumbnail-more'; more.textContent = 'Ещё страницы';
    more.onclick = () => { appendPages(); highlight(); }; list.append(more);
  }
}
function highlight() {
  for (const [page, button] of buttons) {
    if (page === state.page) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  }
}
async function drain() {
  if (running) return;
  running = true;
  try {
    while (true) {
      const version = generation, snapshot = state;
      if (!snapshot?.pages) { await session.reset(); break; }
      const pageNumber = [...wanted].find(page => buttons.has(page) && !buttons.get(page).dataset.done);
      if (!pageNumber) break;
      wanted.delete(pageNumber);
      try {
        if (!pdfjs) {
          pdfjs = await import('/vendor/legacy/build/pdf.mjs'); pdfjs.GlobalWorkerOptions.workerSrc = '/pdf-worker.js';
        }
        const pdf = await session.open(`${snapshot.sessionId}:${snapshot.documentId}`, {
          url: `/document.pdf?sessionId=${encodeURIComponent(snapshot.sessionId)}&documentId=${snapshot.documentId}`,
          cMapUrl: '/vendor/cmaps/', cMapPacked: true, standardFontDataUrl: '/vendor/standard_fonts/', wasmUrl: '/vendor/wasm/', isEvalSupported: false
        }, options => pdfjs.getDocument(options));
        if (version !== generation) continue;
        const page = await pdf.getPage(pageNumber), base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(200 / base.width, 130 / base.height) });
        const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport, background: 'white' }).promise;
        page.cleanup();
        if (version !== generation) continue;
        const button = buttons.get(pageNumber); button.querySelector('.thumbnail-sheet').replaceChildren(canvas); button.dataset.done = 'true';
      } catch {
        if (version === generation) {
          const button = buttons.get(pageNumber); button.querySelector('.thumbnail-sheet').textContent = 'Нет превью'; button.dataset.done = 'error';
        }
      }
    }
  } finally { running = false; }
}
export function updateThumbnails(next, onSelect) {
  selectPage = onSelect; state = next;
  const nextKey = `${next.sessionId}:${next.documentId}`;
  panel.hidden = !next.pages;
  if (nextKey !== key) {
    key = nextKey; generation++; observer?.disconnect(); wanted = new Set(); buttons.clear(); list.replaceChildren(); shown = 0; more = null;
    observer = new IntersectionObserver(entries => {
      for (const entry of entries) { const page = Number(entry.target.dataset.page); if (entry.isIntersecting) wanted.add(page); else wanted.delete(page); }
      drain();
    }, { root: list, rootMargin: '120px' });
    if (next.pages) appendPages(); else drain();
    list.scrollLeft = 0;
  }
  highlight();
}
