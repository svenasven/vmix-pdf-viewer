import test from 'node:test';import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';import {createApp} from '../src/server/server.js';
import {gzipSync,gunzipSync} from 'node:zlib';
test('Копия: точное восстановление, безопасное добавление и отклонение повреждений',async()=>{
 const servers=[];async function start(){const server=createApp();servers.push(server);await new Promise(r=>server.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${server.address().port}`}
 const get=async(base,route)=>(await fetch(base+route)).json();
 const restore=(base,bytes,rev)=>fetch(base+'/api/backup/restore?revision='+rev,{method:'POST',body:bytes});
 try{
  const a=await start(),b=await start();const pdf=await PDFDocument.create();pdf.addPage();pdf.addPage();const bytes=await pdf.save();
  for(const name of ['Первый.pdf','Второй.pdf'])await fetch(a+'/api/documents?name='+encodeURIComponent(name),{method:'POST',headers:{'Content-Type':'application/pdf'},body:bytes});
  const initial=await get(a,'/api/library');const ids=initial.documents.map(d=>d.id).reverse();
  await fetch(a+'/api/library/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids,revision:initial.revision})});
  await fetch(a+'/api/library/select?id='+ids[0],{method:'POST'});await fetch(a+'/api/page?action=next',{method:'POST'});
  const archive=Buffer.from(await(await fetch(a+'/api/backup')).arrayBuffer());
  assert.equal((await restore(b,archive,0)).status,200);const restored=await get(b,'/api/state');assert.equal(restored.page,2);assert.equal(restored.name,'Второй.pdf');
  assert.deepEqual((await get(b,'/api/library')).documents.map(d=>d.name),['Второй.pdf','Первый.pdf']);
  assert.deepEqual(Buffer.from(await(await fetch(b+'/document.pdf')).arrayBuffer()),Buffer.from(bytes));
  const before=await get(b,'/api/state'),library=await get(b,'/api/library');
  assert.equal((await restore(b,archive,library.revision-1)).status,409);
  assert.equal((await restore(b,archive.subarray(0,archive.length-8),library.revision)).status,422);
  const lines=gunzipSync(archive).toString().trim().split('\n').map(JSON.parse);lines[1].sha256='bad';
  assert.equal((await restore(b,gzipSync(lines.map(x=>JSON.stringify(x)).join('\n')+'\n'),library.revision)).status,422);
  assert.deepEqual(await get(b,'/api/library'),library);assert.deepEqual(await get(b,'/api/state'),before);
  const result=await(await restore(b,archive,library.revision)).json();assert.equal(result.added,2);assert.equal(result.merged,true);
  assert.deepEqual(await get(b,'/api/state'),before);assert.equal((await get(b,'/api/library')).documents.length,4);
 }finally{await Promise.all(servers.map(s=>new Promise(r=>s.close(r))))}
});
