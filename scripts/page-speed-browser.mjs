import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = process.argv[2] || 'benchmark-results/page-speed-browser.json';
const bundle = path.resolve(process.argv[3] || 'dist');
const server = await preview({ configFile: false, build: { outDir: bundle }, preview: { host: '127.0.0.1', port: 0 } });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1120, height: 820 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0]);
  const start = Date.now();
  await page.getByLabel('Choose a PDF', { exact: true }).setInputFiles('public/sample.pdf');
  await expect(page.locator('.book-view')).toHaveAttribute('data-busy', 'false', { timeout: 30000 });
  const openMs = Date.now() - start;
  const turns = [];
  for (const [direction, expectedPage] of [[1, 2], [1, 4], [1, 6], [-1, 4], [1, 6], [1, 8]]) {
    await page.waitForTimeout(2000);
    const timing = await page.evaluate(direction => new Promise((resolve, reject) => {
      const host = document.querySelector('.book-view');
      const started = performance.now();
      const timeout = setTimeout(() => { observer.disconnect(); reject(new Error('Turn did not start')); }, 15000);
      const observer = new MutationObserver(() => {
        if (host.dataset.turn !== undefined) {
          clearTimeout(timeout); observer.disconnect(); resolve({ readyMs: performance.now() - started, visibility: document.visibilityState });
        }
      });
      observer.observe(host, { attributes: true, attributeFilter: ['data-turn'] });
      document.querySelector(`[aria-label="${direction === 1 ? 'Next page' : 'Previous page'}"]`).click();
    }), direction);
    await expect(page.getByRole('textbox', { name: 'Page number' })).toHaveValue(String(expectedPage));
    await expect(page.locator('.book-view')).toHaveAttribute('data-busy', 'false');
    turns.push({ direction, page: expectedPage, readyMs: +timing.readyMs.toFixed(1), visibility: timing.visibility });
  }
  const result = { sample: 'public/sample.pdf', environment: 'headless Chromium, visible page lifecycle', readingPauseMs: 2000, openMs, turns, errors };
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
} finally { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
