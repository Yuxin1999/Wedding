const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../scripts/serve-web');

async function withServer(fn) {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
test('web demo serves its real entry page, styles and shared business model', () => withServer(async base => {
  const page = await fetch(base); assert.equal(page.status, 200);
  assert.match(await page.text(), /我们的婚礼手账/);
  const model = await fetch(`${base}/shared/domain.js`); assert.equal(model.status, 200);
  assert.match(model.headers.get('content-type'), /javascript/);
  assert.match(await model.text(), /globalThis.WeddingDomain/);
  assert.equal((await fetch(`${base}/styles.css`)).status, 200);
}));
test('all twenty illustrations are available as both SVG and PNG', () => withServer(async base => {
  const manifest = await (await fetch(`${base}/assets/illustrations/manifest.json`)).json();
  assert.equal(manifest.length, 20);
  for (const item of manifest) {
    for (const type of ['svg', 'png']) {
      const result = await fetch(`${base}/assets/illustrations/${item.id}.${type}`);
      assert.equal(result.status, 200, `${item.id}.${type}`);
      assert.match(result.headers.get('content-type'), /image/);
      assert.ok((await result.arrayBuffer()).byteLength > 100);
    }
  }
}));
test('web server does not expose repository metadata, backend files or traversal paths', () => withServer(async base => {
  for (const target of ['/.git/config', '/cloudfunctions/wedding/index.js', '/package.json', '/assets/%2e%2e/%2e%2e/cloudfunctions/wedding/index.js', '/assets/illustrations/../../../../etc/passwd']) {
    assert.equal((await fetch(`${base}${target}`)).status, 404, target);
  }
  assert.equal((await fetch(base, { method: 'POST', body: 'test' })).status, 405);
}));
