const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.WEDDING_PLAYWRIGHT_PATH || 'playwright');
const { createServer } = require('./serve-web');
const server = createServer();
const output = process.env.WEDDING_SCREENSHOT_DIR || '/tmp/wedding-web-check';
fs.mkdirSync(output, { recursive: true });

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.WEDDING_BROWSER_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, timezoneId: 'Asia/Shanghai', acceptDownloads: true });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { waitUntil: 'networkidle' });
    assert.equal(await page.getByRole('heading', { name: '我们的备婚手账', exact: true }).count(), 1);
    assert.equal(await page.locator('.category-card').count(), 6);
    assert.equal(await page.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)), true);
    await page.screenshot({ path: path.join(output, 'desktop-home.png'), fullPage: true });

    await page.locator('.page-heading').getByRole('button', { name: '编辑我们的约定' }).click();
    await page.getByLabel('你的称呼', { exact: true }).fill('小雨');
    await page.getByLabel('伴侣的称呼', { exact: true }).fill('阿辰');
    await page.locator('input[name="weddingDate"]').fill('2028-05-20');
    await page.getByLabel('婚礼城市 / 场地', { exact: true }).fill('杭州');
    await page.getByLabel('婚礼总预算（元）', { exact: true }).fill('100000.50');
    await page.getByRole('button', { name: '保存这份安排', exact: true }).click();
    await page.waitForFunction(() => !document.getElementById('editor').open);
    assert.match(await page.locator('.hero-date').textContent(), /2028 . 05 . 20/);

    await page.locator('[data-nav="tasks"]').click();
    await page.getByRole('button', { name: '＋ 记一件小事', exact: true }).click();
    await page.getByLabel('想做什么', { exact: true }).fill('周末一起挑对戒');
    await page.getByRole('combobox', { name: '收进哪个小抽屉', exact: true }).selectOption('其他');
    await page.locator('.assignee-choices label').filter({ hasText: '阿辰' }).click();
    await page.locator('input[name="dueDate"]').fill('2028-02-14');
    await page.getByRole('button', { name: '保存这份安排', exact: true }).click();
    const toggle = page.getByRole('checkbox', { name: '完成：周末一起挑对戒', exact: true }); await toggle.waitFor();
    await toggle.click();
    await page.getByRole('button', { name: '已完成', exact: true }).click();
    assert.equal(await page.getByRole('checkbox', { name: '重新打开：周末一起挑对戒', exact: true }).getAttribute('aria-checked'), 'true');
    await page.getByRole('button', { name: '编辑：周末一起挑对戒', exact: true }).click();
    await page.getByLabel('想补充的话', { exact: true }).fill('一起试戴尺寸');
    await page.getByRole('button', { name: '保存这份安排', exact: true }).click();
    await page.getByLabel('搜索任务').fill('挑对戒');
    await page.getByLabel('按负责人筛选').selectOption('p1');
    assert.match(await page.locator('#task-list').textContent(), /这里暂时没有小事/);
    await page.getByLabel('按负责人筛选').selectOption('p2');
    assert.match(await page.locator('#task-list').textContent(), /一起试戴尺寸/);
    await page.screenshot({ path: path.join(output, 'desktop-tasks.png'), fullPage: true });

    await page.locator('[data-nav="budget"]').click();
    await page.getByRole('button', { name: '＋ 记一笔心意', exact: true }).click();
    await page.getByLabel('这笔开支叫什么', { exact: true }).fill('婚礼摄影');
    await page.getByRole('combobox', { name: '收进哪个小抽屉', exact: true }).selectOption('摄影摄像');
    await page.getByLabel('预计总金额（元）', { exact: true }).fill('8000.20');
    await page.getByLabel('已付金额（元）', { exact: true }).fill('2000.10');
    await page.getByRole('button', { name: '保存这份安排', exact: true }).click();
    assert.match(await page.locator('.expense-list-card').textContent(), /8,000.20/);
    await page.getByRole('button', { name: '＋ 记一笔心意', exact: true }).click();
    await page.getByLabel('这笔开支叫什么', { exact: true }).fill('金额精度校验');
    await page.getByLabel('预计总金额（元）', { exact: true }).fill('0.001');
    await page.getByRole('button', { name: '保存这份安排', exact: true }).click();
    assert.match(await page.locator('#form-error').textContent(), /两位小数/);
    await page.getByLabel('预计总金额（元）', { exact: true }).fill('0.10');
    await page.getByRole('button', { name: '保存这份安排', exact: true }).click();
    assert.match(await page.locator('.mini-stat').first().textContent(), /8,000.30/);
    await page.reload({ waitUntil: 'networkidle' });
    assert.match(await page.locator('.mini-stat').first().textContent(), /8,000.30/);
    assert.match(await page.locator('.mini-stat').last().textContent(), /2,000.10/);
    await page.screenshot({ path: path.join(output, 'desktop-budget.png'), fullPage: true });

    await page.locator('[data-nav="together"]').click();
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: /收好一份备份/ }).click();
    const download = await downloaded; const backup = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.equal(backup.workspace.profile.name1, '小雨'); assert.equal(backup.workspace.tasks.length, 13);
    await page.locator('#import-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('数据格式不兼容'));
    assert.match(await page.locator('.couple-poster').textContent(), /小雨/);
    await page.getByRole('button', { name: /翻翻插画小册/ }).click();
    await page.locator('.illustration-gallery').waitFor(); assert.equal(await page.locator('.illustration-gallery img').count(), 20);
    await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    await page.screenshot({ path: path.join(output, 'desktop-together.png'), fullPage: true });

    const other = await context.newPage(); other.on('pageerror', error => errors.push(error.message));
    await other.goto(base + '/#together');
    await page.locator('.page-heading').getByRole('button', { name: '编辑我们的约定' }).click();
    await other.locator('.page-heading').getByRole('button', { name: '编辑我们的约定' }).click();
    await other.getByLabel('婚礼城市 / 场地', { exact: true }).fill('上海');
    await other.getByRole('button', { name: '保存这份安排', exact: true }).click();
    await page.getByLabel('婚礼城市 / 场地', { exact: true }).fill('苏州');
    await page.getByRole('button', { name: '保存这份安排', exact: true }).click();
    assert.match(await page.locator('#form-error').textContent(), /另一个标签页/);
    assert.match(await page.locator('.couple-poster').textContent(), /上海/);
    await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    await other.close();

    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Asia/Shanghai' });
    const mobile = await mobileContext.newPage(); mobile.on('pageerror', error => errors.push(error.message));
    await mobile.goto(base, { waitUntil: 'networkidle' });
    await mobile.screenshot({ path: path.join(output, 'mobile-home.png'), fullPage: true });
    for (const route of ['home', 'tasks', 'budget', 'together']) {
      await mobile.locator(`[data-nav="${route}"]`).click();
      assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Horizontal overflow: ${route}`);
    }
    await mobile.locator('.page-heading').getByRole('button', { name: '编辑我们的约定' }).click();
    await mobile.getByLabel('你的称呼', { exact: true }).fill('手机测试');
    await mobile.getByRole('button', { name: '保存这份安排', exact: true }).click();
    assert.match(await mobile.locator('.couple-poster').textContent(), /手机测试/);
    await mobile.reload({ waitUntil: 'networkidle' }); assert.match(await mobile.locator('.couple-poster').textContent(), /手机测试/);
    assert.deepEqual(errors, []);
    console.log('Browser checks passed: desktop/mobile navigation, profile/date, task edit/assignment/completion/filtering, budget precision, invalid input, reload persistence, backup export, invalid import preservation, 20-icon gallery, cross-tab conflict and no runtime errors.');
    console.log(`Screenshots: ${output}`);
  } finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; server.closeAllConnections(); server.close(); });
