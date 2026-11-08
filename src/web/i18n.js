(() => {
  const key = 'vmix-pdf-viewer-language';
  let language;
  try { language = document.cookie.split('; ').find(s => s.startsWith(key + '='))?.slice(key.length + 1); } catch {}
  if (!['ru', 'en'].includes(language)) { try { language = localStorage.getItem(key); } catch {} }
  if (!['ru', 'en'].includes(language)) language = 'ru';
  document.documentElement.lang = language;
  const dictionary = globalThis.pdfViewerEnglish;
  function translate(text) {
    if (language !== 'en' || !/[а-яё]/i.test(text)) return text;
    if (Object.hasOwn(dictionary, text)) return dictionary[text];
    const patterns = [
      [/^В очереди: (\d+)$/, (_, n) => `In queue: ${n}`],
      [/^(\d+) стр\. в документе$/, (_, n) => `${n} pages in document`],
      [/^(\d+) стр\.$/, (_, n) => `${n} pages`],
      [/^из (\d+)$/, (_, n) => `of ${n}`],
      [/^Показать страницу (\d+)$/, (_, n) => `Show page ${n}`],
      [/^Показать (.+) с первой страницы$/, (_, name) => `Show ${name} from the first page`],
      [/^Удалить (.+)$/, (_, name) => `Delete ${name}`],
      [/^Поднять (.+)$/, (_, name) => `Move up ${name}`],
      [/^Опустить (.+)$/, (_, name) => `Move down ${name}`],
      [/^Добавление (\d+) из (\d+)$/, (_, a, b) => `Adding ${a} of ${b}`],
      [/^Добавлено: (\d+) из (\d+)$/, (_, a, b) => `Added: ${a} of ${b}`],
      [/^Выход (\d+): (.*)$/, (_, n, status) => `Output ${n}: ${translate(status)}`],
      [/^готов, страница (\d+)$/, (_, n) => `ready, page ${n}`],
      [/^Диагностика vMix: (.*)$/, (_, s) => `vMix diagnostics: ${translate(s)}`],
      [/^Копировать имя: (.*)$/, (_, s) => `Copy name: ${translate(s)}`],
      [/^Проверено: (.*)$/, (_, time) => `Checked: ${time}`],
      [/^vMix (.*) отвечает$/, (_, version) => `vMix ${version} is responding`],
      [/^Источник №(\d+) найден$/, (_, n) => `Source #${n} found`],
      [/^Страница (\d+) из (\d+) отображается$/, (_, a, b) => `Page ${a} of ${b} is displayed`],
      [/^Ожидаем страницу (\d+)$/, (_, n) => `Waiting for page ${n}`],
      [/^«(.*)», страница (\d+) из (\d+)\.$/, (_, name, a, b) => `“${name}”, page ${a} of ${b}.`],
      [/^Команда vMix выполнена: страница (\d+) из (\d+)\.$/, (_, a, b) => `vMix command completed: page ${a} of ${b}.`],
      [/^Готово\. (Добавлено|Восстановлено) PDF: (\d+)\. (.*)$/, (_, verb, n, warning) => `Done. ${translate(verb)} PDFs: ${n}. ${translate(warning)}`]
    ];
    for (const [pattern, replacement] of patterns) if (pattern.test(text)) return text.replace(pattern, replacement);
    // Errors and backup summaries can contain a filename followed by a known message.
    for (const [ru, en] of Object.entries(dictionary)) {
      if (ru.length > 15 && text.endsWith(ru)) return text.slice(0, -ru.length) + en;
    }
    return text;
  }
  globalThis.pdfViewerI18n = Object.freeze({ language, translate });
  document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('language');
    select.value = language;
    select.addEventListener('change', () => {
      const value = select.value;
      if (!['ru', 'en'].includes(value)) return;
      try { document.cookie = `${key}=${value}; Path=/; Max-Age=31536000; SameSite=Strict`; } catch {}
      try { localStorage.setItem(key, value); } catch {}
      location.reload();
    });
    window.pdfViewerDesktop?.setLanguage?.(language);
    if (language !== 'en') return;
    const protectedText = '#active-name,.document-name,#delete-name,code,script,style,option:not([value=""])';
    function update(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (!node.parentElement || node.parentElement.closest(protectedText)) return;
        const trimmed = node.data.trim(), value = translate(trimmed);
        if (value !== trimmed) node.data = node.data.replace(trimmed, value);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.matches(protectedText)) return;
        for (const attr of ['title', 'aria-label']) {
          const old = node.getAttribute(attr);
          if (old) { const value = translate(old); if (value !== old) node.setAttribute(attr, value); }
        }
        for (const child of node.childNodes) update(child);
      }
    }
    document.title = translate(document.title);
    update(document.body);
    // Translate only changed subtrees; translated values never generate another write.
    new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'childList') for (const node of record.addedNodes) update(node);
        else update(record.target);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'aria-label'] });
  }, { once: true });
})();
