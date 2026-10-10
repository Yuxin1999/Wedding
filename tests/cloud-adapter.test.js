const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createService } = require('../cloudfunctions/wedding/service');
const domain = require('../shared/domain');

function adapter() {
  const records = new Map();
  let identity = 'weixin-alice';
  let failReads = false;
  let config;
  const cloud = {
    DYNAMIC_CURRENT_ENV: 'test-only', init() {},
    getWXContext: () => ({ OPENID: identity }),
    database(options) {
      config = options;
      return { async runTransaction(fn) {
        return fn({ collection(name) { return { doc(id) { return {
          async get() { if (failReads) throw Object.assign(new Error('collection permission error'), { errCode: -502001 }); return { data: records.get(`${name}/${id}`) || null }; },
          async set({ data }) { records.set(`${name}/${id}`, { ...structuredClone(data), _id: id }); }
        }; } }; } });
      } };
    }
  };
  const exports = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../cloudfunctions/wedding/index.js'), 'utf8'), {
    require(name) { return name === 'wx-server-sdk' ? cloud : { createService }; }, exports,
    console: { error() {} }
  });
  return { main: exports.main, config: () => config, identity(value) { identity = value; }, fail() { failReads = true; } };
}

test('cloud entry uses the actual WeChat identity and returns only safe response data', async () => {
  const api = adapter();
  assert.equal(api.config().throwOnNotFound, false);
  assert.equal((await api.main({ action: 'status' })).data.connected, false);
  const result = await api.main({ action: 'create', OPENID: 'forged-bob', workspace: domain.createWorkspace() });
  assert.equal(result.ok, true);
  assert.equal(result.data.memberCount, 1);
  api.identity('forged-bob');
  assert.equal((await api.main({ action: 'status' })).data.connected, false);
  api.identity('weixin-alice');
  assert.equal((await api.main({ action: 'status' })).data.connected, true);
});

test('database access failures are not misclassified as a new user or missing document', async () => {
  const api = adapter(); api.fail();
  const result = await api.main({ action: 'status' });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'SERVER_ERROR');
  assert.ok(!result.error.message.includes('collection permission'));
});
