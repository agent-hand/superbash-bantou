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

// 検査する code: source（src/**/*.ts）と、配る物（dist/cli.mjs。citty を含む）。
function codeFiles() {
  return walk(path.join(ROOT, 'tools')).filter((f) => (f.includes(`${path.sep}src${path.sep}`) && f.endsWith('.ts')) || (f.includes(`${path.sep}dist${path.sep}`) && f.endsWith('.mjs')));
}

test('tools/ の code は shell を通さない（shell の option・exec・sh -c を使わない）', () => {
  const files = codeFiles();
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

test('宛先を持たない: tools/ の code と manifest に、設定 key・環境変数・URL の定数・URL を組む code が無い', () => {
  const files = [...codeFiles(), path.join(ROOT, '.manifest', 'toolconfig.json')];
  const forbidden = [
    /verdaccio/i,
    /PUBLISH_/,
    /giteaUrl|giteaUsername|verdaccioRegistry/,
    /registry\.npmjs\.org/,
    /https:\/\/github\.com\//, // gh の出力に無い時に URL を組む code
    /['"`]https?:\/\/[A-Za-z0-9]/, // URL の文字列（定数・組み立て）。gh の出力から拾う正規表現は除く
    /\$\{[^}]*(baseUrl|BASE_URL)[^}]*\}\/\$\{/, // Gitea の url を組み立てる
  ];
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8').replace(/"\$schema":\s*"[^"]*"/, '');
    for (const re of forbidden) assert.equal(re.test(text), false, `${path.relative(ROOT, f)} に ${re}`);
  }
  // host の設定の読み込み（publish の config.js）は無い。
  assert.equal(fs.existsSync(path.join(ROOT, 'tools', 'publish', 'src', 'lib', 'config.ts')), false);
});

test('repo の file に手元の home の path を入れない', () => {
  const homePrefix = new RegExp('/' + 'Users/[A-Za-z0-9._-]+');
  for (const f of walk(ROOT)) {
    if (f.endsWith('.png')) continue;
    const text = fs.readFileSync(f, 'utf8');
    assert.equal(homePrefix.test(text), false, path.relative(ROOT, f));
  }
});
