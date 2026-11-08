import path from 'node:path';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { createApp } from '../server/server.js';
import { listenAvailable } from '../server/network.js';
import { VmixBridge } from '../server/vmix.js';

// Node-only isolate: HTTP и Buffer не создаются в browser isolate Electron.
const profile = process.argv[2];
let server, bridge, stopping=false;
async function stop() {
  if(stopping)return;stopping=true;bridge?.stop();
  server?.closeAllConnections();
  if(server?.listening)await new Promise(resolve=>server.close(resolve));
  process.exit(0);
}
process.on('message',message=>{if(message?.type==='stop')stop()});
process.on('disconnect',stop);
try {
  let startPort=18765;
  try {const saved=JSON.parse(readFileSync(path.join(profile,'server.json'),'utf8'));if(Number.isInteger(saved.port)&&saved.port>1023&&saved.port<65536)startPort=saved.port;}catch{}
  bridge=new VmixBridge({profileDir:profile});
  server=createApp({dataDir:path.join(profile,'library'),vmix:bridge});
  const port=await listenAvailable(server,{startPort});
  writeFileSync(path.join(profile,'server.json'),JSON.stringify({port}));
  const portFile=path.join(profile,'server-port.txt');writeFileSync(portFile+'.tmp',String(port));renameSync(portFile+'.tmp',portFile);
  bridge.start(port);process.send?.({type:'ready',port,pid:process.pid,versions:process.versions});
}catch(error){process.send?.({type:'error',message:error.message});await stop()}
