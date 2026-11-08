import { app, BrowserWindow, dialog, Menu, Tray, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync, readFileSync, writeFileSync, cpSync, renameSync } from 'node:fs';
import { fork } from 'node:child_process';
import { createWindowShell } from './window-shell.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
app.setName('vMix PDF Viewer');
// Стабильный путь сохраняет библиотеку и single-instance lock версий до 0.10.
app.setPath('userData', argument('profile-dir') ? path.resolve(argument('profile-dir')) : path.join(app.getPath('appData'), 'PDF Viewer'));
let serverWorker, mainWindow, windowShell, quitting=false;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.whenReady().then(async () => {
    const profile = app.getPath('userData'); mkdirSync(profile, { recursive: true });
    const dataDir = path.join(profile, 'library');
    const importDir = argument('import-library') || (app.isPackaged ? path.join(process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(app.getPath('exe')), 'data') : path.join(root, 'data'));
    if (!existsSync(dataDir) && existsSync(path.join(importDir, 'library.json'))) cpSync(importDir, dataDir, { recursive: true });
    serverWorker=fork(path.join(root,'src/main/server-worker.js'),[profile],{
      execPath:process.execPath,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},
      stdio:['ignore','pipe','pipe','ipc'],windowsHide:true,execArgv:[]
    });
    let workerError='';
    serverWorker.stdout.on('data',()=>{});
    serverWorker.stderr.on('data',chunk=>{workerError=(workerError+chunk.toString()).slice(-4000)});
    const port=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{serverWorker.kill();reject(Error('Сервер PDF не запустился за 30 секунд'))},30000);
      const fail=error=>{clearTimeout(timer);reject(error)};
      serverWorker.once('error',fail);
      serverWorker.once('exit',code=>fail(Error(`Сервер PDF завершился (${code}). ${workerError}`)));
      serverWorker.on('message',message=>{
        if(message?.type==='ready'){clearTimeout(timer);resolve(message.port)}
        if(message?.type==='error')fail(Error(message.message));
      });
    });
    serverWorker.on('exit',()=>{if(!quitting){dialog.showErrorBox('Сервер PDF остановлен','Сохранённая библиотека остаётся на месте. Перезапустите vMix PDF Viewer. '+workerError);app.quit()}});
    const origin = `http://127.0.0.1:${port}`;
    Menu.setApplicationMenu(null);
    mainWindow = new BrowserWindow({ width: 1380, height: 900, minWidth: 760, minHeight: 580,
      title: 'vMix PDF Viewer', frame: false, icon: path.join(root, 'assets/app.ico'), backgroundColor: '#111722', show: false,
      webPreferences: { preload: path.join(root,'src/main/preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } });
    windowShell = createWindowShell({app, window:mainWindow, Tray, Menu, icon:path.join(root,'assets/app.ico')});
    ipcMain.handle('desktop:hide', event => {
      if (event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || event.senderFrame.url !== origin + '/') return false;
      windowShell.hide(); return true;
    });
    mainWindow.webContents.session.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === 'clipboard-sanitized-write'));
    mainWindow.webContents.on('will-navigate', (event, url) => { if (!url.startsWith(origin + '/')) event.preventDefault(); });
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url !== origin + '/output') return { action: 'deny' };
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } } };
    });
    mainWindow.once('ready-to-show', () => mainWindow.show());
    await mainWindow.loadURL(origin + '/');
  }).catch(error => { dialog.showErrorBox('Не удалось запустить vMix PDF Viewer', error.message); app.quit(); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', event => {
    if(quitting)return;quitting=true;
    if(serverWorker?.connected){
      event.preventDefault();
      const timeout=setTimeout(()=>{serverWorker.kill();app.quit()},3000);
      serverWorker.once('exit',()=>{clearTimeout(timeout);app.quit()});
      serverWorker.send({type:'stop'});
    }
  });
}
