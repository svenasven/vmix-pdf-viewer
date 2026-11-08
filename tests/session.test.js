import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { createApp } from '../src/server/server.js';
test('Сеанс: страница и порядок после перезапуска; повреждённая запись безопасно сбрасывается', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'viewer-session-')); let server, base;
  const start = async () => { server = createApp({dataDir:dir}); await new Promise(r=>server.listen(0,'127.0.0.1',r)); base=`http://127.0.0.1:${server.address().port}`; };
  const close = async () => { await new Promise(r=>server.close(r)); server=null; };
  const get = async route=>(await fetch(base+route)).json();
  try {
    await start(); const pdf=await PDFDocument.create(); for(let i=0;i<3;i++)pdf.addPage(); const bytes=await pdf.save();
    for(const name of ['a.pdf','b.pdf']) await fetch(base+'/api/documents?name='+name,{method:'POST',headers:{'Content-Type':'application/pdf'},body:bytes});
    const library=await get('/api/library'); const ids=library.documents.map(d=>d.id).reverse();
    await fetch(base+'/api/library/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids,revision:library.revision})});
    await fetch(base+'/api/library/select?id='+ids[0],{method:'POST'}); await fetch(base+'/api/page?action=goto&page=3',{method:'POST'});
    const old=await get('/api/state');await close();await start();
    const restored=await get('/api/state');assert.equal(restored.activeId,ids[0]);assert.equal(restored.page,3);assert.notEqual(restored.sessionId,old.sessionId);
    assert.deepEqual((await get('/api/library')).documents.map(d=>d.id),ids);
    await close();await writeFile(path.join(dir,'session.json'),JSON.stringify({activeId:ids[0],page:999}));await start();assert.equal((await get('/api/state')).page,1);
  } finally {if(server)await close();await rm(dir,{recursive:true,force:true});}
});
