import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function start(cookie) {
 const document={cookie,documentElement:{},addEventListener(){}};
 const context=vm.createContext({document,localStorage:{getItem:()=>null}});
 for(const file of ['translations.js','i18n.js'])vm.runInContext(readFileSync(new URL('../src/web/'+file,import.meta.url),'utf8'),context);
 return context.pdfViewerI18n;
}
test('English: UI, diagnostics, errors and variable messages',()=>{
 const {translate:t,language}=start('vmix-pdf-viewer-language=en');
 assert.equal(language,'en');assert.equal(t('Настройки'),'Settings');
 assert.equal(t('В очереди: 12'),'In queue: 12');
 assert.equal(t('Источник №3 найден'),'Source #3 found');
 assert.equal(t('Выход 1: готов, страница 4'),'Output 1: ready, page 4');
 assert.equal(t('Повреждённый или защищённый PDF'),'Damaged or password-protected PDF');
 assert.equal(t('«Документы.pdf», страница 4 из 16.'),'“Документы.pdf”, page 4 of 16.');
 assert.equal(t('Документы.pdf'),'Документы.pdf');
});
test('Russian default and invalid preference preserve the original text',()=>{
 for(const value of ['', 'vmix-pdf-viewer-language=invalid']){
  const app=start(value);assert.equal(app.language,'ru');assert.equal(app.translate('Настройки'),'Настройки');
 }
});
