// Render our SVG source assets to PNG for native WeChat image compatibility.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.WEDDING_PLAYWRIGHT_PATH || 'playwright');
const { createServer } = require('./serve-web');
const root = path.resolve(__dirname, '../miniprogram/assets/illustrations');
const server = createServer();
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.WEDDING_BROWSER_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
    for (const item of manifest) {
      const data = await page.evaluate(async id => {
        const image = new Image(); image.src = `/assets/illustrations/${id}.svg`; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth * 2; canvas.height = image.naturalHeight * 2;
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/png').split(',')[1];
      }, item.id);
      fs.writeFileSync(path.join(root, `${item.id}.png`), Buffer.from(data, 'base64'));
    }
    console.log(`Rendered ${manifest.length} PNG illustrations from SVG source.`);
  } finally { if (browser) await browser.close(); server.closeAllConnections(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
