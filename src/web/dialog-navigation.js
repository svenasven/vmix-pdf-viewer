const parents = new Map();
export function openDialog(id) {
  const target = document.getElementById(id);
  const current = document.querySelector('dialog[open]');
  if (current === target) return;
  parents.set(id,{parent:current?.id,opener:document.activeElement});
  current?.close();
  target.showModal();
}
export function backDialog(id) {
  const target = document.getElementById(id), entry = parents.get(id);
  target.close(); parents.delete(id);
  if (entry?.parent) document.getElementById(entry.parent).showModal();
  if (entry?.opener?.isConnected) entry.opener.focus();
}
document.querySelectorAll('[data-dialog-back]').forEach(button => {
  button.onclick = () => backDialog(button.closest('dialog').id);
});
