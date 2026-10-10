// Optional: use Tencent's Linux-capable compiler wrapper without adding frontend dependencies.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const compilerPath = process.argv[2];
if (!compilerPath) {
  console.error('Usage: node scripts/check-native-templates.js /path/to/node_modules/miniprogram-compiler');
  process.exit(1);
}
const compilerRoot = path.resolve(compilerPath);
const compiler = require(compilerRoot);
const mini = path.resolve(__dirname, '../miniprogram');
const config = JSON.parse(fs.readFileSync(path.join(mini, 'app.json'), 'utf8'));

(async () => {
  const source = compiler.wxmlToJs(mini);
  const context = vm.createContext({ window: {}, console });
  const render = vm.runInContext(`(function(global){${source}})({})`, context);
  const storage = new Map();
  const domain = require('../shared/domain');
  const initial = domain.applyCommand(domain.createWorkspace(), { type: 'addExpense', payload: { title: '摄影定金', category: '摄影摄像', planned: 200000, paid: 100000, taskId: 'starter-4', paymentDueDate: '2000-01-01', note: '' } }, 'compile-linked-expense');
  storage.set('wedding:local:v1', initial);
  global.wx = {
    getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value),
    showToast() {}, vibrateShort() {}, switchTab() {}
  };
  // Use real page controllers to produce the data supplied to native-compiled templates.
  for (const pagePath of config.pages) {
    let page;
    global.Page = definition => { page = definition; };
    require(path.join(mini, pagePath + '.js'));
    page.data = JSON.parse(JSON.stringify(page.data));
    page.setData = function(patch) {
      for (const [key, value] of Object.entries(patch)) {
        const parts = key.split('.'); let parent = this.data;
        for (const segment of parts.slice(0, -1)) parent = parent[segment] || (parent[segment] = {});
        parent[parts[parts.length - 1]] = value;
      }
    };
    await page.refresh();
    assert.equal(page.data.ready, true, pagePath);
    let tree = render(pagePath + '.wxml')(page.data);
    assert.ok(tree.children.length, pagePath);
    if (page.openAdd) { page.openAdd(); tree = render(pagePath + '.wxml')(page.data); }
    else if (page.openEditor) { page.openEditor(); tree = render(pagePath + '.wxml')(page.data); }
    else if (page.addCategory) {
      page.manageCategories(); tree = render(pagePath + '.wxml')(page.data);
      assert.match(JSON.stringify(tree), /category-manage-row/);
      page.addCategory(); tree = render(pagePath + '.wxml')(page.data);
      assert.match(JSON.stringify(tree), /category-icon-option/);
    }
    assert.ok(tree.children.length, `${pagePath} editor`);
    page.render(Object.assign({}, page._snapshot, { mode: 'cloud', configured: true, memberCount: 2, role: 'p2', lastChange: { actor: 'p1', text: '更新了备婚清单', at: Date.now() } }));
    tree = render(pagePath + '.wxml')(page.data);
    assert.match(JSON.stringify(tree), /shared-sync-bar/, `${pagePath} shared status`);
    if (page.invite) {
      assert.match(JSON.stringify(tree), /member-card/);
      page.render(Object.assign({}, page._snapshot, { memberCount: 1, role: 'p1' }));
      page.setData({ inviteCode: 'ABCDEFGHJK23', inviteExpiresLabel: '10月17日 12:00' });
      assert.match(JSON.stringify(render(pagePath + '.wxml')(page.data)), /invite-share/);
    }
    console.log(`Native WXML compiled + render tree produced: ${pagePath}`);
  }
  for (const closing of [false, true]) {
    const sheet = render('components/bottom-sheet/index.wxml')({ mounted: true, closing, title: '安排', busy: false });
    assert.match(JSON.stringify(sheet), /sheet-panel/, 'Sheet must render throughout entry and exit');
  }
  delete global.wx; delete global.Page;

  const platform = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'windows' : 'linux';
  const binary = path.join(compilerRoot, 'bin', platform, platform === 'windows' ? 'wcsc.exe' : 'wcsc');
  const styles = config.pages.map(page => page + '.wxss').concat(['components/bottom-sheet/index.wxss', 'app.wxss']);
  const result = spawnSync(binary, ['-db', '-pc', '5', ...styles], { cwd: mini, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.length > 100, 'No WXSS output');
  console.log(`Native WXSS compile passed: ${styles.length} stylesheets.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
