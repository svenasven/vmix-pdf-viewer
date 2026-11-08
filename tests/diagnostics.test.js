import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnose } from '../src/server/diagnostics.js';
import { VmixBridge } from '../src/server/vmix.js';
import { createApp } from '../src/server/server.js';
import { PDFDocument } from 'pdf-lib';
const key='0c5474d9-bff8-418e-afed-421d4bc19e13';
const vmix={enabled:true,checkedAt:10000,connected:true,linked:true,version:'29.0',inputKey:key,viewerPort:18767,inputs:[{key,number:3,title:'PDF Viewer @18767'}]};
const state={sessionId:'session',documentId:2,revision:5,page:3,pages:10,name:'Доклад.pdf'};
const client={...state,inputKey:key,role:'output',status:'ready',lastSeen:10000};
test('Диагностика отличает выбранный источник, старый кадр и потерю связи',()=>{
  const run=(v=vmix,s=state,clients=[client])=>diagnose(v,s,clients,10000).code;
  assert.equal(run(),'ready');
  for(const patch of [{role:'preview'},{inputKey:''},{inputKey:'other'},{sessionId:'old'},{lastSeen:4999}]) assert.equal(run(vmix,state,[{...client,...patch}]),'no_output');
  for(const patch of [{page:2},{revision:4},{documentId:1},{status:'loading'}]) assert.equal(run(vmix,state,[{...client,...patch}]),'loading');
  assert.equal(run(vmix,state,[{...client,status:'error'}]),'render_error');
  assert.equal(run({...vmix,enabled:false}),'setup');
  assert.equal(run({...vmix,checkedAt:null}),'checking');
  assert.equal(run({...vmix,connected:false}),'offline');
  assert.equal(run({...vmix,linked:false}),'missing');
  assert.equal(run({...vmix,syncError:true}),'sync_error');
  assert.equal(run({...vmix,inputs:[{...vmix.inputs[0],title:'Другой'}]}),'renamed');
  assert.equal(run({...vmix,inputs:[...vmix.inputs,{key:'extra',title:'PDF Viewer @18765'}]}),'duplicate');
  assert.equal(run(vmix,{...state,pages:0}),'empty');
});
test('Ошибка команды источнику сохраняет доступность API vMix',async()=>{
  const bridge=new VmixBridge({fetchImpl:async url=>new Response(url.searchParams.has('Function')?'error':`<vmix><version>29.0.0.49</version><inputs><input key="${key}" number="3" type="Browser" title="PDF Viewer @18767"/></inputs></vmix>`,{status:url.searchParams.has('Function')?500:200})});
  bridge.settings={enabled:true,apiPort:8088,inputKey:key};bridge.port=18767;
  const result=await bridge.refresh();
  assert.equal(result.connected,true);assert.equal(result.syncError,true);assert.ok(result.checkedAt);
});
test('Первое добавление ждёт CEF и повторяет навигацию до подтверждения, без бесконечных перезагрузок',async()=>{
  for (const mode of ['immediate','second','never']) {
    let added=false,navigations=0,waits=0;
    const bridge=new VmixBridge({wait:async()=>{waits++},fetchImpl:async url=>{
      const command=url.searchParams.get('Function');
      if(command==='AddInput')added=true;
      if(command==='BrowserNavigate')navigations++;
      return new Response(command?'OK':`<vmix><version>29.0.0.49</version><inputs>${added?`<input key="${key}" number="1" type="Browser" title="PDF Viewer"/>`:''}</inputs></vmix>`);
    }});
    bridge.port=18767;
    bridge.outputConfirmed=()=>mode==='immediate'||(mode==='second'&&navigations>=2);
    await bridge.connect({apiPort:8088});
    assert.equal(navigations,mode==='immediate'?1:mode==='second'?2:3);
    assert.equal(waits,mode==='immediate'?0:mode==='second'?3:8);
    const previous=waits;
    await bridge.connect({apiPort:8088,inputKey:key});
    assert.equal(waits,previous,'существующий источник не получает цикл первого добавления');
  }
});
test('API диагностики принимает подтверждение только выбранного источника',async()=>{
  const bridge={port:18767,settings:{inputKey:key,apiPort:8088},snapshot:()=>vmix,refresh:async()=>{},connect:async()=>{}};
  let time=10000;const server=createApp({vmix:bridge,now:()=>time});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const get=async route=>(await fetch(base+route)).json();
  try {
    const pdf=await PDFDocument.create();pdf.addPage();
    await fetch(base+'/api/document',{method:'POST',headers:{'Content-Type':'application/pdf'},body:await pdf.save()});
    const current=await get('/api/state');
    const send=inputKey=>fetch(base+'/api/outputs',{method:'POST',body:JSON.stringify({...current,id:'source',inputKey,status:'ready',error:'',userAgent:'Test'})});
    await send('');assert.equal((await get('/api/diagnostics')).code,'no_output');
    await send(key);assert.equal((await get('/api/diagnostics')).code,'ready');
    assert.equal((await fetch(base+'/api/vmix/check',{method:'POST'})).status,200);
    time+=5001;assert.equal((await get('/api/diagnostics')).code,'no_output');
    assert.equal((await fetch(base+'/diagnostics-ui.js')).status,200);
  }finally{await new Promise(resolve=>server.close(resolve))}
});
test('Поиск vMix на другом порту не наследует привязку старого подключения',async()=>{
  let inputs=[{key,type:'Browser',title:'PDF Viewer @18767',number:1}];
  const bridge={port:18767,settings:{enabled:true,inputKey:key,apiPort:8088},snapshot:()=>vmix,inspect:async()=>({version:'29.0',inputs})};
  const server=createApp({vmix:bridge});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const probe=async port=>(await fetch(base+'/api/vmix/probe?port='+port,{method:'POST'})).json();
  try{
    assert.equal((await probe(8088)).linked,true);
    assert.equal((await probe(8090)).linked,false);
    assert.equal((await probe(8090)).inputKey,null);
    inputs=[];assert.equal((await probe(8088)).linked,false);
  }finally{await new Promise(resolve=>server.close(resolve))}
});
