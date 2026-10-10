// Supplemental geometry regression using native-compiled WXML, not a WeChat simulator.
// Models the v2 default button width/padding that ordinary browser previews omit.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.WEDDING_PLAYWRIGHT_PATH || 'playwright');
const compilerPath = process.argv[2];
if (!compilerPath) throw new Error('Usage: node scripts/check-task-layout.js /path/to/miniprogram-compiler');
const compiler = require(path.resolve(compilerPath));
const root = path.resolve(__dirname, '../miniprogram');
const render = vm.runInNewContext(`(function(global){${compiler.wxmlToJs(root)}})({})`, { window: {}, console });
const output = process.env.WEDDING_SCREENSHOT_DIR || '/tmp/wedding-task-layout';
fs.mkdirSync(output, { recursive: true });
const tags = { 'wx-page': 'main', 'wx-view': 'div', 'wx-text': 'span', 'wx-button': 'button', 'wx-image': 'img', 'wx-scroll-view': 'section', 'wx-input': 'input', 'wx-picker': 'div' };
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
function html(node) {
  if (typeof node !== 'object') return escape(node);
  if (node.tag === 'wx-bottom-sheet') return node.attr.visible ? `<section class="category-sheet">${(node.children || []).map(html).join('')}</section>` : '';
  const tag = tags[node.tag];
  const children = (node.children || []).map(html).join('');
  if (!tag) return children;
  const attrs = Object.entries(node.attr || {}).filter(([key]) => ['class', 'style', 'src', 'placeholder', 'value', 'size'].includes(key)).map(([key, value]) => ` ${key}="${escape(value)}"`).join('');
  return `<${tag}${attrs}>${['input', 'img'].includes(tag) ? '' : children + `</${tag}>`}`;
}
function css(source, width) {
  return source.replace(/(?<![\w.#-])(page|view|text|image|button|input)(?![\w-])/g, tag => tags['wx-' + tag]).replace(/(-?[\d.]+)rpx/g, (_, number) => Number(number) * width / 750 + 'px');
}
const nativeButtonDefaults = 'button:not([size="mini"]){width:184px;margin:0 auto;padding:8px 24px}';
const storage = new Map();
global.wx = { getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value), showToast() {}, vibrateShort() {} };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.WEDDING_BROWSER_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    await page.route('http://wedding.local/assets/**', route => route.fulfill({ path: root + new URL(route.request().url()).pathname }));
    for (const name of ['tasks', 'home']) {
      let controller;
      global.Page = definition => { controller = definition; };
      require(path.join(root, 'pages', name, 'index.js'));
      controller.setData = function(patch) {
        for (const [key, value] of Object.entries(patch)) {
          const parts = key.split('.'); let target = this.data;
          for (const part of parts.slice(0, -1)) target = target[part] || (target[part] = {});
          target[parts.at(-1)] = value;
        }
      };
      await controller.refresh();
      const variants = name === 'tasks' ? ['pending', 'done', 'long-title'] : ['pending', 'custom-category', 'category-manager', 'category-editor'];
      for (const variant of variants) {
        if (variant === 'done') {
          await controller.toggle({ currentTarget: { dataset: { id: 'starter-1' } } });
          controller.setFilter({ currentTarget: { dataset: { key: 'done' } } });
        } else if (variant === 'long-title') {
          controller.data.tasks[0].title = '和双方家人一起确认婚礼场地、宴席菜单与当天的全部行程安排';
        } else if (variant === 'custom-category') {
          controller.addCategory(); controller.categoryName({ detail: { value: '婚礼当天亲友接送车辆安排' } });
          controller.chooseCategoryIcon({ currentTarget: { dataset: { icon: 'car' } } });
          await controller.saveCategory(); controller.closeCategories();
        } else if (variant === 'category-manager') {
          controller.manageCategories();
        } else if (variant === 'category-editor') {
          controller.editCategory({ currentTarget: { dataset: { id: controller.data.inspirations.at(-1).id } } });
        }
        for (const width of [320, 375, 430]) {
          await page.setViewportSize({ width, height: 780 });
          const styles = css(fs.readFileSync(path.join(root, 'app.wxss'), 'utf8') + fs.readFileSync(path.join(root, 'pages', name, 'index.wxss'), 'utf8'), width);
          // Put defaults last too: compact controls must win by specificity, not source order.
          await page.setContent(`<base href="http://wedding.local"><style>html,body{margin:0}button,input{font:inherit;border:0}button{display:block;text-align:center}img{object-fit:contain}.category-scroll{overflow-x:auto}.category-sheet{padding:20px;box-sizing:border-box}</style><style>${styles}</style><style>${nativeButtonDefaults}</style>${html(render('pages/' + name + '/index.wxml')(controller.data))}`);
          await page.evaluate(() => Promise.all(Array.from(document.images, image => image.decode().catch(() => {}))));
          await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished)));
          if (width === 375) await page.screenshot({ path: path.join(output, `${name}-${variant}.png`), fullPage: true });
          const metrics = await page.evaluate(name => {
            const row = document.querySelector(name === 'tasks' ? '.task-card' : '.next-task');
            const icon = row.querySelector('.checkbox');
            const text = row.querySelector(name === 'tasks' ? '.task-body' : '.task-content');
            const box = element => element.getBoundingClientRect().toJSON();
            return { row: box(row), icon: box(icon), text: box(text), radius: parseFloat(getComputedStyle(icon).borderRadius), iconColor: getComputedStyle(icon).color, filters: [...document.querySelectorAll('.filter')].map(box), chips: [...document.querySelectorAll('.category-chip')].map(box), scrollWidth: document.documentElement.scrollWidth };
          }, name);
          assert(Math.abs(metrics.icon.width - metrics.icon.height) < 1 && metrics.icon.width <= 30, `${name}/${variant}/${width}: icon must remain a small square, got ${metrics.icon.width} × ${metrics.icon.height}`);
          assert(metrics.radius < metrics.icon.width / 3, 'Checkbox must have square corners with a small radius');
          assert(metrics.text.width / metrics.row.width > .7, 'Task text must use at least 70% of the row');
          assert(metrics.text.right <= metrics.row.right, 'Long titles must wrap inside their card');
          assert(metrics.scrollWidth <= width + 1, 'Page must not overflow horizontally');
          if (name === 'tasks') {
            assert.equal(metrics.filters.length, 3);
            assert(metrics.filters.every(item => item.right <= width && Math.abs(item.y - metrics.filters[0].y) < 1), 'All status filters must fit on one line');
            assert(metrics.chips.every(item => item.width < width * .4), 'Category chips must not inherit native button width');
            if (variant === 'done') {
              assert.equal(metrics.iconColor, 'rgb(255, 255, 255)', 'Completed state must keep its visible checkmark');
              await page.emulateMedia({ reducedMotion: 'reduce' });
              assert.equal(await page.locator('.checkbox.checked').evaluate(element => getComputedStyle(element).animationName), 'none');
              await page.emulateMedia({ reducedMotion: 'no-preference' });
            }
          } else {
            const cards = await page.locator('.inspiration-card').evaluateAll(items => items.map(item => {
              const rect = item.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, right: rect.right, height: rect.height, overflow: item.scrollWidth > item.clientWidth + 1 };
            }));
            const grid = await page.locator('.inspiration-grid').boundingBox();
            assert(Math.abs(cards[0].y - cards[1].y) < 1, 'Home categories must form two columns despite native button defaults');
            assert(cards[1].x > cards[0].x && cards[2].y > cards[0].y, 'Categories must wrap after two cards');
            assert(cards[0].width / grid.width > .47 && cards[1].right >= grid.x + grid.width - 1, 'Cards must fill the available width');
            assert(cards[0].height <= 90, 'Default cards must stay compact');
            assert(cards.every(card => !card.overflow), 'Custom names must wrap without overflowing');
            if (variant === 'category-editor') {
              const options = await page.locator('.category-icon-option').evaluateAll(items => items.map(item => item.getBoundingClientRect().toJSON()));
              assert.equal(options.length, 20);
              assert(options.slice(0, 4).every(item => Math.abs(item.y - options[0].y) < 1), 'Icon picker must fit four columns');
              assert(options[4].y > options[0].y && options.every(item => item.right <= width - 19), 'Icon picker must wrap inside the sheet');
              assert.equal(await page.locator('.category-icon-option.selected').count(), 1);
              if (width === 375) await page.locator('.category-sheet').screenshot({ path: path.join(output, 'native-category-editor.png') });
            }
            if (width === 375 && variant === 'custom-category') await page.locator('.inspiration-grid').screenshot({ path: path.join(output, 'native-category-grid.png') });
          }
        }
      }
    }
    console.log('Task layout passed at 320/375/430px with v2 button defaults: square toggles, wide text, compact filters, completed state and long titles.');
    console.log('Category layout passed at 320/375/430px: compact two-column cards, full width, custom long names and 20 selectable icons in four columns. Sheet slot geometry is a browser approximation.');
  } finally { await browser.close(); delete global.wx; delete global.Page; }
})().catch(error => { console.error(error); process.exitCode = 1; });
