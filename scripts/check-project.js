const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const mini = path.join(root, 'miniprogram');
const read = file => fs.readFileSync(file, 'utf8');
const json = file => JSON.parse(read(file));

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).filter(item => !['node_modules', '.git'].includes(item.name)).flatMap(item => {
    const filename = path.join(directory, item.name);
    return item.isDirectory() ? files(filename) : [filename];
  });
}
const allFiles = files(root);
let scripts = 0;
let templates = 0;
for (const filename of allFiles) {
  if (filename.endsWith('.json')) json(filename);
  if (filename.endsWith('.js')) {
    new vm.Script(read(filename), { filename }); scripts += 1;
    if (filename.startsWith(mini)) {
      for (const match of read(filename).matchAll(/require\(['"](.*?)['"]\)/g)) {
        assert.ok(match[1].startsWith('.'), `${filename}: mini program cannot import a Node package`);
        const target = path.resolve(path.dirname(filename), match[1] + '.js');
        assert.ok(target.startsWith(mini + path.sep) && fs.existsSync(target), `${filename}: missing local module ${match[1]}`);
      }
    }
  }
  if (filename.endsWith('.wxml')) {
    const source = read(filename);
    const stack = [];
    for (const match of source.matchAll(/<(\/?)([\w:-]+)((?:"[^"]*"|'[^']*'|[^'"<>])*)>/g)) {
      const [, close, tag, attrs] = match;
      if (close) assert.equal(stack.pop(), tag, `${filename}: unbalanced ${tag}`);
      else if (!attrs.trimEnd().endsWith('/')) stack.push(tag);
    }
    assert.equal(stack.length, 0, `${filename}: unclosed ${stack.join(',')}`);
    const js = read(filename.replace(/\.wxml$/, '.js'));
    for (const match of source.matchAll(/(?:bind|catch):?[a-z]+="([A-Za-z_]\w*)"/g)) {
      assert.match(js, new RegExp(`\\b${match[1]}\\s*\\(`), `${filename}: missing handler ${match[1]}`);
    }
    for (const match of source.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
      new vm.Script(`(${match[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')})`, { filename });
    }
    templates += 1;
  }
}
const project = json(path.join(root, 'project.config.json'));
assert.equal(project.miniprogramRoot, 'miniprogram/');
assert.equal(project.cloudfunctionRoot, 'cloudfunctions/');
const app = json(path.join(mini, 'app.json'));
for (const page of app.pages) {
  for (const extension of ['js', 'json', 'wxml', 'wxss']) assert.ok(fs.existsSync(path.join(mini, `${page}.${extension}`)), `Missing ${page}.${extension}`);
  const config = json(path.join(mini, `${page}.json`));
  for (const component of Object.values(config.usingComponents || {})) {
    const target = component.startsWith('/') ? path.join(mini, component) : path.resolve(mini, path.dirname(page), component);
    assert.equal(json(target + '.json').component, true, `Invalid component: ${component}`);
  }
}
for (const tab of app.tabBar.list) {
  assert.ok(app.pages.includes(tab.pagePath));
  for (const filename of [tab.iconPath, tab.selectedIconPath]) {
    const buffer = fs.readFileSync(path.join(mini, filename));
    assert.equal(buffer.subarray(1, 4).toString(), 'PNG');
    assert.ok(buffer.length < 40 * 1024, `Tab icon too large: ${filename}`);
  }
}
for (const target of ['miniprogram/utils/domain.js', 'cloudfunctions/wedding/domain.js']) {
  assert.equal(read(path.join(root, target)), read(path.join(root, 'shared/domain.js')), `${target}: run npm run prepare`);
}
console.log(`Project checks passed: ${app.pages.length} pages, ${templates} WXML templates, ${scripts} JavaScript files, 8 tab icons, shared model synchronized.`);
