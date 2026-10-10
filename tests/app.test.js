const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function makeWx() {
  const storage = new Map();
  return {
    storage, toasts: [], clipboard: '',
    getStorageSync(key) { return structuredClone(storage.get(key)); },
    setStorageSync(key, value) { storage.set(key, structuredClone(value)); },
    showToast(args) { this.toasts.push(args.title); },
    showModal(args) { args.success && args.success({ confirm: true }); },
    setClipboardData(args) { this.clipboard = args.data; },
    stopPullDownRefresh() {}, switchTab() {}, vibrateShort() {}
  };
}
function page(name, wx) {
  const file = path.resolve(__dirname, `../miniprogram/pages/${name}/index.js`);
  let definition;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { require: createRequire(file), wx, Page(value) { definition = value; } }, { filename: file });
  definition.data = JSON.parse(JSON.stringify(definition.data));
  definition.setData = function(patch) {
    for (const [key, value] of Object.entries(patch)) {
      const parts = key.split('.'); let target = this.data;
      for (const part of parts.slice(0, -1)) target = target[part] || (target[part] = {});
      target[parts.at(-1)] = value;
    }
  };
  return definition;
}

test('local user journey: set wedding, add/complete task, track expenses, reload and export', async () => {
  const wx = makeWx(); global.wx = wx;
  const together = page('together', wx); await together.refresh();
  assert.equal(together.data.mode, 'local');
  assert.equal(together.data.configured, false);
  together.openEditor();
  together.setData({ 'form.name1': '小雨', 'form.name2': '阿辰', 'form.weddingDate': '2027-05-20', 'form.location': '杭州', 'form.budgetInput': '100000.50' });
  await together.save();
  assert.equal(together.data.profile.totalBudget, 10000050);
  assert.equal(together.data.editor, false);

  const tasks = page('tasks', wx); await tasks.refresh(); tasks.openAdd();
  tasks.setData({ 'form.title': '一起挑对戒', 'form.assignee': 'p2', 'form.dueDate': '2027-02-14' }); await tasks.save();
  const rings = tasks.data.tasks.find(task => task.title === '一起挑对戒');
  assert.equal(rings.owner, '阿辰');
  await tasks.toggle({ currentTarget: { dataset: { id: rings.id } } });
  assert.equal(tasks.data.stats.done, 1);
  tasks.setFilter({ currentTarget: { dataset: { key: 'done' } } });
  assert.equal(tasks.data.tasks.length, 1);
  tasks.openEdit({ currentTarget: { dataset: { id: rings.id } } });
  tasks.setData({ 'form.note': '已选好尺寸' }); await tasks.save();

  const budget = page('budget', wx); await budget.refresh(); budget.openAdd();
  budget.setData({ 'form.title': '婚礼摄影', 'form.plannedInput': '8000.20', 'form.paidInput': '2000.10' }); await budget.save();
  assert.equal(budget.data.stats.planned, 800020);
  assert.equal(budget.data.stats.paid, 200010);
  assert.equal(budget.data.expenses.length, 1);

  const home = page('home', wx); await home.refresh();
  assert.equal(home.data.profile.weddingDate, '2027-05-20');
  assert.equal(home.data.stats.done, 1);
  assert.equal(home.data.stats.paidText, '2,000.10');
  const reloaded = page('together', wx); await reloaded.refresh(); reloaded.copySummary();
  assert.match(wx.clipboard, /小雨 & 阿辰/);
  assert.match(wx.clipboard, /✓ 一起挑对戒/);
  assert.match(wx.clipboard, /婚礼摄影/);
  assert.equal(wx.toasts.filter(title => /失败|不正确/.test(title)).length, 0);
  delete global.wx;
});

test('invalid input stays in the editor and leaves stored data unchanged', async () => {
  const wx = makeWx(); global.wx = wx;
  const budget = page('budget', wx); await budget.refresh(); budget.openAdd();
  budget.setData({ 'form.title': '错误金额', 'form.plannedInput': '2.999' }); await budget.save();
  assert.equal(budget.data.editor, true); assert.equal(budget.data.saving, false);
  assert.equal(budget.data.expenses.length, 0);
  assert.match(wx.toasts.at(-1), /两位小数/);
  const tasks = page('tasks', wx); await tasks.refresh(); tasks.openAdd(); await tasks.save();
  assert.equal(tasks.data.editor, true);
  assert.equal(tasks.data.stats.total, 12);
  delete global.wx;
});

test('deletion updates task and expense totals', async () => {
  const wx = makeWx(); global.wx = wx;
  const tasks = page('tasks', wx); await tasks.refresh();
  tasks.openEdit({ currentTarget: { dataset: { id: 'starter-1' } } }); await tasks.remove();
  assert.equal(tasks.data.stats.total, 11); assert.equal(tasks.data.editor, false);
  const budget = page('budget', wx); await budget.refresh(); budget.openAdd();
  budget.setData({ 'form.title': '删除试算', 'form.plannedInput': '200', 'form.paidInput': '100' }); await budget.save();
  budget.openEdit({ currentTarget: { dataset: { id: budget.data.expenses[0].id } } }); await budget.remove();
  assert.equal(budget.data.stats.planned, 0); assert.equal(budget.data.stats.paid, 0);
  delete global.wx;
});

test('cloud save failure never silently saves a local copy or claims success', async () => {
  const wx = makeWx(); wx.setStorageSync('wedding:mode:v1', 'cloud');
  const initial = require('../shared/domain').createWorkspace();
  wx.cloud = { async callFunction({ data }) {
    if (data.action === 'status') return { result: { ok: true, data: { connected: true, workspace: initial, revision: 9, role: 'p1', memberCount: 2 } } };
    throw new Error('network unavailable');
  } };
  const file = path.resolve(__dirname, '../miniprogram/utils/store.js');
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { wx, module, require(name) { return name === '../config' ? { cloudEnv: 'test-environment' } : require('../miniprogram/utils/domain'); } });
  const store = module.exports;
  await store.getSnapshot();
  await assert.rejects(store.mutate({ type: 'updateTask', payload: { id: 'starter-1', done: true } }, 9), /未确认保存结果/);
  assert.equal(wx.storage.has('wedding:local:v1'), false);
  assert.equal(store.mode(), 'cloud');
});
