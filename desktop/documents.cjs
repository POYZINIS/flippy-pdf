const path = require('node:path');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');

function pdfArgument(argv, cwd) {
  const value = argv.find(value => !value.startsWith('-') && /\.pdf$/i.test(value));
  return value ? path.resolve(cwd, value) : null;
}

class Documents {
  constructor() { this.files = new Map(); }

  async add(filename) {
    const stat = await fs.stat(filename);
    if (!stat.isFile() || !/\.pdf$/i.test(filename)) throw new Error('Choose a PDF file.');
    if (!stat.size) throw new Error('This PDF is empty.');
    const id = randomUUID();
    this.files.set(id, { filename, size: stat.size });
    // Only the current document and a replacement awaiting React are needed.
    while (this.files.size > 2) this.files.delete(this.files.keys().next().value);
    return { id, name: path.basename(filename), size: stat.size, type: 'application/pdf' };
  }

  async read(id, begin, end) {
    const file = this.files.get(id);
    if (!file || !Number.isSafeInteger(begin) || !Number.isSafeInteger(end) || begin < 0 || end <= begin || end > file.size || end - begin > 4 * 1024 ** 2) {
      throw new Error('Invalid PDF read request.');
    }
    const handle = await fs.open(file.filename, 'r');
    try {
      const data = Buffer.alloc(end - begin);
      let offset = 0;
      while (offset < data.length) {
        const { bytesRead } = await handle.read(data, offset, data.length - offset, begin + offset);
        if (!bytesRead) throw new Error('The PDF file changed or could not be read.');
        offset += bytesRead;
      }
      return data;
    } finally { await handle.close(); }
  }

  release(id) { this.files.delete(id); }
}

module.exports = { pdfArgument, Documents };
