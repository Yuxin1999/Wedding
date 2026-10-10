const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../shared/domain');
const expense = (overrides = {}) => ({ title: '摄影定金', category: '摄影摄像', planned: 200010, paid: 100005, note: '', taskId: 'starter-4', paymentDueDate: '2028-02-29', ...overrides });
const add = (state, id, overrides) => d.applyCommand(state, { type: 'addExpense', payload: expense(overrides) }, id);

test('legacy records acquire optional link and payment date without changing money', () => {
  const state = d.createWorkspace();
  state.expenses.push({ id: 'old', title: '已有账目', category: '其他', planned: 12345, paid: 2345, note: '' });
  const migrated = d.validateWorkspace(state);
  assert.equal(migrated.expenses[0].taskId, '');
  assert.equal(migrated.expenses[0].paymentDueDate, '');
  assert.equal(d.summary(migrated).planned, 12345);
  assert.equal(state.expenses[0].taskId, undefined);
});

test('multiple expenses aggregate by task and renaming or completing a task preserves payments', () => {
  let state = add(d.createWorkspace(), 'deposit');
  state = add(state, 'balance', { title: '摄影尾款', planned: 600020, paid: 0 });
  assert.deepEqual(d.taskBudget(state, 'starter-4'), { count: 2, planned: 800030, paid: 100005, plannedText: '8,000.30', paidText: '1,000.05' });
  state = d.applyCommand(state, { type: 'updateTask', payload: { id: 'starter-4', title: '约定摄影团队', done: true } });
  assert.equal(d.expenseViews(state)[0].taskTitle, '约定摄影团队');
  assert.equal(d.taskViews(state).find(item => item.id === 'starter-4').budget.count, 2);
  assert.equal(d.paymentReminders(state, '2028-02-29').length, 2);
  assert.equal(state.expenses[0].paid, 100005);
});

test('reassigning, unbinding and deleting tasks preserves expense records and totals', () => {
  let state = add(d.createWorkspace(), 'deposit');
  const total = d.summary(state).planned;
  state = d.applyCommand(state, { type: 'updateExpense', payload: { id: 'deposit', taskId: '' } });
  assert.equal(d.taskBudget(state, 'starter-4').count, 0);
  state = d.applyCommand(state, { type: 'updateExpense', payload: { id: 'deposit', taskId: 'starter-2' } });
  assert.equal(d.taskBudget(state, 'starter-2').count, 1);
  const before = d.clone(state);
  state = d.applyCommand(state, { type: 'deleteTask', payload: { id: 'starter-2' } });
  assert.equal(state.expenses[0].taskId, '');
  assert.equal(state.expenses[0].paymentDueDate, '2028-02-29');
  assert.equal(d.summary(state).planned, total);
  assert.equal(before.expenses[0].taskId, 'starter-2');
});

test('invalid links, malformed dates and dangling imports cannot be saved', () => {
  const state = d.createWorkspace();
  assert.throws(() => add(state, 'bad', { taskId: 'deleted-or-foreign' }), /关联的事项不存在/);
  assert.throws(() => add(state, 'bad', { taskId: null }), /关联事项格式/);
  assert.throws(() => add(state, 'bad', { paymentDueDate: '2027-02-29' }), /有效日期/);
  const imported = add(state, 'deposit');
  assert.deepEqual(d.validateWorkspace(JSON.parse(JSON.stringify(imported))), imported);
  imported.tasks = imported.tasks.filter(item => item.id !== 'starter-4');
  assert.throws(() => d.validateWorkspace(imported), /关联的事项不存在/);
  assert.equal(state.expenses.length, 0);
});

test('payment reminders order overdue, today and future unpaid bills using exact remaining cents', () => {
  let state = add(d.createWorkspace(), 'future', { paymentDueDate: '2028-03-01' });
  state = add(state, 'today', { paymentDueDate: '2028-02-29' });
  state = add(state, 'overdue', { paymentDueDate: '2028-02-28' });
  state = add(state, 'paid', { paid: 200010 });
  state = add(state, 'overpaid', { paid: 300000 });
  state = add(state, 'undated', { paymentDueDate: '' });
  state = add(state, 'zero', { planned: 0, paid: 0 });
  const reminders = d.paymentReminders(state, '2028-02-29');
  assert.deepEqual(reminders.map(item => item.id), ['overdue', 'today', 'future']);
  assert.deepEqual(reminders.map(item => item.paymentLabel), ['付款已逾期 1 天', '今天付款', '还有 1 天付款']);
  assert.equal(reminders[0].outstandingText, '1,000.05');
  assert.equal(d.paymentReminders(state, '2028-03-01').find(item => item.id === 'today').paymentOverdue, true);
});

test('rescheduling and paying in full updates reminders independently of task completion', () => {
  let state = add(d.createWorkspace(), 'deposit');
  state = d.applyCommand(state, { type: 'updateExpense', payload: { id: 'deposit', paymentDueDate: '2028-03-10' } });
  assert.equal(d.paymentReminders(state, '2028-03-01')[0].paymentLabel, '还有 9 天付款');
  state = d.applyCommand(state, { type: 'updateExpense', payload: { id: 'deposit', paid: 200010 } });
  assert.equal(d.paymentReminders(state, '2028-03-01').length, 0);
  assert.equal(state.tasks.find(item => item.id === 'starter-4').done, false);
  state = d.applyCommand(state, { type: 'updateExpense', payload: { id: 'deposit', paid: 0, paymentDueDate: '' } });
  assert.equal(d.paymentReminders(state, '2028-03-01').length, 0);
});
