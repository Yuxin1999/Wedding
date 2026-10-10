const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json; charset=utf-8' };

function createServer() {
  return http.createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end('Method not allowed'); return; }
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
    catch { response.writeHead(400); response.end('Invalid URL'); return; }
    const routes = { '/': 'web/index.html', '/index.html': 'web/index.html', '/app.js': 'web/app.js', '/styles.css': 'web/styles.css', '/shared/domain.js': 'shared/domain.js' };
    let file = routes[pathname] && path.join(root, routes[pathname]);
    if (!file && pathname.startsWith('/assets/') && /^\/assets\/[a-zA-Z0-9_./-]+$/.test(pathname)) {
      const assetRoot = path.join(root, 'miniprogram/assets');
      const candidate = path.resolve(assetRoot, pathname.slice('/assets/'.length));
      if (candidate.startsWith(assetRoot + path.sep) && ['.svg', '.png', '.webp', '.json'].includes(path.extname(candidate))) file = candidate;
    }
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end('Not found'); return; }
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    if (request.method === 'HEAD') response.end();
    else fs.createReadStream(file).pipe(response);
  });
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
  const port = Number(option('--port', process.env.PORT || 4173));
  const host = option('--host', '127.0.0.1');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
  const server = createServer();
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is busy. Try npm run web -- --port 4174` : error.message); process.exitCode = 1; });
  server.listen(port, host, () => console.log(`一起备婚 Web demo: http://${host}:${port}\n本机浏览器保存 · Ctrl+C 停止`));
}
module.exports = { createServer };
