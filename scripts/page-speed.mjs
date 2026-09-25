import { _electron as electron, expect } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const profile = await mkdtemp(path.join(tmpdir(), 'pdfthing-speed-'));
const output = process.argv[2] || 'benchmark-results/page-speed.json';
const app = await electron.launch({ args: [path.resolve('desktop/main.cjs'), '--hidden', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', `--user-data-dir=${profile}`], env });
try {
  const page = await app.firstWindow();
  // Diagnostic native run. Hidden windows may still throttle compositor frames
  // despite these flags; use page-speed-browser.mjs for active-page timings.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false));
  await expect(page.getByRole('button', { name: 'Open PDF', exact: true })).toBeVisible();
  const frameMs = await page.evaluate(() => new Promise(resolve => requestAnimationFrame(start => requestAnimationFrame(end => resolve(end - start)))));
  console.log('Frame interval:', frameMs);
  const openStart = Date.now();
  await app.evaluate(({ app }, filename) => app.emit('open-file', { preventDefault() {} }, filename), path.resolve('public/sample.pdf'));
  await expect(page.locator('.book-view')).toHaveAttribute('data-busy', 'false', { timeout: 30000 });
  const openMs = Date.now() - openStart;
  const turns = [];
  for (const direction of [1, 1, 1, -1, 1, 1]) {
    await page.waitForTimeout(2000);
    const delay = await page.evaluate(direction => new Promise((resolve, reject) => {
      const host = document.querySelector('.book-view');
      const started = performance.now();
      const timeout = setTimeout(() => { observer.disconnect(); reject(new Error('Turn did not start')); }, 30000);
      const observer = new MutationObserver(() => {
        if (host.dataset.turn !== undefined) {
          clearTimeout(timeout); observer.disconnect(); resolve(performance.now() - started);
        }
      });
      observer.observe(host, { attributes: true, attributeFilter: ['data-turn'] });
      document.querySelector(`[aria-label="${direction === 1 ? 'Next page' : 'Previous page'}"]`).click();
    }), direction);
    await page.waitForFunction(() => {
      const host = document.querySelector('.book-view');
      return host?.dataset.busy === 'false' && host.dataset.turn === undefined;
    });
    turns.push({ direction, readyMs: +delay.toFixed(1), page: await page.getByRole('textbox', { name: 'Page number' }).inputValue() });
  }
  const processes = await app.evaluate(({ app }) => app.getAppMetrics().map(({ type, memory }) => ({ type, ...memory })));
  const result = { sample: 'public/sample.pdf', environment: 'hidden Electron; compositor throttling may apply', readingPauseMs: 2000, frameMs, openMs, turns,
    workingSetMiB: +(processes.reduce((sum, item) => sum + item.workingSetSize, 0) / 1024).toFixed(1), processes };
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, processes: undefined }, null, 2));
} finally { await app.close(); }
