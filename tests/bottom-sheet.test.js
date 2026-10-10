const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function sheet(initiallyVisible = false) {
  let definition, now = 0, nextId = 0;
  const timers = new Map();
  const file = path.join(__dirname, '../miniprogram/components/bottom-sheet/index.js');
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    Component(value) { definition = value; },
    setTimeout(callback, delay) { const id = ++nextId; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  const instance = {
    data: structuredClone(definition.data),
    properties: { visible: initiallyVisible, busy: false },
    events: [], updates: 0,
    setData(patch) { Object.assign(this.data, patch); this.updates++; },
    triggerEvent(event) { this.events.push(event); },
    ...definition.methods
  };
  definition.lifetimes.attached.call(instance);
  return {
    instance, timers,
    visible(value) { instance.properties.visible = value; instance.syncVisibility(value); },
    detach() { definition.lifetimes.detached.call(instance); },
    advance(ms) {
      now += ms;
      for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.callback(); }
    }
  };
}

test('sheet remains mounted during exit, then releases its content and mask', () => {
  const view = sheet();
  assert.equal(view.instance.data.mounted, false);
  view.visible(true);
  assert.equal(view.instance.data.mounted, true);
  view.visible(false);
  assert.equal(view.instance.data.closing, true);
  view.advance(219);
  assert.equal(view.instance.data.mounted, true);
  view.advance(1);
  assert.equal(view.instance.data.mounted, false);
});

test('reopening a closing sheet cancels stale removal and keeps the editor usable', () => {
  const view = sheet(true);
  view.visible(false); view.advance(100); view.visible(true); view.advance(500);
  assert.equal(view.instance.data.mounted, true);
  assert.equal(view.instance.data.closing, false);
  assert.equal(view.timers.size, 0);
  view.instance.close();
  assert.deepEqual(view.instance.events, ['close']);
});

test('busy or dismissed sheets ignore close requests; parent controls dismissal', () => {
  const view = sheet(true);
  view.instance.properties.busy = true;
  view.instance.close();
  assert.deepEqual(view.instance.events, []);
  view.instance.properties.busy = false;
  view.instance.close();
  assert.deepEqual(view.instance.events, ['close']);
  assert.equal(view.instance.data.closing, false);
  view.visible(false); view.instance.close();
  assert.deepEqual(view.instance.events, ['close']);
});

test('detaching during exit cancels pending updates to a destroyed component', () => {
  const view = sheet(true);
  view.visible(false); view.detach();
  const updates = view.instance.updates;
  view.advance(500);
  assert.equal(view.timers.size, 0);
  assert.equal(view.instance.updates, updates);
});
