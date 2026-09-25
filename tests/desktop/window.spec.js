import { test, expect, _electron as electron } from '@playwright/test';
import { pdfFile } from '../pdf-fixture.js';
import path from 'node:path';
import { mkdirSync } from 'node:fs';

test('packaged UI, isolated preload, native pin and window commands', async ({}, info) => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.env.PDFTHING_EXECUTABLE;
  const profile = info.outputPath('profile');
  mkdirSync(profile, { recursive: true });
  const app = await electron.launch({
    ...(executablePath ? { executablePath: path.resolve(executablePath) } : {}),
    args: [...(executablePath ? [] : [path.resolve('desktop/main.cjs')]), '--hidden', `--user-data-dir=${profile}`], env,
  });
  try {
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await expect(page.getByRole('button', { name: 'Close window' })).toBeVisible();
    expect(await page.evaluate(() => typeof window.require)).toBe('undefined');
    await page.getByRole('button', { name: 'Always on top' }).click();
    await expect(page.getByRole('button', { name: 'Always on top' })).toHaveAttribute('aria-pressed', 'true');
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop())).toBe(true);
    await page.getByRole('button', { name: 'Always on top' }).click();
    await expect(page.getByRole('button', { name: 'Always on top' })).toHaveAttribute('aria-pressed', 'false');
    await page.getByLabel('Choose a PDF', { exact: true }).setInputFiles(pdfFile('Range import.pdf', 4, 256 * 1024));
    await expect(page.locator('.book-view')).toHaveAttribute('data-busy', 'false');
    await page.getByRole('button', { name: 'Scroll view' }).click();
    await expect(page.locator('[data-page="1"] canvas')).toBeAttached();
    // Exercise the real IPC routing without showing a native window in tests.
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.testCommands = [];
      win.minimize = () => win.testCommands.push('minimize');
      win.maximize = () => win.testCommands.push('maximize');
    });
    await page.getByRole('button', { name: 'Minimize window' }).click();
    await page.getByRole('button', { name: 'Maximize window' }).click();
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].testCommands)).toEqual(['minimize', 'maximize']);
    expect(errors).toEqual([]);
  } finally { await app.close(); }
});
