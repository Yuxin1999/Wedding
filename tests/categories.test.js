const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../shared/domain');
const command = (state, type, payload, id) => d.applyCommand(state, { type, payload }, id);

test('legacy plans and backups acquire default categories without changing any records', () => {
  const legacy = d.createWorkspace(); delete legacy.categories;
  const migrated = d.validateWorkspace(legacy);
  assert.deepEqual(migrated.categories.map(item => item.name), d.CATEGORIES);
  assert.deepEqual(migrated.tasks, legacy.tasks);
  assert.deepEqual(migrated.expenses, legacy.expenses);
  assert.equal(d.categoryIconId(legacy, '摄影摄像'), 'camera');
  migrated.categories[0].name = '自己的场地';
  assert.equal(d.createWorkspace().categories[0].name, '场地宴席');
});

test('new categories support tasks, linked expenses, icons and a backup round trip', () => {
  let state = command(d.createWorkspace(), 'addCategory', { name: '  蜜月旅行  ', icon: 'car' }, 'honeymoon');
  state = command(state, 'addTask', { title: '预订机票', category: '蜜月旅行', assignee: 'both', dueDate: '', done: false }, 'tickets');
  state = command(state, 'addExpense', { title: '机票定金', category: '蜜月旅行', planned: 200010, paid: 100000, taskId: 'tickets', paymentDueDate: '2028-05-01' }, 'deposit');
  assert.equal(d.categoryIconId(state, '蜜月旅行'), 'car');
  assert.equal(d.taskBudget(state, 'tickets').count, 1);
  assert.deepEqual(d.validateWorkspace(JSON.parse(JSON.stringify(state))), state);
  const before = structuredClone(state);
  state = command(state, 'updateCategory', { id: 'honeymoon', name: '我们的蜜月', icon: 'heart' });
  assert.equal(state.tasks.at(-1).category, '我们的蜜月');
  assert.equal(state.expenses[0].category, '我们的蜜月');
  assert.equal(d.categoryIconId(state, '我们的蜜月'), 'heart');
  assert.deepEqual({ ...state.expenses[0], category: '蜜月旅行' }, before.expenses[0]);
  assert.equal(before.categories.at(-1).name, '蜜月旅行');
  assert.throws(() => command(state, 'updateTask', { id: 'tickets', category: '蜜月旅行' }), /有效分类/);
});

test('category validation rejects duplicate names and IDs, reserved names, invalid icons and limits', () => {
  const state = d.createWorkspace();
  for (const name of ['', '全部', '场地宴席', '这个分类名称超过十二个汉字限制']) {
    assert.throws(() => command(state, 'addCategory', { name, icon: 'car' }, 'new'), { code: 'VALIDATION' });
  }
  assert.throws(() => command(state, 'addCategory', { name: '蜜月', icon: 'car' }, state.categories[0].id), /编号重复/);
  assert.throws(() => command(state, 'updateCategory', { id: state.categories[0].id, name: '其他' }), /已经存在/);
  for (const icon of ['../config', 'https://example.com/image', '', null]) assert.throws(() => command(state, 'addCategory', { name: '蜜月', icon }, 'new'), /可用图标/);
  let full = state;
  for (let i = 6; i < 24; i++) full = command(full, 'addCategory', { name: `分类${i}`, icon: 'rings' }, `custom-${i}`);
  assert.throws(() => command(full, 'addCategory', { name: '太多了', icon: 'car' }, 'overflow'), /24/);
  assert.throws(() => d.validateWorkspace({ ...state, categories: [] }), /保留/);
  assert.throws(() => d.validateWorkspace({ ...state, categories: null }), /保留/);
  assert.throws(() => d.validateWorkspace({ ...state, categories: state.categories.slice(1) }), /有效分类/);
  assert.deepEqual(state, d.createWorkspace(), 'Rejected operations must not alter source records');
});

test('deletion protects populated categories and the last category but permits removing empty ones', () => {
  let state = d.createWorkspace();
  assert.throws(() => command(state, 'deleteCategory', { id: state.categories[0].id }), /移到其他分类/);
  state = command(state, 'addCategory', { name: '蜜月', icon: 'car' }, 'empty');
  const empty = state;
  state = command(state, 'addExpense', { title: '酒店', category: '蜜月', planned: 0, paid: 0 }, 'hotel');
  assert.throws(() => command(state, 'deleteCategory', { id: 'empty' }), /移到其他分类/);
  assert.equal(command(empty, 'deleteCategory', { id: 'empty' }).categories.length, 6);
  assert.throws(() => command(empty, 'updateCategory', { id: 'missing', name: '无效' }), { code: 'NOT_FOUND' });
  const single = { ...state, tasks: [], expenses: [], categories: [state.categories[0]] };
  assert.throws(() => command(single, 'deleteCategory', { id: single.categories[0].id }), /保留/);
});

test('every selectable category icon has an illustration in the generated catalog', () => {
  const ids = require('../miniprogram/utils/illustration-catalog').map(item => item.id).sort();
  assert.deepEqual(d.CATEGORY_ICONS.map(item => item.id).sort(), ids);
});
