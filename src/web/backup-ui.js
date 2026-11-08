import { openDialog } from '/dialog-navigation.js';
const $ = id => document.getElementById(id);
let revision, file, busy=false;
$('backup-choose').onclick=()=>{if(!busy)$('backup-file').click()};
$('backup-open').onclick=()=>openDialog('backup-dialog');
$('backup-close').onclick=()=>{ if(!busy)$('backup-dialog').close(); };
$('backup-dialog').addEventListener('cancel',event=>{if(busy)event.preventDefault()});
$('backup-file').onchange=async event=>{
  file=event.target.files[0];$('backup-restore').disabled=true;$('backup-status').textContent='';
  if(!file)return;
  try{
    const response=await fetch('/api/library');if(!response.ok)throw Error();const library=await response.json();revision=library.revision;
    $('backup-summary').textContent=`${file.name}. ${library.documents.length?'Документы добавятся к текущей библиотеке; показ продолжится без изменений.':'Будут восстановлены библиотека, порядок, последняя страница и порт подключения vMix.'}`;
    $('backup-restore').disabled=false;
  }catch{$('backup-status').textContent='Нет связи с приложением. Повторите выбор файла.'}
};
$('backup-restore').onclick=async()=>{
 if(!file||busy)return;busy=true;$('backup-back').disabled=$('backup-choose').disabled=$('backup-file').disabled=$('backup-restore').disabled=$('backup-close').disabled=true;
 $('backup-status').textContent='Проверяем копию и восстанавливаем документы…';
 try{
  const response=await fetch(`/api/backup/restore?revision=${revision}`,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file});
  const result=await response.json();if(!response.ok)throw Error(result.error);
  $('backup-status').textContent=`Готово. ${result.merged?'Добавлено':'Восстановлено'} PDF: ${result.added}. ${result.warning||''}`;
  file=null;$('backup-file').value='';$('backup-summary').textContent='';
 }catch(error){$('backup-status').textContent=error.message||'Не удалось восстановить копию. Проверьте связь с приложением.';file=null;$('backup-file').value='';}
 finally{busy=false;$('backup-back').disabled=$('backup-choose').disabled=$('backup-file').disabled=$('backup-close').disabled=false;}
};
