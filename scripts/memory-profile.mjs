import { _electron as electron, expect } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const profile = await mkdtemp(path.join(tmpdir(), 'pdfthing-memory-'));
const output = process.argv[2] || 'benchmark-results/memory.json';
const app = await electron.launch({ args: [path.resolve('desktop/main.cjs'), '--hidden', `--user-data-dir=${profile}`], env });
const results = [];
const started = performance.now();
try {
  const page = await app.firstWindow();
  const session = await page.context().newCDPSession(page);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  // Keep blur enabled in both measurements, so the PDF changes are isolated.
  const snapshot = async label => {
    await session.send('HeapProfiler.collectGarbage');
    const heap = await session.send('Runtime.getHeapUsage');
    const metrics = await app.evaluate(({ app }) => app.getAppMetrics().map(({ type, memory }) => ({ type, ...memory })));
    const dom = await session.send('Memory.getDOMCounters');
    const record = {
      label,
      elapsedMs: Math.round(performance.now() - started),
      privateMiB: +(metrics.reduce((sum, item) => sum + (item.privateBytes || 0), 0) / 1024).toFixed(1),
      workingSetMiB: +(metrics.reduce((sum, item) => sum + item.workingSetSize, 0) / 1024).toFixed(1),
      jsHeapMiB: +(heap.usedSize / 1024 ** 2).toFixed(1),
      backingStorageMiB: +((heap.backingStorageSize || 0) / 1024 ** 2).toFixed(1),
      domNodes: dom.nodes,
      processes: metrics,
    };
    results.push(record);
    console.log(JSON.stringify({ ...record, processes: undefined }));
  };
  const jump = async number => {
    const input = page.getByRole('textbox', { name: 'Page number' });
    await input.fill(String(number));
    await input.press('Enter');
    await expect(input).toHaveValue(String(number));
    if (await page.locator('.book-view').count()) await expect(page.locator('.book-view')).toHaveAttribute('data-busy', 'false', { timeout: 30000 });
    else await expect(page.locator(`[data-page="${number}"] canvas`)).toBeAttached({ timeout: 30000 });
  };
  await snapshot('empty');
  for (let cycle = 1; cycle <= 2; cycle++) {
    await page.getByLabel('Choose a PDF', { exact: true }).setInputFiles('public/sample.pdf');
    await expect(page.locator('.book-view')).toHaveAttribute('data-busy', 'false', { timeout: 30000 });
    await snapshot(`opened-${cycle}`);
    for (const number of [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]) await jump(number);
    await snapshot(`book-${cycle}`);
    await page.getByRole('button', { name: 'Scroll view' }).click();
    for (const number of [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]) await jump(number);
    await snapshot(`scroll-${cycle}`);
    await page.getByRole('button', { name: 'Book view' }).click();
    await expect(page.locator('.book-view')).toHaveAttribute('data-busy', 'false', { timeout: 30000 });
    await page.getByRole('button', { name: 'Close PDF' }).click();
    await expect(page.getByRole('button', { name: 'Drop or choose a PDF' })).toBeVisible();
    await snapshot(`closed-${cycle}`);
  }
  await page.waitForTimeout(2000);
  await snapshot('closed-settled');
  if (errors.length) throw new Error(errors.join('\n'));
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify({ sample: 'public/sample.pdf', blur: true, gcBeforeSnapshots: true, results }, null, 2));
} finally { await app.close(); }
