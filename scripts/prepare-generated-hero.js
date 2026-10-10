// Keep the generated original unchanged; encode a WebP delivery asset for the mini program's package budget.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.WEDDING_PLAYWRIGHT_PATH || 'playwright');
(async () => {
  const root = path.resolve(__dirname, '..');
  const original = fs.readFileSync(path.join(root, 'design/wedding-hero.original.png')).toString('base64');
  const browser = await chromium.launch({ executablePath: process.env.WEDDING_BROWSER_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    const result = await page.evaluate(async base64 => {
      const image = new Image(); image.src = 'data:image/png;base64,' + base64; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      canvas.getContext('2d').drawImage(image, 0, 0);
      return { data: canvas.toDataURL('image/webp', 0.9).split(',')[1], width: canvas.width, height: canvas.height };
    }, original);
    const asset = Buffer.from(result.data, 'base64');
    if (asset.subarray(8, 12).toString() !== 'WEBP') throw new Error('Browser did not produce WebP');
    fs.writeFileSync(path.join(root, 'miniprogram/assets/illustrations/wedding-hero.webp'), asset);
    console.log(`Generated hero delivery asset: ${result.width} × ${result.height}, ${asset.length} bytes; original preserved.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
