const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'shared/domain.js'));
for (const target of ['miniprogram/utils/domain.js', 'cloudfunctions/wedding/domain.js']) {
  fs.writeFileSync(path.join(root, target), source);
}
console.log('Shared model copied to mini program and cloud function.');
