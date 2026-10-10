/* Pure shared model. Run npm run prepare after editing this file. Money is stored in cents. */
const CATEGORIES = ['场地宴席', '婚纱造型', '摄影摄像', '仪式布置', '宾客礼品', '其他'];
const ASSIGNEES = ['both', 'p1', 'p2'];
const MAX_ITEMS = 300;
const MAX_MONEY = 10000000000;

function fail(message, code = 'VALIDATION') {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function text(value, label, max, required = false) {
  if (typeof value !== 'string') fail(`${label}格式不正确`);
  const result = value.trim();
  if (result.length > max || (required && !result)) fail(`${label}${required ? '需填写且' : ''}不超过 ${max} 字`);
  return result;
}

function date(value) {
  if (value === '') return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('日期格式不正确');
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (year < 2000 || year > 2100 || parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) fail('请选择有效日期（2000–2100 年）');
  return value;
}

function money(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_MONEY) fail('金额需在 0 至 1 亿元之间');
  return value;
}

function parseMoney(input) {
  const raw = String(input).trim();
  if (!raw) return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) fail('金额请填写数字，最多两位小数');
  const parts = raw.split('.');
  return money(Number(parts[0]) * 100 + Number((parts[1] || '').padEnd(2, '0')));
}

function formatMoney(cents) {
  const value = (cents / 100).toFixed(cents % 100 ? 2 : 0);
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function editMoney(cents) { return cents ? String(cents / 100) : ''; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function category(value) { if (!CATEGORIES.includes(value)) fail('请选择有效分类'); return value; }
function assignee(value) { if (!ASSIGNEES.includes(value)) fail('请选择负责人'); return value; }

function profile(input) {
  return {
    name1: text(input.name1, '你的称呼', 16, true),
    name2: text(input.name2, '伴侣的称呼', 16, true),
    weddingDate: date(input.weddingDate),
    totalBudget: money(input.totalBudget),
    location: text(input.location, '婚礼城市 / 场地', 60)
  };
}

function task(input, id) {
  if (typeof input.done !== 'boolean') fail('任务状态不正确');
  const daysBefore = input.daysBefore === undefined ? null : input.daysBefore;
  if (daysBefore !== null && (!Number.isInteger(daysBefore) || daysBefore < 0 || daysBefore > 1000)) fail('任务时间不正确');
  return {
    id: text(id, '任务编号', 80, true), title: text(input.title, '任务名称', 60, true),
    category: category(input.category), assignee: assignee(input.assignee),
    dueDate: date(input.dueDate), daysBefore, done: input.done,
    note: text(input.note || '', '任务备注', 300)
  };
}

function expense(input, id) {
  return {
    id: text(id, '开支编号', 80, true), title: text(input.title, '开支名称', 60, true),
    category: category(input.category), planned: money(input.planned), paid: money(input.paid),
    note: text(input.note || '', '开支备注', 300)
  };
}

function validateWorkspace(input) {
  if (!input || input.schemaVersion !== 1 || !Array.isArray(input.tasks) || !Array.isArray(input.expenses)) fail('数据格式不兼容，请保留原数据并更新小程序');
  if (input.tasks.length > MAX_ITEMS || input.expenses.length > MAX_ITEMS) fail('任务和开支分别最多 300 条');
  const result = {
    schemaVersion: 1, profile: profile(input.profile || {}),
    tasks: input.tasks.map(item => task(item, item.id)),
    expenses: input.expenses.map(item => expense(item, item.id))
  };
  for (const items of [result.tasks, result.expenses]) {
    if (new Set(items.map(item => item.id)).size !== items.length) fail('数据包含重复编号');
  }
  return result;
}

function createWorkspace() {
  const seeds = [
    ['一起确定婚礼风格与总预算', '其他', 270, 'both'],
    ['考察并预订婚礼场地', '场地宴席', 240, 'both'],
    ['确认双方宾客初步名单', '宾客礼品', 180, 'both'],
    ['挑选摄影与摄像团队', '摄影摄像', 150, 'both'],
    ['试穿并确定婚纱礼服', '婚纱造型', 120, 'both'],
    ['沟通仪式流程与布置方案', '仪式布置', 90, 'both'],
    ['准备喜糖、伴手礼与请柬', '宾客礼品', 60, 'both'],
    ['安排试妆与造型', '婚纱造型', 45, 'both'],
    ['发送邀请并确认出席人数', '宾客礼品', 30, 'both'],
    ['确认菜单、桌数和座位安排', '场地宴席', 21, 'both'],
    ['和所有供应商核对当天时间表', '仪式布置', 7, 'both'],
    ['整理婚礼随身物品和应急包', '其他', 1, 'both']
  ];
  return {
    schemaVersion: 1,
    profile: { name1: '我', name2: 'TA', weddingDate: '', totalBudget: 0, location: '' },
    tasks: seeds.map((item, index) => ({ id: `starter-${index + 1}`, title: item[0], category: item[1], daysBefore: item[2], assignee: item[3], dueDate: '', done: false, note: '' })),
    expenses: []
  };
}

function applyCommand(current, command, newId) {
  const state = validateWorkspace(current);
  if (!command || typeof command !== 'object') fail('无效操作');
  const payload = command.payload || {};
  if (command.type === 'updateProfile') state.profile = profile(payload);
  else {
    const operations = {
      addTask: ['tasks', 'add', task], updateTask: ['tasks', 'update', task], deleteTask: ['tasks', 'delete', task],
      addExpense: ['expenses', 'add', expense], updateExpense: ['expenses', 'update', expense], deleteExpense: ['expenses', 'delete', expense]
    };
    const spec = operations[command.type];
    if (!spec) fail('不支持的操作');
    const [key, operation, validate] = spec;
    if (operation === 'add') {
      if (state[key].length >= MAX_ITEMS) fail('最多添加 300 条，请先整理已有记录');
      if (state[key].some(item => item.id === newId)) fail('编号冲突，请重试');
      state[key].push(validate(payload, newId));
    } else {
      const index = state[key].findIndex(item => item.id === payload.id);
      if (index < 0) fail('这条记录已被删除，请刷新', 'NOT_FOUND');
      if (operation === 'delete') state[key].splice(index, 1);
      else state[key][index] = validate(Object.assign({}, state[key][index], payload), payload.id);
    }
  }
  return state;
}

function dayNumber(value) {
  const [y, m, d] = value.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

function todayString(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function deadline(item, weddingDate) {
  if (item.dueDate) return item.dueDate;
  if (!weddingDate || item.daysBefore === null || item.daysBefore === undefined) return '';
  return new Date((dayNumber(weddingDate) - item.daysBefore) * 86400000).toISOString().slice(0, 10);
}

function taskViews(state, today = todayString()) {
  return state.tasks.map(item => {
    const due = deadline(item, state.profile.weddingDate);
    const delta = due ? dayNumber(due) - dayNumber(today) : null;
    const owner = item.assignee === 'both' ? '一起' : state.profile[item.assignee === 'p1' ? 'name1' : 'name2'];
    let dueLabel = due ? due.slice(5).replace('-', '/') : (item.daysBefore !== null ? `婚前 ${item.daysBefore} 天` : '时间待定');
    if (!item.done && delta === 0) dueLabel = '今天到期';
    if (!item.done && delta !== null && delta < 0) dueLabel = `已过期 ${Math.abs(delta)} 天`;
    return Object.assign({}, item, { due, delta, dueLabel, owner, overdue: !item.done && delta !== null && delta < 0 });
  }).sort((a, b) => Number(a.done) - Number(b.done) || (a.due || '9999').localeCompare(b.due || '9999'));
}

function summary(state, today = todayString()) {
  const total = state.tasks.length;
  const done = state.tasks.filter(item => item.done).length;
  const planned = state.expenses.reduce((sum, item) => sum + item.planned, 0);
  const paid = state.expenses.reduce((sum, item) => sum + item.paid, 0);
  const budget = state.profile.totalBudget;
  const daysLeft = state.profile.weddingDate ? dayNumber(state.profile.weddingDate) - dayNumber(today) : null;
  return {
    total, done, progress: total ? Math.round(done / total * 100) : 0,
    pending: total - done, daysLeft, planned, paid,
    remaining: budget - paid, overBudget: budget > 0 && planned > budget,
    budgetPercent: budget ? Math.min(100, Math.round(planned / budget * 100)) : 0,
    plannedText: formatMoney(planned), paidText: formatMoney(paid), budgetText: formatMoney(budget),
    remainingText: formatMoney(Math.abs(budget - paid))
  };
}

const weddingDomain = { CATEGORIES, ASSIGNEES, MAX_ITEMS, createWorkspace, validateWorkspace, applyCommand, parseMoney, formatMoney, editMoney, date, deadline, dayNumber, todayString, taskViews, summary, clone };
if (typeof module !== 'undefined' && module.exports) module.exports = weddingDomain;
else globalThis.WeddingDomain = weddingDomain;
