const test = require('node:test');
const assert = require('node:assert/strict');
const { createService, INVITE_TTL } = require('../cloudfunctions/wedding/service');
const { createWorkspace } = require('../shared/domain');

function setup() {
  let data = new Map();
  let queue = Promise.resolve();
  let timestamp = 1000;
  let sequence = 0;
  const store = {
    transaction(fn) {
      const operation = queue.then(async () => {
        const draft = structuredClone(data);
        const result = await fn({
          async get(collection, id) { return structuredClone(draft.get(`${collection}/${id}`) || null); },
          async set(collection, id, value) { draft.set(`${collection}/${id}`, structuredClone(value)); }
        });
        data = draft;
        return structuredClone(result);
      });
      queue = operation.catch(() => {});
      return operation;
    }
  };
  return { execute: createService(store, { now: () => timestamp, makeId: () => `record-${++sequence}`, makeCode: () => `ABCDEFGHJK${String(++sequence).padStart(2, '2')}` }), advance: value => { timestamp += value; }, entries: () => data };
}
async function couple(ctx) {
  const initial = await ctx.execute('alice', { action: 'create', workspace: createWorkspace() });
  const invite = await ctx.execute('alice', { action: 'invite' });
  const joined = await ctx.execute('bob', { action: 'join', code: invite.code });
  return { initial, joined, invite };
}

test('a couple can migrate a local plan, invite one partner and share updates', async () => {
  const ctx = setup();
  assert.deepEqual(await ctx.execute('alice', { action: 'status' }), { connected: false });
  const { joined } = await couple(ctx);
  assert.equal(joined.role, 'p2'); assert.equal(joined.memberCount, 2);
  const saved = await ctx.execute('bob', { action: 'command', revision: joined.revision, command: { type: 'updateTask', payload: { id: 'starter-1', done: true } } });
  const alice = await ctx.execute('alice', { action: 'status' });
  assert.equal(alice.workspace.tasks[0].done, true);
  assert.equal(alice.revision, saved.revision);
  assert.equal(alice.role, 'p1');
  assert.ok(!JSON.stringify(alice).includes('alice'));
  assert.ok(!JSON.stringify(alice).includes('bob'));
});

test('unauthenticated and unrelated users cannot read or edit a couple', async () => {
  const ctx = setup(); const { joined } = await couple(ctx);
  await assert.rejects(ctx.execute('', { action: 'status' }), { code: 'UNAUTHENTICATED' });
  await assert.rejects(ctx.execute('mallory', { action: 'command', spaceId: 'record-1', revision: joined.revision, command: { type: 'deleteTask', payload: { id: 'starter-1' } } }), { code: 'NO_SPACE' });
  await assert.rejects(ctx.execute('mallory', { action: 'invite', spaceId: 'record-1' }), { code: 'NO_SPACE' });
  assert.equal((await ctx.execute('alice', { action: 'status' })).workspace.tasks.length, 12);
});

test('simultaneous edits cannot silently overwrite a partner’s changes', async () => {
  const ctx = setup(); const { joined } = await couple(ctx);
  const results = await Promise.allSettled(['alice', 'bob'].map((user, i) => ctx.execute(user, { action: 'command', revision: joined.revision, command: { type: 'updateTask', payload: { id: `starter-${i + 1}`, done: true } } })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'CONFLICT');
  const latest = await ctx.execute('bob', { action: 'status' });
  assert.equal(latest.workspace.tasks.filter(task => task.done).length, 1);
  await ctx.execute('bob', { action: 'command', revision: latest.revision, command: { type: 'updateTask', payload: { id: 'starter-2', done: true } } });
  assert.equal((await ctx.execute('alice', { action: 'status' })).workspace.tasks.filter(task => task.done).length, 2);
});

test('an invitation admits at most one partner even when two users join concurrently', async () => {
  const ctx = setup();
  await ctx.execute('alice', { action: 'create', workspace: createWorkspace() });
  const invitation = await ctx.execute('alice', { action: 'invite' });
  const results = await Promise.allSettled(['bob', 'mallory'].map(user => ctx.execute(user, { action: 'join', code: invitation.code })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await ctx.execute('alice', { action: 'status' })).memberCount, 2);
  await assert.rejects(ctx.execute('alice', { action: 'invite' }), { code: 'SPACE_FULL' });
});

test('a consumed invitation permits only the joined member to retry after a lost response', async () => {
  const ctx = setup(); const { joined, invite } = await couple(ctx);
  const retried = await ctx.execute('bob', { action: 'join', code: invite.code });
  assert.equal(retried.revision, joined.revision); assert.equal(retried.memberCount, 2);
  assert.equal(retried.lastChange.actor, 'p2'); assert.equal(retried.lastChange.text, '加入了共同空间');
  await assert.rejects(ctx.execute('mallory', { action: 'join', code: invite.code }), { code: 'INVALID_INVITE' });
  const updated = await ctx.execute('alice', { action: 'command', revision: retried.revision, lastChange: { actor: 'p2' }, command: { type: 'updateTask', payload: { id: 'starter-1', done: true } } });
  assert.equal(updated.lastChange.actor, 'p1', 'The server derives authorship from the real member');
});

test('expired and replaced invitation codes are rejected and raw tokens are not stored', async () => {
  const ctx = setup();
  await ctx.execute('alice', { action: 'create', workspace: createWorkspace() });
  const old = await ctx.execute('alice', { action: 'invite' });
  const fresh = await ctx.execute('alice', { action: 'invite' });
  assert.ok(!JSON.stringify(Array.from(ctx.entries())).includes(fresh.code));
  await assert.rejects(ctx.execute('bob', { action: 'join', code: old.code }), { code: 'INVALID_INVITE' });
  ctx.advance(INVITE_TTL);
  await assert.rejects(ctx.execute('bob', { action: 'join', code: fresh.code }), { code: 'INVALID_INVITE' });
});

test('a user cannot join two spaces or overwrite an existing space by reconnecting', async () => {
  const ctx = setup(); await couple(ctx);
  const other = await ctx.execute('charlie', { action: 'create', workspace: createWorkspace() });
  const invitation = await ctx.execute('charlie', { action: 'invite' });
  await assert.rejects(ctx.execute('bob', { action: 'join', code: invitation.code }), { code: 'ALREADY_JOINED' });
  const local = createWorkspace(); local.profile.name1 = 'Must not replace';
  const reconnected = await ctx.execute('charlie', { action: 'create', workspace: local });
  assert.deepEqual(reconnected.workspace, other.workspace);
});

test('linked budgets and reminders synchronize, while stale or invalid associations cannot corrupt the workspace', async () => {
  const ctx = setup(); const { joined } = await couple(ctx);
  const saved = await ctx.execute('alice', { action: 'command', revision: joined.revision, command: { type: 'addExpense', payload: { title: '定金', category: '摄影摄像', planned: 200000, paid: 0, note: '', taskId: 'starter-4', paymentDueDate: '2028-05-01' } } });
  const expense = saved.workspace.expenses[0];
  const partner = await ctx.execute('bob', { action: 'status' });
  assert.equal(partner.workspace.expenses[0].paymentDueDate, '2028-05-01');
  await assert.rejects(ctx.execute('bob', { action: 'command', revision: saved.revision, command: { type: 'updateExpense', payload: { id: expense.id, taskId: 'foreign-task-id' } } }), { code: 'VALIDATION' });
  assert.equal((await ctx.execute('bob', { action: 'status' })).revision, saved.revision);
  const deleted = await ctx.execute('bob', { action: 'command', revision: saved.revision, command: { type: 'deleteTask', payload: { id: 'starter-4' } } });
  assert.equal(deleted.workspace.expenses[0].taskId, '');
  assert.equal(deleted.workspace.expenses[0].planned, 200000);
  await assert.rejects(ctx.execute('alice', { action: 'command', revision: saved.revision, command: { type: 'updateExpense', payload: { id: expense.id, taskId: 'starter-4' } } }), { code: 'CONFLICT' });
});

test('custom categories sync to both partners and stale edits cannot undo a rename', async () => {
  const ctx = setup(); const { joined } = await couple(ctx);
  const added = await ctx.execute('alice', { action: 'command', revision: joined.revision, command: { type: 'addCategory', payload: { name: '蜜月旅行', icon: 'car' } } });
  const category = added.workspace.categories.at(-1);
  const partner = await ctx.execute('bob', { action: 'status' });
  assert.deepEqual(partner.workspace.categories.at(-1), category);
  const renamed = await ctx.execute('bob', { action: 'command', revision: partner.revision, command: { type: 'updateCategory', payload: { id: category.id, name: '我们的蜜月', icon: 'heart' } } });
  await assert.rejects(ctx.execute('alice', { action: 'command', revision: added.revision, command: { type: 'updateCategory', payload: { id: category.id, name: '旧名字' } } }), { code: 'CONFLICT' });
  await assert.rejects(ctx.execute('alice', { action: 'command', revision: renamed.revision, command: { type: 'deleteCategory', payload: { id: renamed.workspace.categories[0].id } } }), { code: 'VALIDATION' });
  const latest = await ctx.execute('alice', { action: 'status' });
  assert.equal(latest.workspace.categories.at(-1).name, '我们的蜜月'); assert.equal(latest.revision, renamed.revision);
});

test('invalid updates roll back without advancing revision', async () => {
  const ctx = setup(); const { joined } = await couple(ctx);
  await assert.rejects(ctx.execute('alice', { action: 'command', revision: joined.revision, command: { type: 'updateProfile', payload: { name1: 'Alice', name2: 'Bob', totalBudget: -1, weddingDate: '', location: '' } } }), { code: 'VALIDATION' });
  const state = await ctx.execute('alice', { action: 'status' });
  assert.equal(state.revision, joined.revision);
  assert.equal(state.workspace.profile.totalBudget, 0);
});
