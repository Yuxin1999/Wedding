const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const domain = require('../shared/domain');
const { createService } = require('../cloudfunctions/wedding/service');

function load(relative, globals) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', relative), 'utf8'), { module, ...globals }, { filename: relative });
  return module.exports;
}
function scheduler() {
  let id = 0; const timers = new Map();
  return {
    timers,
    setTimeout(fn, ms) { const key = ++id; timers.set(key, { fn, ms }); return key; },
    clearTimeout(key) { timers.delete(key); },
    async tick() { const ready = [...timers.values()]; timers.clear(); for (const timer of ready) await timer.fn(); }
  };
}
function bind(definition) {
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
function syncPage(store) {
  const clock = scheduler();
  const { withSync } = load('miniprogram/utils/collaboration.js', { ...clock, require: () => store });
  const page = bind(withSync({
    data: { ready: true, loading: false, editor: false },
    async onShow() { this.render(await store.getSnapshot()); },
    render(snapshot) { this._snapshot = snapshot; this.setData({ value: snapshot.revision }); }
  }));
  return { page, clock };
}
const snapshot = revision => ({ revision, mode: 'cloud', workspace: domain.createWorkspace(), role: 'p1', memberCount: 2 });

test('shared pages poll every 15 seconds only while visible and stop on hide/unload', async () => {
  let current = snapshot(1), calls = 0, mode = 'cloud';
  const { page, clock } = syncPage({ mode: () => mode, getSnapshot: async () => { calls++; return current; } });
  await page.onShow(); assert.equal(clock.timers.size, 1); assert.equal([...clock.timers.values()][0].ms, 15000);
  current = snapshot(2); await clock.tick(); assert.equal(page.data.value, 2); assert.equal(calls, 2);
  page.onHide(); assert.equal(clock.timers.size, 0); await page.syncSharedPlan(); assert.equal(calls, 2);
  await page.onShow(); assert.equal(clock.timers.size, 1); page.onUnload(); assert.equal(clock.timers.size, 0);
  await page.onShow(); mode = 'local'; page.render({ ...current, mode }); assert.equal(clock.timers.size, 0); page.onUnload();
  const local = syncPage({ mode: () => 'local', getSnapshot: async () => ({ ...snapshot(1), mode: 'local' }) });
  await local.page.onShow(); assert.equal(local.clock.timers.size, 0); assert.equal(local.page.data.syncEnabled, false);
});

test('polling preserves drafts, pauses saves and rejects responses overtaken by editing or newer data', async () => {
  let current = snapshot(1), resolve, calls = 0, delayed = false;
  const { page } = syncPage({ mode: () => 'cloud', getSnapshot: async () => { calls++; return delayed ? new Promise(done => { resolve = done; }) : current; } });
  await page.onShow();
  for (const flag of ['editor', 'categoryEditor', 'joinEditor', 'saving', 'connecting', 'loading']) {
    page.setData({ [flag]: true }); await page.syncSharedPlan(); page.setData({ [flag]: false });
  }
  assert.equal(calls, 1);
  delayed = true;
  let pending = page.syncSharedPlan();
  page.setData({ editor: true, form: { title: '还没写完' } }); resolve(snapshot(2)); await pending;
  assert.equal(page.data.value, 1); assert.equal(page.data.form.title, '还没写完');
  page.setData({ editor: false }); pending = page.syncSharedPlan();
  page.render(snapshot(3)); resolve(snapshot(2)); await pending; assert.equal(page.data.value, 3);
  pending = page.syncSharedPlan(); page.onHide(); resolve(snapshot(4)); await pending; assert.equal(page.data.value, 3);
});

test('sync failures retain the shared view and recover without switching to local mode', async () => {
  let fail = false;
  const { page, clock } = syncPage({ mode: () => 'cloud', getSnapshot: async () => { if (fail) throw new Error('offline'); return snapshot(fail ? 1 : 2); } });
  await page.onShow(); fail = true; await clock.tick();
  assert.equal(page.data.syncEnabled, true); assert.match(page.data.syncError, /重试/); assert.equal(page.data.value, 2);
  fail = false; await clock.tick(); assert.equal(page.data.syncError, ''); page.onUnload();
});

function service() {
  let records = new Map(), sequence = 0, queue = Promise.resolve();
  return createService({ transaction(fn) {
    const operation = queue.then(async () => {
      const draft = structuredClone(records);
      const result = await fn({
        async get(name, id) { return structuredClone(draft.get(name + '/' + id) || null); },
        async set(name, id, value) { draft.set(name + '/' + id, structuredClone(value)); }
      });
      records = draft; return structuredClone(result);
    });
    queue = operation.catch(() => {}); return operation;
  } }, { makeId: () => `record-${++sequence}`, makeCode: () => 'ABCDEFGHJK23' });
}
function client(openid, execute) {
  const storage = new Map(), toasts = [], clock = scheduler();
  const wx = {
    getStorageSync: key => structuredClone(storage.get(key)),
    setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
    cloud: { async callFunction({ data }) {
      try { return { result: { ok: true, data: await execute(openid, data) } }; }
      catch (error) { return { result: { ok: false, error: { code: error.code, message: error.message } } }; }
    } },
    switchTab() {}, vibrateShort() {}, stopPullDownRefresh() {}, setClipboardData() {}
  };
  const store = load('miniprogram/utils/store.js', { wx, require: name => name === '../config' ? { cloudEnv: 'test-cloud' } : domain });
  const collaboration = load('miniprogram/utils/collaboration.js', { ...clock, require: () => store });
  const invitation = load('miniprogram/utils/invitation.js', { wx });
  const ui = { confirm: async () => true, success: message => toasts.push(message), error: error => toasts.push(error.message), navigateTab() {} };
  function page(name) {
    let definition;
    load(`miniprogram/pages/${name}/index.js`, { wx, Page: value => { definition = value; }, require: filename => {
      if (filename.endsWith('/store')) return store;
      if (filename.endsWith('/collaboration')) return collaboration;
      if (filename.endsWith('/invitation')) return invitation;
      if (filename.endsWith('/ui')) return ui;
      if (filename.endsWith('/illustrations')) return { categoryIcon: (category, state) => `/assets/illustrations/${domain.categoryIconId(state, category)}.png` };
      return domain;
    } });
    return bind(definition);
  }
  return { wx, store, page, clock, toasts, invitation };
}

test('two independent clients create, share an invite, confirm joining and synchronize tasks and budgets', async () => {
  const execute = service(), alice = client('alice-private-id', execute), bob = client('bob-private-id', execute);
  const a = alice.page('together'), b = bob.page('together');
  await a.onShow(); await a.connect(); await a.invite();
  const share = a.onShareAppMessage({ from: 'button' });
  assert.match(share.path, /invite=ABCDEFGHJK23/);
  const query = { invite: share.path.split('invite=')[1] };
  bob.invitation.capture({ query }); b.onLoad(query); await b.onShow();
  assert.equal(b.data.joinEditor, true); assert.equal(b.data.joinCode, 'ABCDEFGHJK23'); assert.equal(bob.store.mode(), 'local', 'Opening a share never joins automatically');
  await b.join(); assert.equal(b.data.memberCount, 2); assert.equal(b.data.role, 'p2'); assert.equal(b.data.joinEditor, false);
  await alice.clock.tick(); assert.equal(a.data.memberCount, 2); assert.equal(a.data.inviteCode, '');
  assert.match(a.data.lastChangeLabel, /加入了共同空间/);
  assert.equal(a.onShareAppMessage({ from: 'menu' }).path.includes('invite'), false);
  const tasks = alice.page('tasks'); await tasks.onShow();
  tasks.openEdit({ currentTarget: { dataset: { id: 'starter-4' } } }); tasks.setData({ 'form.assignee': 'p2', 'form.note': '一起确认套餐' }); await tasks.save();
  await b.syncSharedPlan(); assert.equal(b.data.members[1].pending, 1); assert.match(b.data.lastChangeLabel, /更新了备婚清单/);
  b.openMemberTasks({ currentTarget: { dataset: { owner: 'p2' } } });
  const bobTasks = bob.page('tasks'); await bobTasks.onShow(); assert.equal(bobTasks.data.tasks.length, 1); assert.equal(bobTasks.data.ownerIndex, 3);
  const budget = bob.page('budget'); await budget.onShow(); budget.openAdd();
  budget.setData({ 'form.title': '共同摄影预算', 'form.plannedInput': '8000', 'form.taskId': 'starter-4', 'form.paymentDueDate': '2028-05-01' }); await budget.save();
  await tasks.syncSharedPlan(); assert.equal(tasks.data.tasks.find(item => item.id === 'starter-4').budget.planned, 800000);
  const all = [a, b, tasks, bobTasks, budget]; all.forEach(page => page.onUnload());
  assert.equal(alice.clock.timers.size + bob.clock.timers.size, 0);
  const saved = await alice.store.getSnapshot(); assert.equal(JSON.stringify(saved).includes('private-id'), false);
  assert.equal(saved.lastChange.actor, 'p2');
});

test('two active editors cannot overwrite each other and the losing draft stays open', async () => {
  const execute = service(), alice = client('alice', execute), bob = client('bob', execute);
  await alice.store.connect(); const invite = await alice.store.invite(); await bob.store.join(invite.code);
  const a = alice.page('tasks'), b = bob.page('tasks'); await a.onShow(); await b.onShow();
  const event = { currentTarget: { dataset: { id: 'starter-1' } } };
  a.openEdit(event); b.openEdit(event);
  a.setData({ 'form.title': '先商量总预算' }); await a.save();
  b.setData({ 'form.title': '我的未保存输入' }); await b.syncSharedPlan(); await b.save();
  assert.equal(b.data.editor, true); assert.equal(b.data.form.title, '我的未保存输入');
  assert.match(bob.toasts.at(-1), /伴侣刚刚更新/);
  assert.equal((await alice.store.getSnapshot()).workspace.tasks[0].title, '先商量总预算');
  a.onUnload(); b.onUnload();
});

test('invitations normalize valid codes, ignore invalid launch input and are consumed once', () => {
  const bob = client('bob', service());
  bob.invitation.capture({ query: { invite: '../not-a-code' } }); assert.equal(bob.invitation.take(), '');
  bob.invitation.capture({ query: { invite: ' abcd efgh jk23 ' } }); assert.equal(bob.invitation.take(), 'ABCDEFGHJK23');
  bob.invitation.capture({ query: { invite: 'ABCDEFGHJK23' } }); assert.equal(bob.invitation.take(), '');
});

test('a slow cloud status response cannot roll back the cached revision after a save', async () => {
  const c = client('alice', service()); await c.store.connect();
  const call = c.wx.cloud.callFunction; let resolve;
  c.wx.cloud.callFunction = ({ data }) => data.action === 'status' ? new Promise(done => { resolve = done; }) : call({ data });
  const poll = c.store.getSnapshot();
  const saved = await c.store.mutate({ type: 'updateTask', payload: { id: 'starter-1', done: true } }, 1);
  resolve({ result: { ok: true, data: { ...snapshot(1), connected: true } } });
  const result = await poll; assert.equal(result.revision, saved.revision); assert.equal(result.workspace.tasks[0].done, true);
});
