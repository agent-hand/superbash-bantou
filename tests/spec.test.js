'use strict';
// spec（.manifest/toolconfig.json）と CLI（引数の表・help）の整合。

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { COMMANDS } = require('../tools/macbuild/lib/commands');
const { EXIT } = require('../tools/macbuild/lib/errors');
const { ROOT, MAIN, MANIFEST, makeTmp, rmTmp, cleanEnv, runCli } = require('./helpers/env');

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const macbuildCommands = manifest.commands.filter((c) => c.tool === 'macbuild');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

test('package.json は toolset の形（bin を並べない・files は .manifest/ と tools/）', () => {
  assert.equal(pkg.name, 'superbash-bantou');
  assert.equal(pkg.version, '0.2.1');
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.repository.url, 'git+https://github.com/agent-hand/superbash-bantou.git');
  assert.deepEqual(pkg.files, ['.manifest/', 'tools/']);
  assert.equal(pkg.bin, undefined);
});

test('toolconfig.json の tools と commands の形', () => {
  assert.equal(manifest.name, 'superbash-bantou');
  assert.deepEqual(Object.keys(manifest.tools), ['macbuild', 'publish']);
  for (const tool of ['macbuild', 'publish']) {
    const entry = path.join(ROOT, 'tools', tool, manifest.tools[tool].entry);
    assert.ok(fs.statSync(entry).isFile(), 'entry が無い');
    fs.accessSync(entry, fs.constants.X_OK); // wrapper は entry を直に起動する
    assert.match(fs.readFileSync(entry, 'utf8'), /^#!\/usr\/bin\/env node\n/);
  }

  assert.deepEqual(
    manifest.commands.map((c) => c.name),
    [
      'macbuild-info',
      'macbuild-tauri',
      'macbuild-sign',
      'npm-publish',
      'verdaccio-publish',
      'github-repo-create',
      'github-release-create',
      'gitea-repo-create',
      'gitea-release-create',
    ],
  );
  for (const c of manifest.commands) {
    assert.ok(['macbuild', 'publish'].includes(c.tool), c.name);
    assert.equal(typeof c.version, 'string', c.name);
    assert.equal(typeof c.description, 'string', c.name);
    for (const k of ['subcommand', 'usage', 'in', 'out']) assert.ok(c.spec[k] !== undefined, `${c.name} に spec.${k} が無い`);
    for (const code of Object.keys(c.spec.out.exitCodes)) {
      assert.ok(Object.values(EXIT).includes(Number(code)), `${c.name} の終了 code ${code} を CLI が使わない`);
    }
  }
});

test('CLI の引数の表は spec.in と同じ（名前・flag・型・順・optional）', () => {
  const subs = macbuildCommands.map((c) => c.spec.subcommand);
  assert.deepEqual([...subs].sort(), Object.keys(COMMANDS).sort(), 'CLI の副 command と spec の subcommand');
  for (const c of macbuildCommands) {
    const def = COMMANDS[c.spec.subcommand];
    assert.equal(def.name, c.name);
    const specOptions = Object.entries(c.spec.in.options || {}).map(([key, o]) => ({ key, flag: o.flag, type: o.type }));
    assert.deepEqual(def.options, specOptions, `${c.name} の options`);
    const specPositionals = (c.spec.in.positionals || []).map((p) => ({
      name: p.name,
      type: p.type,
      optional: Boolean(p.optional),
    }));
    assert.deepEqual(def.positionals, specPositionals, `${c.name} の positionals`);
  }
});

test('usage は副 command・すべての flag・positional を書いている', () => {
  for (const c of macbuildCommands) {
    const { usage } = c.spec;
    assert.ok(usage.startsWith(`macbuild ${c.spec.subcommand}`), usage);
    for (const o of Object.values(c.spec.in.options || {})) assert.ok(usage.includes(o.flag), `${usage} に ${o.flag}`);
    for (const p of c.spec.in.positionals || []) assert.ok(usage.includes(`<${p.name}>`), `${usage} に <${p.name}>`);
  }
});

test('help は spec の内容を出す（全体・名前・副 command）', () => {
  const home = makeTmp();
  try {
    const env = cleanEnv(home);
    const all = runCli(['help'], { env });
    assert.equal(all.status, 0, all.stderr);
    assert.equal(all.json.tool, 'macbuild');
    assert.deepEqual(all.json.commands, macbuildCommands);

    for (const c of macbuildCommands) {
      for (const key of [c.name, c.spec.subcommand]) {
        const one = runCli(['help', key], { env });
        assert.equal(one.status, 0, one.stderr);
        assert.deepEqual(one.json, c);
      }
    }
    assert.deepEqual(runCli([], { env }).json, all.json, '引数無しは help');
    const bad = runCli(['help', 'nope'], { env });
    assert.equal(bad.status, EXIT.USAGE);
  } finally {
    rmTmp(home);
  }
});

test('entry は shebang で直に起動できる（wrapper と同じ起動の形）', () => {
  const r = spawnSync(MAIN, ['help', 'info'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).name, 'macbuild-info');
});
