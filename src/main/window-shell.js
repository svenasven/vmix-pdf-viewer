export function createWindowShell({ app, window, Tray, Menu, icon }) {
  let quitting = false;
  const tray = new Tray(icon);
  function show() {
    if (window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.setSkipTaskbar(false);
    window.show(); window.focus();
  }
  function hide() {
    if (window.isDestroyed()) return;
    window.hide(); window.setSkipTaskbar(true);
  }
  const menu = Menu.buildFromTemplate([
    { label: 'Открыть vMix PDF Viewer', click: show },
    { type: 'separator' },
    { label: 'Выйти', click: () => { quitting = true; app.quit(); } }
  ]);
  tray.setToolTip('vMix PDF Viewer — управление показом');
  tray.setContextMenu(menu);
  tray.on('click', show);
  tray.on('double-click', show);
  window.on('close', event => {
    if (quitting) return;
    event.preventDefault(); hide();
  });
  app.on('second-instance', show);
  app.on('activate', show);
  app.on('before-quit', () => { quitting = true; if (!tray.isDestroyed()) tray.destroy(); });
  return { show, hide, tray, menu };
}
