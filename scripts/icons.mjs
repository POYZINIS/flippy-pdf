import { chromium } from '@playwright/test';
import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';

const svg = await readFile('svglol.svg', 'utf8');
const sizes = [16, 24, 32, 48, 64, 128, 256];
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const encoded = await page.evaluate(async ({ svg, sizes }) => {
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await image.decode();
    return sizes.map(size => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      canvas.getContext('2d').drawImage(image, 0, 0, size, size);
      return canvas.toDataURL('image/png').split(',')[1];
    });
  }, { svg, sizes });
  const images = encoded.map(value => Buffer.from(value, 'base64'));
  // Windows ICO directory containing a PNG representation at each size.
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, index) => {
    const entry = 6 + index * 16;
    header[entry] = header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(images[index].length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += images[index].length;
  });
  await mkdir('desktop/assets', { recursive: true });
  await writeFile('desktop/assets/icon.ico', Buffer.concat([header, ...images]));
  await writeFile('desktop/assets/icon.png', images.at(-1));
  await copyFile('svglol.svg', 'public/favicon.svg');
  console.log('Updated Windows icon, window icon, and browser favicon from svglol.svg.');
} finally { await browser.close(); }
