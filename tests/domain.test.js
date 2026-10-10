const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../shared/domain');

test('a new couple can start without a wedding date or budget', () => {
  const state = d.createWorkspace();
  assert.equal(d.validateWorkspace(state).tasks.length, 12);
  assert.equal(d.summary(state).daysLeft, null);
  assert.equal(d.summary(state).progress, 0);
  assert.ok(d.taskViews(state).every(task => task.due === '' && task.assignee === 'both'));
});

test('changing the wedding date moves relative deadlines but preserves manual dates', () => {
  let state = d.createWorkspace();
  state = d.applyCommand(state, { type: 'updateProfile', payload: { ...state.profile, weddingDate: '2028-03-01' } });
  assert.equal(d.deadline(state.tasks.at(-1), state.profile.weddingDate), '2028-02-29');
  state = d.applyCommand(state, { type: 'updateTask', payload: { id: 'starter-12', dueDate: '2028-02-15' } });
  state = d.applyCommand(state, { type: 'updateProfile', payload: { ...state.profile, weddingDate: '2028-04-01' } });
  assert.equal(d.deadline(state.tasks.at(-1), state.profile.weddingDate), '2028-02-15');
  assert.equal(d.deadline(state.tasks.at(-2), state.profile.weddingDate), '2028-03-25');
  assert.equal(d.summary(state, '2028-03-31').daysLeft, 1);
  assert.equal(d.summary(state, '2028-04-01').daysLeft, 0);
  assert.equal(d.summary(state, '2028-04-03').daysLeft, -2);
});

test('invalid calendar dates and malformed money cannot be saved', () => {
  for (const date of ['2027-02-29', '2028-04-31', '2028-13-01', '2028-2-01', '1999-12-31']) assert.throws(() => d.date(date));
  for (const value of ['1.001', '-1', 'NaN', '1e3', '1,000', '100000001', 'Infinity']) assert.throws(() => d.parseMoney(value));
  assert.equal(d.date('2028-02-29'), '2028-02-29');
  assert.equal(d.parseMoney('0.29'), 29);
  assert.equal(d.parseMoney('100.5'), 10050);
  assert.equal(d.parseMoney(''), 0);
});

test('budget totals use cents and distinguish planning from payments', () => {
  let state = d.createWorkspace();
  state.profile.totalBudget = 20;
  state = d.applyCommand(state, { type: 'addExpense', payload: { title: '测试 A', category: '其他', planned: d.parseMoney('0.1'), paid: 0, note: '' } }, 'a');
  state = d.applyCommand(state, { type: 'addExpense', payload: { title: '测试 B', category: '其他', planned: d.parseMoney('0.2'), paid: 25, note: '' } }, 'b');
  const stats = d.summary(state);
  assert.equal(stats.planned, 30);
  assert.equal(stats.plannedText, '0.30');
  assert.equal(stats.paid, 25);
  assert.equal(stats.remaining, -5);
  assert.equal(stats.overBudget, true);
  assert.equal(stats.budgetPercent, 100);
  assert.equal(d.formatMoney(123456789), '1,234,567.89');
});

test('tasks can be assigned, completed, reopened and deleted without mutating previous state', () => {
  const original = d.createWorkspace();
  let state = d.applyCommand(original, { type: 'addTask', payload: { title: '  选戒指  ', category: '其他', assignee: 'p2', dueDate: '2027-01-03', done: false, note: '一起试戴' } }, 'rings');
  assert.equal(original.tasks.length, 12);
  assert.equal(state.tasks.at(-1).title, '选戒指');
  let view = d.taskViews(state, '2027-01-04').find(task => task.id === 'rings');
  assert.equal(view.owner, 'TA'); assert.equal(view.overdue, true);
  state = d.applyCommand(state, { type: 'updateTask', payload: { id: 'rings', done: true } });
  assert.equal(d.summary(state).done, 1);
  state = d.applyCommand(state, { type: 'updateTask', payload: { id: 'rings', done: false } });
  state = d.applyCommand(state, { type: 'deleteTask', payload: { id: 'rings' } });
  assert.equal(state.tasks.length, 12);
  assert.throws(() => d.applyCommand(state, { type: 'updateTask', payload: { id: 'rings', done: true } }), { code: 'NOT_FOUND' });
});

test('import rejects duplicate IDs, unknown assignees and oversized data', () => {
  const state = d.createWorkspace();
  state.tasks.push({ ...state.tasks[0] });
  assert.throws(() => d.validateWorkspace(state));
  state.tasks.pop(); state.tasks[0].assignee = 'stranger';
  assert.throws(() => d.validateWorkspace(state));
  state.tasks = Array.from({ length: 301 }, (_, i) => ({ ...d.createWorkspace().tasks[0], id: String(i) }));
  assert.throws(() => d.validateWorkspace(state));
});
