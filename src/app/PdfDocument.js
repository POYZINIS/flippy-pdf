import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { rasterSize } from './raster.js';
import { FileTransport, FILE_CHUNK_SIZE } from './FileTransport.js';

GlobalWorkerOptions.workerSrc = workerUrl;
const IDLE_BYTES = 12 * 1024 ** 2;
const MAX_PIXELS = 4 * 1024 ** 2;
const aborted = () => new DOMException('Page no longer needed', 'AbortError');

// Each visible consumer owns a lease. Only unused rasters enter the bounded
// LRU cache; evicting one releases its pixel buffer immediately, not at GC.
export class PdfDocument {
  constructor() {
    this.cache = new Map();
    this.queue = [];
    this.running = 0;
    this.clock = 0;
    this.destroyed = false;
    this.pendingReads = new Set();
  }

  async open(file) {
    if (this.destroyed) return;
    this.transport = new FileTransport(file, error => this.destroy(error));
    // Decode into transferable CPU buffers. Worker OffscreenCanvas/ImageBitmap
    // allocations otherwise add a second set of graphics surfaces before the
    // final book textures are uploaded. One render at a time limits overlap.
    this.loadingTask = getDocument({ range: this.transport, rangeChunkSize: FILE_CHUNK_SIZE,
      disableAutoFetch: true, disableStream: true, isEvalSupported: false, isOffscreenCanvasSupported: false });
    this.pdf = await this.read(this.loadingTask.promise);
    if (this.destroyed) return;
    this.total = this.pdf.numPages;
    const first = await this.read(this.pdf.getPage(1));
    const viewport = first.getViewport({ scale: 1 });
    this.aspect = viewport.width / viewport.height;
    first.cleanup();
    return this;
  }

  read(promise) {
    // Remove settled callbacks. Racing every read against one never-settled
    // failure promise would retain a reaction for every page ever visited.
    return new Promise((resolve, reject) => {
      this.pendingReads.add(reject);
      promise.then(value => { this.pendingReads.delete(reject); resolve(value); },
        error => { this.pendingReads.delete(reject); reject(error); });
    });
  }

  async acquire(number, pixels = 1024, signal) {
    if (this.destroyed || signal?.aborted) throw aborted();
    const size = rasterSize(pixels);
    const key = `${number}:${size}`;
    let entry = this.cache.get(key);
    if (!entry) {
      entry = { key, number, size, refs: 0, bytes: 0, canvas: null, cancelled: false };
      entry.promise = new Promise((resolve, reject) => { entry.resolve = resolve; entry.reject = reject; });
      this.cache.set(key, entry);
      this.queue.push(entry);
    }
    entry.refs++;
    entry.used = ++this.clock;
    let released = false;
    const release = (discard = false) => {
      if (released) return;
      released = true;
      signal?.removeEventListener('abort', release);
      entry.refs--;
      if (discard === true) entry.discard = true;
      entry.used = ++this.clock;
      if (!entry.refs && !entry.canvas) this.cancel(entry);
      if (!entry.refs && entry.canvas && entry.discard) this.free(entry);
      this.trim();
      if (!entry.refs && entry.canvas && !this.destroyed) {
        this.needsCleanup = true;
        this.pump();
      }
    };
    signal?.addEventListener('abort', release, { once: true });
    this.pump();
    try {
      const canvas = await entry.promise;
      if (released || this.destroyed) throw aborted();
      return { canvas, release };
    } catch (error) { release(); throw error; }
  }

  cancel(entry) {
    entry.cancelled = true;
    entry.task?.cancel();
    const index = this.queue.indexOf(entry);
    if (index !== -1) { this.queue.splice(index, 1); entry.reject(aborted()); }
    if (this.cache.get(entry.key) === entry) this.cache.delete(entry.key);
  }

  free(entry) {
    if (entry.canvas) { entry.canvas.width = 0; entry.canvas.height = 0; entry.canvas = null; entry.bytes = 0; }
    if (this.cache.get(entry.key) === entry) this.cache.delete(entry.key);
  }

  trim(limit = IDLE_BYTES) {
    const idle = [...this.cache.values()].filter(entry => !entry.refs && entry.canvas).sort((a, b) => a.used - b.used);
    let bytes = idle.reduce((sum, entry) => sum + entry.bytes, 0);
    for (const entry of idle) {
      if (bytes <= limit) break;
      bytes -= entry.bytes;
      this.free(entry);
    }
  }

  pump() {
    clearTimeout(this.cleanupTimer);
    // Serialize decoding: two scanned pages can each allocate huge temporary
    // image buffers inside PDF.js even when the output canvas is small.
    if (this.destroyed || this.cleaning || this.running) return;
    if (!this.queue.length) {
      if (this.needsCleanup) this.cleanupTimer = setTimeout(() => this.cleanup(), 750);
      return;
    }
    const entry = this.queue.shift();
    this.running++;
    this.renderPage(entry).then(canvas => {
      if (this.destroyed || entry.cancelled || !entry.refs) { canvas.width = canvas.height = 0; throw aborted(); }
      entry.canvas = canvas;
      entry.bytes = canvas.width * canvas.height * 4;
      entry.resolve(canvas);
    }).catch(error => {
      if (this.cache.get(entry.key) === entry) this.cache.delete(entry.key);
      entry.reject(error);
    }).finally(() => {
      this.running--;
      this.needsCleanup = true;
      this.trim();
      if (this.queue.length) this.pump();
      else if (!this.destroyed) this.cleanupTimer = setTimeout(() => this.cleanup(), 750);
    });
  }

  async renderPage(entry) {
    const page = await this.read(this.pdf.getPage(entry.number));
    let canvas;
    try {
      if (this.destroyed || entry.cancelled) throw aborted();
      const natural = page.getViewport({ scale: 1 });
      const scale = Math.min(entry.size / Math.max(natural.width, natural.height), Math.sqrt(MAX_PIXELS / (natural.width * natural.height)));
      const viewport = page.getViewport({ scale });
      canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      // A CPU-backed raster avoids retaining a second GPU surface for every
      // PDF canvas; book mode uploads it once into its own WebGL texture.
      entry.task = page.render({ canvasContext: canvas.getContext('2d', { alpha: false, willReadFrequently: true }), viewport });
      await this.read(entry.task.promise);
      return canvas;
    } catch (error) { if (canvas) canvas.width = canvas.height = 0; throw error; }
    finally {
      entry.task = null;
      // Release this page's operator list and decoded images after painting.
      page.cleanup();
    }
  }

  async cleanup() {
    if (this.destroyed || this.running || this.cleaning) return;
    this.cleaning = true;
    this.needsCleanup = false;
    // Keep the short-lived navigation cache during activity, then return its
    // unused pixels once the reader settles. Active scroll pages stay leased.
    this.trim(0);
    try { await this.pdf.cleanup(); } catch { /* Destruction may race cleanup; the next render schedules another cleanup. */ }
    finally { this.cleaning = false; this.pump(); }
  }

  getMemoryStats() {
    const entries = [...this.cache.values()];
    return {
      rasterBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
      idleBytes: entries.filter(entry => !entry.refs).reduce((sum, entry) => sum + entry.bytes, 0),
      idleLimit: IDLE_BYTES, entries: entries.length, queued: this.queue.length, running: this.running,
      leases: entries.reduce((sum, entry) => sum + entry.refs, 0),
      fileBytesRead: this.transport?.bytesRead || 0,
    };
  }

  destroy(error = aborted()) {
    this.destroyed = true;
    this.transport?.abort();
    for (const reject of this.pendingReads) reject(error);
    this.pendingReads.clear();
    clearTimeout(this.cleanupTimer);
    for (const entry of this.cache.values()) { this.cancel(entry); this.free(entry); }
    this.cache.clear();
    this.queue.length = 0;
    this.loadingTask?.destroy().catch(() => {});
  }
}
