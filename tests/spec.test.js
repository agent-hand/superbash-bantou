'use strict';
// spec（.manifest/toolconfig.json。入れ子）と CLI（引数の表・help）の整合。

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { EXIT } = require('../tools/macbuild/src/lib/errors.ts');
const { ROOT, MAIN, MANIFEST, makeTmp, rmTmp, cleanEnv, runCli } = require('./helpers/env');
const { leaves } = require('./helpers/spec-in');

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const macbuildTops = manifest.commands.filter((c) => c.tool === 'macbuild');
const macbuildLeaves = leaves(manifest, 'macbuild');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

test('package.json は toolset の形（bin を並べない・files は .manifest/ と tools/）', () => {
  assert.equal(pkg.name, 'superbash-bantou');
  assert.equal(pkg.version, '0.4.0');
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.repository.url, 'git+https://github.com/agent-hand/superbash-bantou.git');
  assert.deepEqual(pkg.files, ['.manifest/', 'tools/']);
  assert.equal(pkg.bin, undefined);
});

/** 要素を上から順にたどる（並びの名前つき）。 */
function walkAll(commands) {
  const out = [];
  const walk = (node, names, top) => {
    out.push({ node, names, top, depth: names.length });
    for (const c of node.subcommands || []) walk(c, [...names, c.name], top);
  };
  for (const top of commands) walk(top, [top.name], top);
  return out;
}

test('toolconfig.json の tools と、入れ子の commands の木', () => {
  assert.equal(manifest.name, 'superbash-bantou');
  assert.deepEqual(Object.keys(manifest.tools), ['macbuild', 'publish']);
  for (const tool of ['macbuild', 'publish']) {
    const entry = path.join(ROOT, 'tools', tool, manifest.tools[tool].entry);
    assert.ok(fs.statSync(entry).isFile(), 'entry が無い');
    fs.accessSync(entry, fs.constants.X_OK); // wrapper は entry を直に起動する
    assert.match(fs.readFileSync(entry, 'utf8'), /^#!\/usr\/bin\/env node\n/);
  }

  // 上の要素と、spec.subcommand（argv の頭の語）
  assert.deepEqual(
    manifest.commands.map((c) => [c.name, c.tool, c.spec && c.spec.subcommand]),
    [
      ['macbuild', 'macbuild', undefined],
      ['npm', 'publish', 'npm'],
      ['github', 'publish', 'github'],
      ['gitea', 'publish', 'gitea'],
    ],
  );
  // 呼ぶ名前（葉の並びの名前）の一覧。古い名前（macbuild-info・npm-publish など）と verdaccio は無い。
  assert.deepEqual(
    [...leaves(manifest, 'macbuild'), ...leaves(manifest, 'publish')].map((l) => l.name),
    [
      'macbuild info',
      'macbuild tauri',
      'macbuild sign',
      'npm publish',
      'github repo create',
      'github release create',
      'gitea repo create',
      'gitea release create',
    ],
  );
  assert.ok(!/macbuild-|npm-publish|verdaccio|-create/.test(JSON.stringify(manifest.commands)));

  for (const { node, names, depth } of walkAll(manifest.commands)) {
    const name = names.join(' ');
    assert.ok(!/\s/.test(node.name), `name に空白: ${name}`);
    assert.equal(typeof node.description, 'string', name);
    if (depth === 1) {
      assert.ok(['macbuild', 'publish'].includes(node.tool), name);
      assert.equal(node.version, '0.4.0', name);
    } else {
      assert.equal(node.tool, undefined, `${name}: tool は上の要素だけ`);
      assert.equal(node.version, undefined, `${name}: version は上の要素だけ`);
      assert.equal(node.spec && node.spec.subcommand, undefined, `${name}: spec.subcommand は上の要素だけ`);
    }
    const kids = node.subcommands || [];
    assert.equal(new Set(kids.map((c) => c.name)).size, kids.length, `${name}: 兄弟の name が重なる`);
    if (kids.length > 0) {
      assert.equal(node.spec && node.spec.in, undefined, `${name}: 群は spec.in を持たない`);
    } else {
      for (const k of ['usage', 'in', 'out']) assert.ok(node.spec && node.spec[k] !== undefined, `${name} に spec.${k} が無い`);
      for (const code of Object.keys(node.spec.out.exitCodes)) {
        assert.ok(Object.values(EXIT).includes(Number(code)), `${name} の終了 code ${code} を CLI が使わない`);
      }
    }
  }
});

test('usage は葉の argv の頭・すべての flag・positional を書いている', () => {
  for (const l of macbuildLeaves) {
    const { usage } = l.node.spec;
    assert.ok(usage.startsWith(`macbuild ${l.head.join(' ')}`), usage);
    for (const o of Object.values(l.node.spec.in.options || {})) assert.ok(usage.includes(o.flag), `${usage} に ${o.flag}`);
    for (const p of l.node.spec.in.positionals || []) assert.ok(usage.includes(`<${p.name}>`), `${usage} に <${p.name}>`);
  }
});

test('help は定義の内容を出す（全体・並び・群。`macbuild help [<並び>]`）', () => {
  const home = makeTmp();
  try {
    const env = cleanEnv(home);
    const all = runCli(['help'], { env });
    assert.equal(all.status, 0, all.stderr);
    assert.equal(all.json.tool, 'macbuild');
    assert.deepEqual(all.json.commands, macbuildTops);

    // 並びは `help macbuild tauri` でも `help tauri`（上の要素に spec.subcommand が無い）でもよい。
    for (const l of macbuildLeaves) {
      for (const words of [l.name.split(' '), l.head]) {
        const one = runCli(['help', ...words], { env });
        assert.equal(one.status, 0, one.stderr);
        assert.deepEqual(one.json, l.node);
      }
    }
    assert.deepEqual(runCli(['help', 'macbuild'], { env }).json, macbuildTops[0], '群も引ける');
    assert.deepEqual(runCli(['help', 'macbuild tauri'], { env }).json, macbuildLeaves[1].node, '1 つの引数に空白で並べてもよい');
    assert.deepEqual(runCli([], { env }).json, all.json, '引数無しは help');
    for (const words of [['nope'], ['macbuild', 'nope'], ['info', 'extra'], ['macbuild-info'], ['macbuild-tauri']]) {
      assert.equal(runCli(['help', ...words], { env }).status, EXIT.USAGE, words.join(' '));
    }
  } finally {
    rmTmp(home);
  }
});

test('entry は shebang で直に起動できる（wrapper と同じ起動の形）', () => {
  const r = spawnSync(MAIN, ['help', 'macbuild', 'info'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).name, 'info');
});
