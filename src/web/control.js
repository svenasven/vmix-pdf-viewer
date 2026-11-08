import '/backup-ui.js';
import { renderDiagnostics, diagnosticsUnavailable } from '/diagnostics-ui.js';
import { updateThumbnails } from '/thumbnails.js';
import { openDialog } from '/dialog-navigation.js';
const $ = selector => document.querySelector(selector);
const error = $('#error');
if (window.pdfViewerDesktop) {
  document.documentElement.classList.add('desktop');
  $('#window-close').onclick = () => window.pdfViewerDesktop.hide();
}
const paths = {
  plus: '<path d="M10 4v12M4 10h12"/>',
  left: '<path d="m12 5-5 5 5 5"/>', right: '<path d="m8 5 5 5-5 5"/>',
  first: '<path d="M5 5v10m10-10-5 5 5 5"/>', last: '<path d="M15 5v10M5 5l5 5-5 5"/>',
  up: '<path d="m5 12 5-5 5 5"/>', down: '<path d="m5 8 5 5 5-5"/>',
  close: '<path d="m5 5 10 10M15 5 5 15"/>',
  trash: '<path d="M3 5h14M8 5V3h4v2M5 5l1 13h8l1-13M8 8v7m4-7v7"/>',
  document: '<path d="M5 2h7l4 4v12H5zM12 2v5h4M8 11h5M8 14h5"/>',
  external: '<path d="M11 3h6v6m0-6-9 9M7 3H3v14h14v-4"/>',
  layers: '<path d="m10 2 8 4-8 4-8-4 8-4Zm-8 8 8 4 8-4m-16 4 8 4 8-4"/>',
  grip: '<circle cx="7" cy="5" r=".7"/><circle cx="13" cy="5" r=".7"/><circle cx="7" cy="10" r=".7"/><circle cx="13" cy="10" r=".7"/><circle cx="7" cy="15" r=".7"/><circle cx="13" cy="15" r=".7"/>',
  settings: '<path d="m8 2-.6 2.1-1.8 1L3.5 5 2 7.5 3.6 9v2L2 12.5 3.5 15l2.1-.1 1.8 1L8 18h4l.6-2.1 1.8-1 2.1.1 1.5-2.5-1.6-1.5V9L18 7.5 16.5 5l-2.1.1-1.8-1L12 2H8Z"/><circle cx="10" cy="10" r="3"/>'
};
function icon(name) { return `<svg viewBox="0 0 20 20" aria-hidden="true">${paths[name] || ''}</svg>`; }
document.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML = icon(node.dataset.icon); });
let librarySnapshot = null, librarySignature = '', draggedId = null, uploading = false, latestState = null;
async function request(url, options) {
  const res = await fetch(url, options); const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Не удалось выполнить действие');
  return data;
}
function renderState(state) {
  latestState = state; updateThumbnails(state, async page => { try { renderState(await request(`/api/page?action=goto&page=${page}`, { method: 'POST' })); error.textContent = ''; } catch (e) { error.textContent = e.message; } });
  const hasDocument = state.pages > 0;
  $('#active-name').textContent = hasDocument ? state.name : 'Выберите документ';
  $('#active-name').title = hasDocument ? state.name : '';
  $('#page-badge').textContent = hasDocument ? `${state.page} / ${state.pages}` : '—';
  $('#state').textContent = hasDocument ? `${state.pages} стр. в документе` : 'Откройте PDF для показа';
  $('#empty-stage').hidden = hasDocument;
  $('#preview-tag').hidden = !hasDocument;
  $('#page-total').textContent = `из ${state.pages}`;
  $('#page').disabled = $('#go').disabled = !hasDocument;
  $('#page').max = Math.max(1, state.pages);
  if (document.activeElement !== $('#page')) $('#page').value = state.page || 1;
  document.querySelectorAll('[data-action]').forEach(button => {
    const backwards = ['first', 'previous'].includes(button.dataset.action);
    button.disabled = !hasDocument || (backwards ? state.page <= 1 : state.page >= state.pages);
  });
}
async function command(action) {
  try {
    renderState(await request(`/api/page?action=${action}&page=${encodeURIComponent($('#page').value)}`, { method: 'POST' }));
    error.textContent = '';
  } catch (e) { error.textContent = e.message; }
}
document.querySelectorAll('[data-action]').forEach(button => button.onclick = () => command(button.dataset.action));
$('#page-form').onsubmit = event => { event.preventDefault(); command('goto'); };
$('#empty-add').onclick = () => $('#file').click();
async function libraryAction(url, body) {
  try {
    const result = await request(url, { method: 'POST', ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    if (result.sessionId) renderState(result);
    error.textContent = ''; renderLibrary(await request('/api/library'));
  } catch (e) { error.textContent = e.message; librarySignature = ''; }
}
async function moveDocument(id, to) {
  if (!librarySnapshot || uploading) return;
  const ids = librarySnapshot.documents.map(doc => doc.id), from = ids.indexOf(id);
  if (from < 0 || to < 0 || to >= ids.length || from === to) return;
  ids.splice(from, 1); ids.splice(to, 0, id);
  await libraryAction('/api/library/order', { ids, revision: librarySnapshot.revision });
}
let deletion = null;
function confirmDeletion(doc) {
  if (doc.id === librarySnapshot.activeId) return;
  deletion = { id: doc.id, revision: librarySnapshot.revision };
  $('#delete-name').textContent = doc.name;
  $('#delete-effect').textContent = 'Текущий показ продолжится без изменений.';
  $('#delete-dialog').showModal();
}
$('#delete-cancel').onclick = () => $('#delete-dialog').close();
$('#delete-dialog').addEventListener('close', () => { deletion = null; });
$('#delete-confirm').onclick = async () => {
  if (!deletion) return;
  const target = deletion, button = $('#delete-confirm'); button.disabled = true;
  try {
    renderState(await request(`/api/library/document?id=${encodeURIComponent(target.id)}&revision=${target.revision}`, { method: 'DELETE' }));
    error.textContent = ''; $('#delete-dialog').close();
    renderLibrary(await request('/api/library'));
  } catch (e) { error.textContent = e.message; $('#delete-dialog').close(); librarySignature = ''; }
  finally { button.disabled = false; }
};
function renderLibrary(library) {
  librarySnapshot = library;
  const signature = JSON.stringify([library, uploading]);
  if (signature === librarySignature || draggedId) return;
  librarySignature = signature;
  const focusedKey = document.activeElement?.dataset.focusKey;
  const list = $('#documents'); list.replaceChildren();
  $('#document-count').textContent = library.documents.length ? `В очереди: ${library.documents.length}` : 'Ваша очередь показа';
  if (!library.documents.length) {
    const empty = document.createElement('li'); empty.className = 'empty-library';
    empty.innerHTML = icon('layers'); const text = document.createElement('span'); text.textContent = 'Добавьте документы для вашего показа'; empty.append(text); list.append(empty);
  }
  library.documents.forEach((doc, index) => {
    const selected = doc.id === library.activeId;
    const row = document.createElement('li'); row.className = `document-row${selected ? ' active-document' : ''}`; row.draggable = !uploading; row.dataset.documentId = doc.id;
    if (selected) row.setAttribute('aria-current', 'true');
    const number = document.createElement('span'); number.className = 'document-number'; number.textContent = String(index + 1).padStart(2, '0'); row.append(number);
    const info = document.createElement('div'); info.className = 'document-info';
    const title = document.createElement('span'); title.className = 'document-name'; title.textContent = doc.name;
    const meta = document.createElement('div'); meta.className = 'document-meta';
    const pages = document.createElement('span'); pages.textContent = `${doc.pages} стр.`; meta.append(pages);
    if (selected) { const badge = document.createElement('span'); badge.className = 'selected-label'; badge.textContent = 'Выбран'; meta.append(badge); }
    info.append(title, meta); row.append(info);
    const actions = document.createElement('div'); actions.className = 'document-actions';
    const moves = document.createElement('div'); moves.className = 'move-controls';
    for (const [name, label, disabled, target] of [['up', 'Поднять', index === 0, index - 1], ['down', 'Опустить', index === library.documents.length - 1, index + 1]]) {
      const b = document.createElement('button'); b.className = 'icon-button'; b.innerHTML = icon(name);
      b.setAttribute('aria-label', `${label} ${doc.name}`); b.title = label; b.disabled = disabled || uploading; b.dataset.focusKey = `${doc.id}:${name}`;
      b.onclick = () => moveDocument(doc.id, target); moves.append(b);
    }
    const show = document.createElement('button'); show.className = 'show-document'; show.textContent = selected ? 'С начала' : 'Показать'; show.disabled = uploading;
    show.setAttribute('aria-label', `Показать ${doc.name} с первой страницы`);
    show.onclick = () => libraryAction(`/api/library/select?id=${encodeURIComponent(doc.id)}`);
    const remove = document.createElement('button'); remove.className = 'icon-button delete-document'; remove.innerHTML = icon('trash');
    remove.setAttribute('aria-label', `Удалить ${doc.name}`);
    remove.title = selected ? 'Сейчас показывается — сначала переключитесь на другой PDF' : 'Удалить PDF';
    remove.disabled = uploading || selected;
    remove.dataset.focusKey = `${doc.id}:delete`; remove.onclick = () => confirmDeletion(doc);
    moves.append(remove);
    actions.append(moves, show); row.append(actions);
    row.ondragstart = event => { if (uploading) { event.preventDefault(); return; } draggedId = doc.id; event.dataTransfer.setData('text/plain', doc.id); event.dataTransfer.effectAllowed = 'move'; row.classList.add('dragging'); };
    row.ondragover = event => { if (draggedId && !uploading) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; row.classList.add('drop-target'); } };
    row.ondragleave = () => row.classList.remove('drop-target');
    row.ondrop = event => { event.preventDefault(); const id = draggedId; draggedId = null; row.classList.remove('drop-target'); if (id) moveDocument(id, index); };
    row.ondragend = () => { draggedId = null; document.querySelectorAll('.dragging,.drop-target').forEach(node => node.classList.remove('dragging', 'drop-target')); };
    list.append(row);
  });
  if (focusedKey) [...list.querySelectorAll('[data-focus-key]')].find(button => button.dataset.focusKey === focusedKey)?.focus({ preventScroll: true });
  const index = library.documents.findIndex(doc => doc.id === library.activeId);
  $('#previous-document').disabled = uploading || index <= 0;
  $('#next-document').disabled = uploading || index < 0 || index >= library.documents.length - 1;
}
$('#previous-document').onclick = () => libraryAction('/api/library/navigate?action=previous');
$('#next-document').onclick = () => libraryAction('/api/library/navigate?action=next');
$('#file').onchange = async event => {
  const files = [...event.target.files]; if (!files.length || uploading) return;
  const failures = []; let added = 0;
  uploading = true; event.target.disabled = true; if (librarySnapshot) renderLibrary(librarySnapshot);
  try {
    for (const [index, file] of files.entries()) {
      $('#upload-status').textContent = `Добавление ${index + 1} из ${files.length}`;
      try {
        if (file.size > 50 * 1024 * 1024) throw new Error('Файл больше 50 МиБ');
        const state = await request(`/api/documents?name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: file });
        renderState(state); added++;
      } catch (e) { failures.push(`${file.name}: ${e.message}`); }
    }
  } finally {
    uploading = false; event.target.disabled = false; event.target.value = '';
    error.textContent = failures.join('; '); $('#upload-status').textContent = `Добавлено: ${added} из ${files.length}`; librarySignature = '';
  }
};
function renderOutputs(clients) {
  const sources = clients.filter(client => client.role !== 'preview');
  const list = $('#outputs'); list.replaceChildren();
  const labels = sources.length ? sources.map((client, index) => `Выход ${index + 1}: ${!client.online ? 'нет связи' : client.status === 'error' ? 'не удалось показать документ' : client.current ? `готов, страница ${client.page}` : 'ожидание страницы'}`) : ['Внешние выходы пока не подключены.'];
  for (const text of labels) { const item = document.createElement('li'); item.textContent = text; list.append(item); }
}
$('#settings-open').onclick = () => { openDialog('settings'); loadConnection(); };
$('#settings-close').onclick = () => $('#settings').close();
$('#settings').addEventListener('click', event => { if (event.target === $('#settings')) { const r = event.target.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) event.target.close(); } });
async function copyAddress(text, button) {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else {
      const field = document.createElement('textarea'); field.value = text; field.style.position = 'fixed'; field.style.opacity = '0';
      document.body.append(field); field.select(); const copied = document.execCommand('copy'); field.remove();
      if (!copied) throw new Error('Copy unavailable');
    }
    button.textContent = 'Скопировано';
  } catch { button.textContent = 'Выделите адрес'; }
}
$('#copy-url').onclick = () => copyAddress(location.origin + '/output', $('#copy-url'));
$('#output-url').textContent = location.origin + '/output';
async function loadConnection() {
  const container = $('#lan-addresses');
  try {
    const info = await request('/api/connection'); container.replaceChildren();
    if (!info.lanUrls.length) { const text = document.createElement('p'); text.textContent = 'Подключитесь к Wi-Fi или проводной сети'; container.append(text); }
    for (const url of info.lanUrls) {
      const row = document.createElement('div'); row.className = 'address-field';
      const link = document.createElement('code'); link.textContent = url;
      const button = document.createElement('button'); button.className = 'button secondary'; button.textContent = 'Копировать'; button.onclick = () => copyAddress(url, button);
      row.append(link, button); container.append(row);
    }
  } catch { container.textContent = 'Не удалось определить адрес сети'; }
}
let vmixInfo = null, vmixWorking = false;
function renderVmix(info) {
  vmixInfo = info;
  $('#vmix-status').textContent = info.connected ? `vMix ${info.version} · ${info.message}` : info.message;
  $('#vmix-source-controls').hidden = !info.connected;
  const select = $('#vmix-input'); select.replaceChildren();
  const add = document.createElement('option'); add.value = ''; add.textContent = 'Добавить новый источник PDF Viewer'; select.append(add);
  for (const input of info.inputs || []) {
    const option = document.createElement('option'); option.value = input.key; option.textContent = `${input.number}. ${input.title}`; select.append(option);
  }
  select.value = info.inputKey || '';
  if (!select.value) select.value = '';
  updateVmixTests();
}
function updateVmixTests() {
  $('#vmix-test-next').disabled = vmixWorking || !vmixInfo?.connected || !vmixInfo?.linked || !latestState?.pages || latestState.page >= latestState.pages;
  $('#vmix-test-previous').disabled = vmixWorking || !vmixInfo?.connected || !vmixInfo?.linked || !latestState?.pages || latestState.page <= 1;
}
async function vmixOperation(action, callback) {
  if (vmixWorking) return;
  vmixWorking = true;
  $('#vmix-probe').disabled = $('#vmix-connect').disabled = true; updateVmixTests();
  try { await callback(); }
  catch (e) {
    if (action !== 'test') renderVmix({ ...vmixInfo, connected:false, linked:false, inputs:[], message:e.message });
    else { $('#vmix-status').textContent = e.message; $('#vmix-test-status').textContent = e.message; }
  }
  finally { vmixWorking = false; $('#vmix-probe').disabled = $('#vmix-connect').disabled = false; updateVmixTests(); }
}
$('#vmix-open').onclick = async () => {
  openDialog('vmix-setup');
  $('#vmix-test-status').textContent = '';
  await vmixOperation('load', async () => {
    const info = await request('/api/vmix'); $('#vmix-port').value = info.apiPort; renderVmix(info);
    const data = await request('/api/vmix/commands'), list = $('#vmix-commands'); list.replaceChildren();
    for (const command of data.commands) {
      const row = document.createElement('div'); row.className = 'vmix-command';
      const name = document.createElement('span'); name.textContent = command.title;
      const button = document.createElement('button'); button.className = 'button secondary'; button.textContent = 'Копировать имя';
      button.setAttribute('aria-label', `Копировать имя: ${command.title}`); button.onclick = () => copyAddress(command.id, button);
      const download = document.createElement('a'); download.className = 'button secondary'; download.textContent = 'Сохранить файл';
      download.href = '/api/vmix/script?id=' + command.id; download.download = command.id + '.txt';
      row.append(name, download, button); list.append(row);
    }
    if (!info.connected) {
      try { renderVmix(await request(`/api/vmix/probe?port=${encodeURIComponent($('#vmix-port').value)}`, { method: 'POST' })); }
      catch (e) { renderVmix({ ...info, connected:false, linked:false, inputs:[], message:e.message }); }
    }
  });
};
$('#vmix-close').onclick = () => $('#vmix-setup').close();
$('#vmix-port').oninput = () => renderVmix({ ...vmixInfo, connected:false, linked:false, inputs:[], message:'Нажмите «Найти vMix», чтобы проверить этот порт.' });
$('#vmix-probe').onclick = () => vmixOperation('probe', async () => {
  $('#vmix-status').textContent = 'Ищем vMix…';
  renderVmix(await request(`/api/vmix/probe?port=${encodeURIComponent($('#vmix-port').value)}`, { method: 'POST' }));
});
$('#vmix-connect').onclick = () => vmixOperation('connect', async () => {
  $('#vmix-status').textContent = 'Подключаем источник…';
  renderVmix(await request(`/api/vmix/connect?port=${encodeURIComponent($('#vmix-port').value)}&input=${encodeURIComponent($('#vmix-input').value)}`, { method: 'POST' }));
});
async function testVmixCommand(id) {
  await vmixOperation('test', async () => {
    const before = latestState;
    $('#vmix-test-status').textContent = 'Отправляем команду через vMix…';
    await request(`/api/vmix/test?command=${id}`, { method: 'POST' });
    const targetPage = before.page + (id === 'PDF_Next' ? 1 : -1);
    for (let attempt = 0; attempt < 20; attempt++) {
      const state = await request('/api/state'); renderState(state);
      if (state.activeId === before.activeId && state.page === targetPage) {
        $('#vmix-test-status').textContent = `Команда vMix выполнена: страница ${state.page} из ${state.pages}.`; return;
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    $('#vmix-test-status').textContent = 'Страница не изменилась. Проверьте поддержку Scripting и журнал Settings → Scripting в vMix.';
  });
}
$('#vmix-test-next').onclick = () => testVmixCommand('PDF_Next');
$('#vmix-test-previous').onclick = () => testVmixCommand('PDF_Previous');
async function poll() {
  try {
    const [state, library, outputs, diagnostics] = await Promise.all([request('/api/state'), request('/api/library'), request('/api/outputs'), request('/api/diagnostics')]);
    renderDiagnostics(diagnostics);
    renderState(state); renderLibrary(library); renderOutputs(outputs.clients); updateVmixTests();
  } catch {
    diagnosticsUnavailable();
    librarySignature = '';
    $('#state').textContent = 'Проверьте, запущено ли приложение';
    document.querySelectorAll('[data-action],#previous-document,#next-document,#page,#go').forEach(button => { button.disabled = true; });
  }
  setTimeout(poll, 400);
}
poll();

