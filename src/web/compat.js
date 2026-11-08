// CEF V115: PDF.js использует Promise.withResolvers в странице и worker.
// Сохраняем нативную реализацию в браузерах, где функция уже есть.
if (typeof Promise.withResolvers !== 'function') {
  Object.defineProperty(Promise, 'withResolvers', {
    configurable: true, writable: true,
    value: function withResolvers() {
      let resolve, reject;
      const promise = new this((resolvePromise, rejectPromise) => {
        resolve = resolvePromise; reject = rejectPromise;
      });
      return { promise, resolve, reject };
    }
  });
}
