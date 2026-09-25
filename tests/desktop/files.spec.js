import { test, expect, _electron as electron } from '@playwright/test';
import electronPath from 'electron';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pdfFile } from '../pdf-fixture.js';

test('Windows file arguments open on startup and in the existing window', async ({}, info) => {
  test.setTimeout(60000);
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.env.PDFTHING_EXECUTABLE ? path.resolve(process.env.PDFTHING_EXECUTABLE) : electronPath;
  const appArgs = process.env.PDFTHING_EXECUTABLE ? [] : [path.resolve('desktop/main.cjs')];
  const folder = info.outputPath('PDF files');
  const profile = info.outputPath('profile');
  await mkdir(folder, { recursive: true });
  await mkdir(profile, { recursive: true });
  const first = 'First résumé.pdf';
  const second = 'Second reading notes.PDF';
  await writeFile(path.join(folder, first), pdfFile(first, 4, 256 * 1024).buffer);
  await writeFile(path.join(folder, second), pdfFile(second, 8, 256 * 1024).buffer);
  const sharedArgs = [...appArgs, '--hidden', `--user-data-dir=${profile}`];
  const app = await electron.launch({ executablePath, args: [...sharedArgs, path.join(folder, first)], env });
  const launchAgain = filename => new Promise((resolve, reject) => {
    const secondExecutable = process.env.PDFTHING_SECOND_EXECUTABLE ? path.resolve(process.env.PDFTHING_SECOND_EXECUTABLE) : executablePath;
    // Explorer sends absolute paths. The NSIS portable launcher changes its
    // working directory while extracting, so use that Windows contract there.
    const argument = process.env.PDFTHING_SECOND_EXECUTABLE ? path.join(folder, filename) : filename;
    const child = spawn(secondExecutable, [...sharedArgs, argument], { cwd: folder, env, windowsHide: true, stdio: 'ignore' });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Second instance did not exit')); }, 15000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Second instance exited ${code}`)); });
  });
  try {
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await expect(page.getByRole('button', { name: `Open PDF (${first})`, exact: true })).toBeVisible();
    await expect(page.locator('.book-view')).toHaveAttribute('data-busy', 'false');
    await page.evaluate(() => { window.desktop.onPdf(file => { window.receivedPdf = file; }); });
    // Use a real second process, including spaces in the document path.
    await launchAgain(second);
    await expect(page.getByRole('button', { name: `Open PDF (${second})`, exact: true })).toBeVisible();
    await expect(page.locator('.book-view')).toHaveAttribute('data-busy', 'false');
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    await page.getByRole('textbox', { name: 'Page number' }).fill('8');
    await page.getByRole('textbox', { name: 'Page number' }).press('Enter');
    await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Scroll view' }).click();
    await expect(page.locator('[data-page="8"] canvas')).toBeAttached();
    const token = await page.evaluate(() => window.receivedPdf.id);
    expect(await page.evaluate(() => window.desktop.readPdfRange('unknown-token', 0, 16).then(() => false, () => true))).toBe(true);
    await page.getByRole('button', { name: 'Close PDF' }).click();
    await expect(page.getByRole('button', { name: 'Drop or choose a PDF' })).toBeVisible();
    expect(await page.evaluate(id => window.desktop.readPdfRange(id, 0, 16).then(() => false, () => true), token)).toBe(true);
    await launchAgain('Missing document.pdf');
    await expect(page.getByRole('alert')).toContainText('Couldn’t open Missing document.pdf');
    await launchAgain(first);
    await expect(page.getByRole('button', { name: `Open PDF (${first})`, exact: true })).toBeVisible();
    await expect(page.locator('[data-page="1"] canvas')).toBeAttached();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { await app.close(); }
});
