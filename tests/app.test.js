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

test('native task-budget navigation, binding, reminders and deletion preserve existing money', async () => {
  const wx = makeWx(); global.wx = wx;
  const tasks = page('tasks', wx); await tasks.refresh();
  tasks.openBudget({ currentTarget: { dataset: { id: 'starter-4' } } });
  const budget = page('budget', wx); await budget.onShow();
  assert.equal(budget.data.taskFilter, 'starter-4');
  budget.openAdd();
  assert.equal(budget.data.form.taskId, 'starter-4');
  assert.equal(budget.data.form.category, '摄影摄像');
  budget.setData({ 'form.title': '摄影定金', 'form.plannedInput': '2000.10', 'form.paidInput': '1000.05' });
  budget.choosePaymentDate({ detail: { value: '2000-01-01' } }); await budget.save();
  const deposit = budget.data.expenses[0];
  assert.equal(deposit.paymentOverdue, true);
  budget.openAdd(); budget.setData({ 'form.title': '摄影尾款', 'form.plannedInput': '6000.20' }); await budget.save();
  await tasks.refresh();
  assert.equal(tasks.data.tasks.find(item => item.id === 'starter-4').budget.plannedText, '8,000.30');
  const home = page('home', wx); await home.refresh();
  assert.equal(home.data.paymentReminderCount, 1);
  home.openPayment({ currentTarget: { dataset: { id: deposit.id } } }); await budget.onShow();
  assert.equal(budget.data.editingId, deposit.id);
  budget.setData({ 'form.paidInput': '2000.10' }); await budget.save();
  await home.refresh(); assert.equal(home.data.paymentReminderCount, 0);
  budget.openTask({ currentTarget: { dataset: { id: 'starter-4' } } }); await tasks.onShow();
  assert.equal(tasks.data.editingId, 'starter-4');
  tasks.setData({ 'form.title': '预约摄影' }); await tasks.save(); await budget.refresh();
  assert.equal(budget.data.expenses[0].taskTitle, '预约摄影');
  budget.openEdit({ currentTarget: { dataset: { id: deposit.id } } }); budget.chooseTask({ detail: { value: 0 } }); await budget.save();
  assert.equal(budget.data.expenses.find(item => item.id === deposit.id).taskId, '');
  tasks.openEdit({ currentTarget: { dataset: { id: 'starter-4' } } }); await tasks.remove();
  await budget.refresh();
  assert.equal(budget.data.expenses.length, 2);
  assert.ok(budget.data.expenses.every(item => !item.taskId));
  assert.equal(budget.data.stats.planned, 800030);
  delete global.wx;
});

test('native categories can be added, selected, renamed across pages, reloaded and safely deleted', async () => {
  const wx = makeWx(); global.wx = wx;
  const event = id => ({ currentTarget: { dataset: { id } } });
  const home = page('home', wx); await home.refresh(); home.addCategory();
  home.categoryName({ detail: { value: '蜜月旅行' } });
  home.chooseCategoryIcon({ currentTarget: { dataset: { icon: 'car' } } }); await home.saveCategory();
  assert.equal(home.data.categoryMode, 'list');
  const category = home.data.inspirations.at(-1);
  assert.equal(category.name, '蜜月旅行'); assert.match(category.illustration, /car.png$/);
  home.openCategory({ currentTarget: { dataset: { category: category.name } } });
  const tasks = page('tasks', wx); await tasks.onShow();
  assert.equal(tasks.data.category, category.name); assert.equal(tasks.data.tasks.length, 0);
  tasks.openAdd(); assert.equal(tasks.data.form.category, category.name);
  tasks.setData({ 'form.title': '预订蜜月机票' }); await tasks.save();
  const task = tasks.data.tasks[0]; assert.match(task.illustration, /car.png$/);
  tasks.openBudget(event(task.id));
  const budget = page('budget', wx); await budget.onShow(); budget.openAdd();
  assert.equal(budget.data.form.category, category.name);
  budget.setData({ 'form.title': '机票', 'form.plannedInput': '1000', 'form.paymentDueDate': '2028-05-01' }); await budget.save();
  assert.equal(budget.data.expenses[0].category, category.name);
  await home.refresh(); home.manageCategories(); home.editCategory(event(category.id));
  assert.equal(home.data.canDeleteCategory, false);
  home.categoryName({ detail: { value: '蜜月安排' } });
  home.chooseCategoryIcon({ currentTarget: { dataset: { icon: 'heart' } } }); await home.saveCategory();
  await tasks.refresh(); await budget.refresh();
  assert.equal(tasks.data.category, '全部', 'A renamed active filter resets safely');
  assert.equal(tasks.data.tasks.find(item => item.id === task.id).category, '蜜月安排');
  assert.equal(budget.data.expenses[0].taskId, task.id);
  assert.equal(budget.data.expenses[0].paymentDueDate, '2028-05-01');
  assert.match(budget.data.expenses[0].illustration, /heart.png$/);
  assert.equal(budget.data.breakdown[0].name, '蜜月安排');
  const reload = page('home', wx); await reload.refresh(); assert.equal(reload.data.inspirations.at(-1).name, '蜜月安排');
  reload.addCategory(); reload.categoryName({ detail: { value: '蜜月安排' } }); await reload.saveCategory();
  assert.equal(reload.data.categoryMode, 'edit'); assert.match(reload.data.categoryError, /已经存在/);
  reload.categoryName({ detail: { value: '空分类' } }); await reload.saveCategory();
  reload.editCategory(event(reload.data.inspirations.at(-1).id)); assert.equal(reload.data.canDeleteCategory, true);
  await reload.removeCategory(); assert.equal(reload.data.inspirations.length, 7);
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
