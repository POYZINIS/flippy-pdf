import { PDFDataRangeTransport } from 'pdfjs-dist';

export const FILE_CHUNK_SIZE = 64 * 1024;

// Let PDF.js request slices of the local File instead of materializing a
// second, whole-file ArrayBuffer in the UI process before opening the worker.
export class FileTransport extends PDFDataRangeTransport {
  constructor(file, onError) {
    super(file.size, null, true, file.name);
    this.file = file;
    this.onError = onError;
    this.readers = new Set();
    this.bytesRead = 0;
    this.aborted = false;
  }

  requestDataRange(begin, end) {
    if (this.aborted) return;
    if (this.file.readRange) {
      this.file.readRange(begin, end).then(data => {
        if (this.aborted) return;
        this.bytesRead += data.byteLength;
        this.onDataRange(begin, data);
      }).catch(error => {
        if (this.aborted) return;
        const onError = this.onError;
        this.abort();
        onError(error);
      });
      return;
    }
    const reader = new FileReader();
    const finish = () => {
      this.readers.delete(reader);
      reader.onload = reader.onerror = reader.onabort = null;
    };
    const fail = error => {
      finish();
      if (this.aborted) return;
      const onError = this.onError;
      this.abort();
      onError(error);
    };
    reader.onload = () => {
      const buffer = reader.result;
      finish();
      if (this.aborted) return;
      if (buffer.byteLength !== end - begin) { fail(new Error('The PDF file could not be read completely.')); return; }
      this.bytesRead += buffer.byteLength;
      try { this.onDataRange(begin, new Uint8Array(buffer)); } catch (error) { fail(error); }
    };
    reader.onerror = () => fail(reader.error || new Error('The PDF file could not be read.'));
    reader.onabort = finish;
    this.readers.add(reader);
    try { reader.readAsArrayBuffer(this.file.slice(begin, end)); } catch (error) { fail(error); }
  }

  abort() {
    this.aborted = true;
    for (const reader of this.readers) {
      reader.onload = reader.onerror = reader.onabort = null;
      reader.abort();
    }
    this.readers.clear();
    this.file?.close?.();
    this.file = this.onError = null;
  }
}
