import { test, expect } from '@playwright/test';
import { pdfFile } from './pdf-fixture.js';

async function upload(page, file = pdfFile()) {
  await page.getByLabel('Choose a PDF', { exact: true }).setInputFiles(file);
  await expect(page.getByRole('group', { name: 'PDF controls' })).toBeVisible();
  await expect(page.locator('.book-view')).toHaveAttribute('data-busy', 'false');
}

test('minimal UI, persistent theme, drop import, curved turns and mouse navigation', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('/');
  await expect(page.getByRole('heading')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Drop or choose a PDF' })).toBeVisible();
  await page.getByRole('button', { name: 'Dark mode' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: info.outputPath('dark-empty.png') });
  const file = pdfFile();
  const transfer = await page.evaluateHandle(({ data, name }) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(data)], name, { type: 'application/pdf' }));
    return dt;
  }, { data: [...file.buffer], name: file.name });
  await page.locator('.app').dispatchEvent('dragenter', { dataTransfer: transfer });
  await expect(page.locator('.app')).toHaveClass(/is-dragging/);
  await page.locator('.app').dispatchEvent('drop', { dataTransfer: transfer });
  await transfer.dispose();
  await expect(page.locator('.book-view')).toHaveAttribute('data-busy', 'false');
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.locator('.book-view')).toHaveAttribute('data-turn', /0\.[2-8]/);
  await page.screenshot({ path: info.outputPath('curved-turn.png') });
  await expect(page.getByRole('textbox', { name: 'Page number' })).toHaveValue('2');
  await expect(page.locator('.book-view')).toHaveAttribute('data-busy', 'false');
  await page.screenshot({ path: info.outputPath('dark-book.png') });
  const book = page.locator('.book-view');
  const box = await book.boundingBox();
  // Left-drag on empty space pans the book…
  await page.mouse.move(box.x + 16, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 136, box.y + box.height / 2 - 60, { steps: 10 });
  await page.mouse.up();
  await expect(book).not.toHaveAttribute('data-pan', '0,0');
  await page.getByRole('button', { name: 'Fit to window' }).click();
  await expect(book).toHaveAttribute('data-pan', '0,0');
  // …but left-drag on a page never pans — the gesture belongs to page turns.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 140, box.y + box.height / 2 + 70, { steps: 10 });
  await page.mouse.up();
  await expect(book).toHaveAttribute('data-pan', '0,0');
  await expect(page.getByRole('textbox', { name: 'Page number' })).toHaveValue('2');
  // Wait for the cancelled turn's snap-back animation to fully settle.
  await page.waitForFunction(() => !document.querySelector('.book-view')?.dataset.turn);
  // Middle-drag pans from anywhere, even directly over a page.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(box.x + box.width / 2 - 110, box.y + box.height / 2 - 50, { steps: 8 });
  await page.mouse.up({ button: 'middle' });
  await expect(book).not.toHaveAttribute('data-pan', '0,0');
  await page.getByRole('button', { name: 'Fit to window' }).click();
  await expect(book).toHaveAttribute('data-pan', '0,0');
  await book.hover();
  await page.mouse.wheel(0, -300);
  await expect(page.getByRole('button', { name: 'Fit to window' })).not.toHaveText('100%');
  await page.getByRole('button', { name: 'Fit to window' }).click();
  await expect(page.getByRole('button', { name: 'Fit to window' })).toHaveText('100%');
  await page.getByRole('button', { name: 'Light mode' }).click();
  await page.screenshot({ path: info.outputPath('light-book.png') });
  await page.getByRole('textbox', { name: 'Page number' }).fill('4');
  await page.getByRole('textbox', { name: 'Page number' }).press('Enter');
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
  await upload(page, pdfFile('Replacement.pdf', 1));
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Close PDF' }).click();
  await expect(page.getByRole('button', { name: 'Drop or choose a PDF' })).toBeVisible();
  expect(errors).toEqual([]);
  expect(requests.filter(url => /^https?:/.test(url) && !url.startsWith('http://127.0.0.1:4173'))).toEqual([]);
});

test('scroll view uses native wheel scrolling, lazy pages, zoom and retained position', async ({ page }, info) => {
  await page.goto('/');
  await upload(page, pdfFile('Long.pdf', 30));
  await page.getByRole('textbox', { name: 'Page number' }).fill('12');
  await page.getByRole('textbox', { name: 'Page number' }).press('Enter');
  await expect(page.getByRole('textbox', { name: 'Page number' })).toHaveValue('12');
  await page.getByRole('button', { name: 'Scroll view' }).click();
  const scroll = page.locator('.scroll-view');
  await expect(scroll).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Page number' })).toHaveValue('12');
  await expect(page.locator('[data-page="12"] canvas')).toBeAttached();
  expect(await page.locator('.scroll-page canvas').count()).toBeLessThan(10);
  const before = await scroll.evaluate(el => el.scrollTop);
  await scroll.hover();
  await page.mouse.wheel(0, 800);
  await expect.poll(() => scroll.evaluate(el => el.scrollTop)).toBeGreaterThan(before);
  await expect(page.getByRole('button', { name: 'Fit to window' })).toHaveText('100%');
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Fit to window' })).toHaveText('120%');
  await page.screenshot({ path: info.outputPath('scroll-view.png') });
  const current = Number(await page.getByRole('textbox', { name: 'Page number' }).inputValue());
  await page.getByRole('button', { name: 'Book view' }).click();
  await expect(page.locator('.book-view')).toHaveAttribute('data-busy', 'false');
  expect(Math.abs(Number(await page.getByRole('textbox', { name: 'Page number' }).inputValue()) - current)).toBeLessThanOrEqual(1);
});

test('invalid files recover, closing during import releases the document', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByLabel('Choose a PDF', { exact: true }).setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Hello') });
  await expect(page.getByRole('alert')).toContainText('Choose a PDF');
  await page.getByLabel('Choose a PDF', { exact: true }).setInputFiles({ name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('broken') });
  await expect(page.getByRole('alert')).toContainText('Couldn’t read');
  await upload(page);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close PDF' }).click();
  await page.getByLabel('Choose a PDF', { exact: true }).setInputFiles(pdfFile('Many.pdf', 80));
  await page.getByRole('button', { name: 'Close PDF' }).click();
  await upload(page, pdfFile('After cancellation.pdf', 2));
  expect(errors).toEqual([]);
});

test('mobile, reduced motion, keyboard navigation, and edge dragging', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await upload(page);
  await page.locator('.book-view').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('textbox', { name: 'Page number' })).toHaveValue('2');
  await expect(page.locator('.book-view')).toHaveAttribute('data-busy', 'false');
  await page.screenshot({ path: info.outputPath('mobile-book.png') });
  const box = await page.locator('.book-view').boundingBox();
  await page.mouse.move(box.x + box.width - 36, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 30, box.y + box.height / 2, { steps: 15 });
  await page.mouse.up();
  await expect(page.getByRole('textbox', { name: 'Page number' })).toHaveValue('3');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('bundled 33 MB PDF renders through the new book and scroll engines', async ({ page }, info) => {
  test.setTimeout(60000);
  await page.goto('/');
  await page.getByLabel('Choose a PDF', { exact: true }).setInputFiles('public/sample.pdf');
  await expect(page.locator('.book-view')).toHaveAttribute('data-busy', 'false', { timeout: 30000 });
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Page number' })).toHaveValue('2', { timeout: 15000 });
  await expect(page.locator('.book-view')).toHaveAttribute('data-busy', 'false');
  await page.screenshot({ path: info.outputPath('sample-book.png') });
  await page.getByRole('button', { name: 'Scroll view' }).click();
  await expect(page.locator('[data-page="2"] canvas')).toBeAttached({ timeout: 15000 });
  await page.getByRole('button', { name: 'Close PDF' }).click();
  await expect(page.getByRole('button', { name: 'Drop or choose a PDF' })).toBeVisible();
});

test('rapid scrolling, zoom changes and repeated view switches cancel obsolete page work', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await upload(page, pdfFile('Navigation.pdf', 80));
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.getByRole('button', { name: 'Scroll view' }).click();
    for (const number of [60, 4, 72, 20]) {
      await page.getByRole('textbox', { name: 'Page number' }).fill(String(number));
      await page.getByRole('textbox', { name: 'Page number' }).press('Enter');
    }
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect(page.locator('[data-page="20"] canvas')).toBeAttached();
    expect(await page.locator('.scroll-page canvas').count()).toBeLessThan(8);
    await expect.poll(() => page.locator('[data-page="60"] canvas').count()).toBe(0);
    await page.getByRole('button', { name: 'Book view' }).click();
    await expect(page.locator('.book-view')).toHaveAttribute('data-busy', 'false');
    await expect(page.locator('canvas')).toHaveCount(1);
  }
  await page.getByRole('button', { name: 'Close PDF' }).click();
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('graphics context loss recovers discarded book rasters in scroll view', async ({ page }) => {
  await page.goto('/');
  await upload(page);
  await page.locator('.book-view canvas').evaluate(canvas => {
    canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext();
  });
  await expect(page.locator('.scroll-view')).toBeVisible();
  await expect(page.locator('[data-page="1"] canvas')).toBeAttached();
  expect(await page.locator('[data-page="1"] canvas').evaluate(canvas => canvas.width)).toBeGreaterThan(0);
});
