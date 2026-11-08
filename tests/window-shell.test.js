import test from 'node:test';import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createWindowShell } from '../src/main/window-shell.js';
test('Крестик скрывает окно, значок открывает его, выход завершает приложение',()=>{
 const app=new EventEmitter();let quit=0;app.quit=()=>{quit++;app.emit('before-quit')};
 const window=new EventEmitter();Object.assign(window,{visible:true,minimized:false,destroyed:false,isDestroyed(){return this.destroyed},isMinimized(){return this.minimized},restore(){this.minimized=false},setSkipTaskbar(v){this.skipped=v},show(){this.visible=true},hide(){this.visible=false},focus(){this.focused=true}});
 class Tray extends EventEmitter {constructor(icon){super();this.icon=icon}setToolTip(text){this.tooltip=text}setContextMenu(menu){this.menu=menu}isDestroyed(){return !!this.destroyed}destroy(){this.destroyed=true}}
 const shell=createWindowShell({app,window,Tray,Menu:{buildFromTemplate:items=>({items})},icon:'app.ico'});
 let prevented=false;window.emit('close',{preventDefault(){prevented=true}});
 assert.equal(prevented,true);assert.equal(window.visible,false);assert.equal(window.skipped,true);assert.equal(quit,0);
 shell.tray.emit('click');assert.equal(window.visible,true);assert.equal(window.skipped,false);
 shell.hide();window.minimized=true;shell.menu.items[0].click();assert.equal(window.minimized,false);assert.equal(window.visible,true);
 shell.hide();app.emit('second-instance');assert.equal(window.visible,true);
 shell.menu.items[2].click();assert.equal(quit,1);assert.equal(shell.tray.isDestroyed(),true);
 prevented=false;window.emit('close',{preventDefault(){prevented=true}});assert.equal(prevented,false);
});
