// PDF.js 6: временем жизни документа владеет PDFDocumentLoadingTask.
export class PdfSession {
  constructor() { this.task = null; this.pdf = null; this.key = null; }
  async reset() {
    const task = this.task;
    this.task = null; this.pdf = null; this.key = null;
    if (task) await task.destroy();
  }
  async open(key, options, getDocument) {
    if (this.key === key && this.pdf) return this.pdf;
    await this.reset();
    this.task = getDocument(options);
    try {
      this.pdf = await this.task.promise;
      this.key = key;
      return this.pdf;
    } catch (error) {
      await this.reset();
      throw error;
    }
  }
}
