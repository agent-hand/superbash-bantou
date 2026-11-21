'use strict';
// 静的な検査: 子 process を shell を通して起動しない。repo に手元の home の path を入れない。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { ROOT } = require('./helpers/env');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules' || e.name === 'target' || e.name === 'gen') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}

test('tools/ の code は shell を通さない（shell の option・exec・sh -c を使わない）', () => {
  const files = walk(path.join(ROOT, 'tools')).filter((f) => f.endsWith('.js'));
  assert.ok(files.length > 0);
  const forbidden = [
    /\bshell\s*:/, // spawn の shell の option
    /\bexecSync\s*\(/,
    /\bexec\s*\(/,
    /['"`]\/bin\/(ba|z)?sh['"`]/,
    /['"`](ba|z)?sh['"`]\s*,\s*\[\s*['"`]-c['"`]/,
  ];
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    for (const re of forbidden) assert.equal(re.test(text), false, `${path.relative(ROOT, f)} に ${re}`);
  }
});

test('repo の file に手元の home の path を入れない', () => {
  const homePrefix = new RegExp('/' + 'Users/[A-Za-z0-9._-]+');
  for (const f of walk(ROOT)) {
    if (f.endsWith('.png')) continue;
    const text = fs.readFileSync(f, 'utf8');
    assert.equal(homePrefix.test(text), false, path.relative(ROOT, f));
  }
});
