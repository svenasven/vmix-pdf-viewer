import { openDialog } from '/dialog-navigation.js';
const $ = selector => document.querySelector(selector);
let busy = false;
export function renderDiagnostics(value) {
  $('#connection-text').textContent = value.title;
  $('#connection').dataset.status = value.status;
  $('#connection').title = 'Открыть диагностику vMix';
  $('#connection').setAttribute('aria-label',`Диагностика vMix: ${value.title}`);
  $('#diagnostics-check').disabled = busy || value.code === 'app_offline';
  $('#diagnostics-title').textContent = value.title;
  $('#diagnostics-message').textContent = value.message;
  for (const key of ['api','source','page']) {
    const row = $(`#diagnostics-${key}`);
    row.dataset.status = value.checks[key].status;
    row.querySelector('span:last-child').textContent = value.checks[key].text;
  }
  $('#diagnostics-time').textContent = value.checkedAt ? `Проверено: ${new Date(value.checkedAt).toLocaleTimeString('ru-RU')}` : 'Подключение ещё не проверялось';
  $('#diagnostics-reconnect').hidden = value.action !== 'reconnect';
  $('#diagnostics-setup').hidden = value.action !== 'setup';
}
export function diagnosticsUnavailable() {
  const waiting = {status:'waiting',text:'Нет актуальных данных — связь с приложением прервана'};
  renderDiagnostics({code:'app_offline',status:'error',title:'Нет связи с приложением',message:'Проверьте, запущен ли vMix PDF Viewer. После восстановления связи проверка продолжится автоматически.',action:'none',checks:{api:waiting,source:waiting,page:waiting},checkedAt:null});
}
function open() { $('#diagnostics-error').textContent=''; openDialog('diagnostics-dialog'); }
$('#connection').onclick = open;
$('#diagnostics-open').onclick = open;
$('#diagnostics-close').onclick = () => $('#diagnostics-dialog').close();
$('#diagnostics-setup').onclick = () => $('#vmix-open').click();
async function run(action) {
  if (busy) return;
  busy = true;
  const buttons = [...$('#diagnostics-dialog').querySelectorAll('.dialog-actions button')];
  buttons.forEach(button => button.disabled = true);
  $('#diagnostics-error').textContent = '';
  try {
    const response = await fetch(`/api/vmix/${action}`,{method:'POST'});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Не удалось выполнить проверку');
    renderDiagnostics(data);
  } catch(error) { $('#diagnostics-error').textContent = error.message; }
  finally { busy = false; buttons.forEach(button => button.disabled = false); }
}
$('#diagnostics-check').onclick = () => run('check');
$('#diagnostics-reconnect').onclick = () => run('reconnect');
