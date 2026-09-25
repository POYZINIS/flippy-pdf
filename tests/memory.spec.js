import { test, expect } from '@playwright/test';
import { pdfFile } from './pdf-fixture.js';

test('raster leases share storage, retain visible pages, and bound unused pixels', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async data => {
    const { PdfDocument } = await import('/src/app/PdfDocument.js');
    const pdf = await new PdfDocument().open(new File([new Uint8Array(data)], 'Memory.pdf'));
    const held = await pdf.acquire(1, 1024);
    const duplicate = await pdf.acquire(1, 1024);
    const shared = held.canvas === duplicate.canvas;
    duplicate.release(true);
    duplicate.release();
    const old = [];
    let bounded = true;
    for (let number = 2; number <= 20; number++) {
      const lease = await pdf.acquire(number, 1536);
      old.push(lease.canvas);
      lease.release();
      const stats = pdf.getMemoryStats();
      bounded &&= stats.idleBytes <= stats.idleLimit;
    }
    const visibleIntact = held.canvas.width > 0;
    const evicted = old.filter(canvas => canvas.width === 0).length;
    const stats = pdf.getMemoryStats();
    held.release();
    pdf.destroy();
    return { shared, bounded, visibleIntact, evicted, stats, cleared: [held.canvas, ...old].every(canvas => canvas.width === 0) };
  }, [...pdfFile('Memory.pdf', 20).buffer]);
  expect(result.shared).toBe(true);
  expect(result.bounded).toBe(true);
  expect(result.visibleIntact).toBe(true);
  expect(result.evicted).toBeGreaterThan(15);
  expect(result.stats.leases).toBe(1);
  expect(result.cleared).toBe(true);
});

test('cancelled queued renders and destruction release work without breaking shared consumers', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async data => {
    const { PdfDocument } = await import('/src/app/PdfDocument.js');
    const pdf = await new PdfDocument().open(new File([new Uint8Array(data)], 'Cancel.pdf'));
    const first = new AbortController();
    const one = pdf.acquire(1, 2200, first.signal).catch(error => error.name);
    const two = pdf.acquire(1, 2200);
    first.abort();
    const aborted = Array.from({ length: 12 }, (_, i) => {
      const controller = new AbortController();
      const promise = pdf.acquire(i + 2, 2200, controller.signal).catch(error => error.name);
      controller.abort();
      return promise;
    });
    const lease = await two;
    const sharedSurvived = lease.canvas.width > 0;
    const cancellations = await Promise.all([one, ...aborted]);
    // Destroy while a render is running and another is still queued.
    const pending = [pdf.acquire(15, 2200), pdf.acquire(16, 2200)].map(promise => promise.catch(error => error.name));
    pdf.destroy();
    await Promise.all(pending);
    await new Promise(resolve => setTimeout(resolve, 50));
    return { cancellations, sharedSurvived, cleared: lease.canvas.width === 0, stats: pdf.getMemoryStats() };
  }, [...pdfFile('Cancel.pdf', 20).buffer]);
  expect(result.sharedSurvived).toBe(true);
  expect(result.cancellations.every(name => name === 'AbortError')).toBe(true);
  expect(result.cleared).toBe(true);
  expect(result.stats).toMatchObject({ rasterBytes: 0, entries: 0, queued: 0, running: 0 });
});

test('book navigation and zoom retire GPU textures and release all raster leases on exit', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async data => {
    const [{ PdfDocument }, { BookRenderer }] = await Promise.all([import('/src/app/PdfDocument.js'), import('/src/app/BookRenderer.js')]);
    const pdf = await new PdfDocument().open(new File([new Uint8Array(data)], 'Book.pdf'));
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;width:1000px;height:800px';
    document.body.append(host);
    const errors = [];
    const book = new BookRenderer(host, pdf, 1, () => {}, error => errors.push(error.message));
    const settle = async () => {
      const deadline = performance.now() + 10000;
      while (host.dataset.busy !== 'false' || host.dataset.preload === 'true' || book.pendingTextures.size || book.turn) {
        if (performance.now() > deadline) throw new Error('Book did not settle');
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    };
    await settle();
    let maxTextures = 0;
    let maxCpuPixels = 0;
    let cacheBounded = true;
    for (const number of [2, 4, 6, 8, 10, 12]) {
      book.goTo(number);
      await settle();
      book.setZoom(number % 4 ? 2.5 : 1);
      await new Promise(resolve => setTimeout(resolve, 220));
      await settle();
      maxTextures = Math.max(maxTextures, book.renderer.info.memory.textures);
      maxCpuPixels = Math.max(maxCpuPixels, pdf.getMemoryStats().rasterBytes);
      cacheBounded &&= book.getCacheStats().preloadBytes <= book.getCacheStats().preloadLimit;
    }
    // Zoom while loading a curved turn must not discard its page textures.
    let coldReads = 0;
    const acquire = pdf.acquire.bind(pdf);
    pdf.acquire = (...args) => { coldReads++; return acquire(...args); };
    await book.startTurn(1, true);
    const warmTurnReads = coldReads;
    book.setZoom(1.5);
    const turnTextured = Boolean(book.front.material.map && book.back.material.map);
    book.finishTurn(true);
    await settle();
    const retired = book.retiredTextures.size;
    book.destroy();
    const texturesAfter = book.renderer.info.memory.textures;
    const leasesAfter = pdf.getMemoryStats().leases;
    pdf.destroy();
    host.remove();
    return { errors, maxTextures, maxCpuPixels, cacheBounded, warmTurnReads, retired, texturesAfter, leasesAfter, turnTextured };
  }, [...pdfFile('Book.pdf', 20).buffer]);
  expect(result.errors).toEqual([]);
  expect(result.maxTextures).toBeLessThanOrEqual(6);
  expect(result.cacheBounded).toBe(true);
  expect(result.warmTurnReads).toBe(0);
  expect(result.maxCpuPixels).toBe(0);
  expect(result.retired).toBe(0);
  expect(result.texturesAfter).toBe(0);
  expect(result.leasesAfter).toBe(0);
  expect(result.turnTextured).toBe(true);
});

test('local PDFs open from ranges and release idle rasters without clearing visible pages', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async data => {
    const { PdfDocument } = await import('/src/app/PdfDocument.js');
    const file = new File([new Uint8Array(data)], 'Ranges.pdf');
    file.arrayBuffer = () => { throw new Error('Unexpected whole-file read'); };
    const pdf = await new PdfDocument().open(file);
    const visible = await pdf.acquire(1, 1024);
    const offscreen = await pdf.acquire(2, 1024);
    offscreen.release();
    // Wait for the actual idle-cleanup scheduler, rather than invoking it.
    const deadline = performance.now() + 5000;
    while (pdf.getMemoryStats().idleBytes && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    const result = { bytesRead: pdf.getMemoryStats().fileBytesRead, fileSize: file.size,
      idleBytes: pdf.getMemoryStats().idleBytes, visibleWidth: visible.canvas.width,
      offscreenWidth: offscreen.canvas.width, pendingReads: pdf.pendingReads.size };
    visible.release();
    // Releasing a page after the first idle cleanup must schedule another
    // cleanup even if no additional PDF rendering takes place.
    const secondDeadline = performance.now() + 5000;
    while (visible.canvas.width && performance.now() < secondDeadline) await new Promise(resolve => setTimeout(resolve, 50));
    result.lateReleaseCleared = visible.canvas.width === 0;
    pdf.destroy();
    return result;
  }, [...pdfFile('Ranges.pdf', 2, 2 * 1024 ** 2).buffer]);
  expect(result.bytesRead).toBeLessThan(result.fileSize / 4);
  expect(result.visibleWidth).toBeGreaterThan(0);
  expect(result.idleBytes).toBe(0);
  expect(result.offscreenWidth).toBe(0);
  expect(result.pendingReads).toBe(0);
  expect(result.lateReleaseCleared).toBe(true);
});

test('failed and cancelled file-range reads terminate cleanly', async ({ page }) => {
  await page.goto('/');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const result = await page.evaluate(async data => {
    const [{ FileTransport }, { PdfDocument }] = await Promise.all([import('/src/app/FileTransport.js'), import('/src/app/PdfDocument.js')]);
    const file = new File([new Uint8Array(data)], 'Ranges.pdf');
    let callbacks = 0;
    const transport = new FileTransport(file, () => callbacks++);
    transport.addRangeListener(() => callbacks++);
    transport.requestDataRange(0, file.size);
    transport.abort();
    await new Promise(resolve => setTimeout(resolve, 50));
    file.slice = () => { throw new Error('File is no longer available'); };
    const pdf = new PdfDocument();
    const message = await pdf.open(file).then(() => 'unexpected success', error => error.message);
    return { callbacks, readers: transport.readers.size, released: transport.file === null,
      message, destroyed: pdf.destroyed, pendingReads: pdf.pendingReads.size };
  }, [...pdfFile().buffer]);
  expect(result).toEqual({ callbacks: 0, readers: 0, released: true, message: 'File is no longer available', destroyed: true, pendingReads: 0 });
  expect(errors).toEqual([]);
});
