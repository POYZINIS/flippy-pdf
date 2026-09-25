import { test, expect, chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pdfFile } from '../pdf-fixture.js';

test('portable executable opens an Explorer-style PDF argument on a cold launch', async ({}, info) => {
  test.skip(!process.env.PDFTHING_SECOND_EXECUTABLE, 'Set PDFTHING_SECOND_EXECUTABLE to the portable build.');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const profile = info.outputPath('profile');
  await mkdir(profile, { recursive: true });
  const filename = info.outputPath('Portable résumé reading.pdf');
  await writeFile(filename, pdfFile('Portable.pdf', 3, 256 * 1024).buffer);
  const reservation = createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(path.resolve(process.env.PDFTHING_SECOND_EXECUTABLE), [
    '--hidden', `--user-data-dir=${profile}`, '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${port}`, filename,
  ], { env, windowsHide: true, stdio: 'ignore' });
  let browser;
  try {
    await expect.poll(async () => {
      try { return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok; } catch { return false; }
    }, { timeout: 30000 }).toBe(true);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const context = browser.contexts()[0];
    await expect.poll(() => context.pages().length).toBeGreaterThan(0);
    const page = context.pages()[0];
    await expect(page.getByRole('button', { name: 'Open PDF (Portable résumé reading.pdf)', exact: true })).toBeVisible();
    await expect(page.locator('.book-view')).toHaveAttribute('data-busy', 'false');
    await expect(page.locator('.book-view')).toHaveAttribute('data-preload', /^(true|false)$/);
    await page.getByRole('button', { name: 'Close window' }).click();
    await expect.poll(() => child.exitCode, { timeout: 15000 }).toBe(0);
  } finally {
    if (browser?.isConnected()) {
      // Close the test's hidden window if an assertion failed before cleanup.
      for (const context of browser.contexts()) for (const page of context.pages()) await page.evaluate(() => window.desktop?.command('close')).catch(() => {});
      await browser.close().catch(() => {});
    }
    if (child.exitCode === null) child.kill();
  }
});
