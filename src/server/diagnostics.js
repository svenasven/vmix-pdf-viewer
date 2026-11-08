import { isViewerInputTitle, viewerInputTitle } from './brand.js';

export function diagnose(vmix, state, clients, now = Date.now()) {
  const step = (status, text) => ({status,text});
  const checks={api:step('waiting','Подключите vMix через мастер настройки'),source:step('waiting','Источник ещё не выбран'),page:step('waiting','Ожидаем подключение источника')};
  const result=(code,status,title,message,action='setup')=>({code,status,title,message,action,checks,checkedAt:vmix.checkedAt||null});
  if(!vmix.enabled)return result('setup','waiting','vMix не настроен','Откройте мастер и выберите источник PDF.');
  if(!vmix.checkedAt)return result('checking','waiting','Проверяем vMix','Ожидаем ответ программы.','check');
  if(!vmix.connected){checks.api=step('error','vMix не отвечает');return result('offline','error','Нет связи с vMix','Запустите vMix. Проверьте включение Web / Web Controller и указанный там порт.','check')}
  checks.api=step('ready',`vMix ${vmix.version} отвечает`);
  if(!vmix.linked){checks.source=step('error','Связанный источник не найден');return result('missing','error','Источник PDF не найден','Возможно, открыт другой пресет. Выберите источник заново в мастере.');}
  const branded=(vmix.inputs||[]).filter(input=>isViewerInputTitle(input.title)&&/ @\d+$/.test(input.title));
  if(branded.length>1){checks.source=step('error','Несколько источников vMix PDF Viewer');return result('duplicate','error','Найдены лишние источники PDF','Оставьте один источник, подключённый через мастер. Лишние входы можно переименовать в vMix, затем повторить проверку.','check')}
  if(vmix.syncError){checks.source=step('error','Не удалось обновить источник');return result('sync_error','error','Источник не обновлён','Попробуйте восстановить подключение к выбранному источнику.','reconnect')}
  const source=(vmix.inputs||[]).find(input=>input.key===vmix.inputKey);
  const expected=[viewerInputTitle(vmix.viewerPort),viewerInputTitle(vmix.viewerPort,true)];
  if(!expected.includes(source?.title)){checks.source=step('error','Имя источника изменено');return result('renamed','error','Нужно обновить источник','Для работы команд требуется имя, назначенное приложением. Нажмите «Восстановить подключение».','reconnect')}
  checks.source=step('ready',`Источник №${source.number} найден`);
  if(!state.pages){checks.page=step('waiting','Документ не выбран');return result('empty','waiting','Добавьте PDF','Источник подключён. Выберите документ для показа.','none')}
  const live=clients.filter(client=>client.role!=='preview'&&client.inputKey===vmix.inputKey&&client.sessionId===state.sessionId&&now-client.lastSeen<5000);
  if(live.some(c=>c.status==='ready'&&c.documentId===state.documentId&&c.revision===state.revision&&c.page===state.page)){
    checks.page=step('ready',`Страница ${state.page} из ${state.pages} отображается`);return result('ready','ready','vMix: страница готова',`«${state.name}», страница ${state.page} из ${state.pages}.`,'none');
  }
  if(live.some(c=>c.status==='error'&&c.documentId===state.documentId&&c.revision===state.revision)){
    checks.page=step('error','Не удалось отрисовать страницу');return result('render_error','error','Ошибка страницы в vMix','Попробуйте восстановить подключение. Если ошибка повторяется, проверьте этот PDF в предпросмотре.','reconnect');
  }
  if(!live.length){checks.page=step('error','Источник не присылает подтверждение');return result('no_output','error','Нет подтверждения от источника','Источник найден, но страница не отвечает. Восстановите подключение к нему.','reconnect')}
  checks.page=step('waiting',`Ожидаем страницу ${state.page}`);return result('loading','waiting','vMix: подготовка страницы','Источник отвечает, но ещё не подтвердил текущую страницу.','check');
}
