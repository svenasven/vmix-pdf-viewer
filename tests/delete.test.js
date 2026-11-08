import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { createApp } from '../src/server/server.js';
test('Изменение очереди не меняет кадр; активный PDF защищён', async () => {
 const dir=await mkdtemp(path.join(os.tmpdir(),'viewer-protect-'));let server,base;
 const start=async()=>{server=createApp({dataDir:dir});await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`};
 const get=async route=>(await fetch(base+route)).json();
 const post=(route,body)=>fetch(base+route,{method:'POST',...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
 const remove=(id,revision)=>fetch(`${base}/api/library/document?id=${id}&revision=${revision}`,{method:'DELETE'});
 try{
  await start();const pdf=await PDFDocument.create();pdf.addPage();pdf.addPage();const bytes=await pdf.save();
  for(const name of ['A.pdf','B.pdf','C.pdf']) await fetch(base+'/api/documents?name='+name,{method:'POST',headers:{'Content-Type':'application/pdf'},body:bytes});
  const initial=await get('/api/library');const [a,b,c]=initial.documents.map(d=>d.id);
  await post('/api/page?action=next');const frame=await get('/api/state');const content=Buffer.from(await(await fetch(base+'/document.pdf')).arrayBuffer());
  assert.equal((await remove(a,initial.revision)).status,409);
  assert.deepEqual(await get('/api/state'),frame);assert.deepEqual(await get('/api/library'),initial);
  assert.equal((await post('/api/library/order',{ids:[c,b,a],revision:initial.revision})).status,200);
  assert.equal((await remove(b,(await get('/api/library')).revision)).status,200);
  assert.deepEqual(await get('/api/state'),frame);assert.deepEqual(Buffer.from(await(await fetch(base+'/document.pdf')).arrayBuffer()),content);
  assert.equal((await readdir(dir)).includes(a+'.pdf'),true);assert.equal((await readdir(dir)).includes(b+'.pdf'),false);
  const pending=await get('/api/library');await post('/api/library/select?id='+c);
  assert.equal((await remove(c,pending.revision)).status,409);
  assert.equal((await remove(c,(await get('/api/library')).revision)).status,409);
  assert.equal((await remove(a,(await get('/api/library')).revision)).status,200);
  assert.equal((await remove(c,(await get('/api/library')).revision)).status,409);
  await new Promise(r=>server.close(r));server=null;await start();assert.equal((await get('/api/state')).activeId,c);
 }finally{if(server)await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true})}
});
