'use strict';
// manifest（.manifest/toolconfig.json。正本）と citty の定義（tools/<名前>/src/main.ts）の照合。
// main.ts を読み込み、subCommands を辿って、名前・説明・引数（flag・型・順・必須）を manifest と比べる。
// 照合する対応は toolset の作法 4.2: 要素の name = subCommands の key と meta.name、description = meta.description、
// spec.in.options = args（string・boolean）、spec.in.positionals = args（type: positional。required = !optional）。
// `--no-xxx` の flag は citty では boolean の xxx（default: true）で受ける。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { ROOT, MANIFEST } = require('./helpers/env');
const { loadDef } = require('./helpers/cli-def');
const { leaves } = require('./helpers/spec-in');

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

/** manifest の flag と key から、citty の args の key（`--no-xxx` は xxx）と default を決める。 */
function cittyKey(key, o) {
  return o.flag.startsWith('--no-') ? { name: o.flag.slice('--no-'.length).replace(/-([a-z])/g, (_, c) => c.toUpperCase()), negated: true } : { name: key, negated: false };
}

/** 葉の spec.in と citty の args を比べる（順も）。 */
function compareArgs(label, spec, cmdArgs) {
  const expected = [];
  for (const [key, o] of Object.entries(spec.in.options || {})) {
    const { name, negated } = cittyKey(key, o);
    const e = { name, type: o.type, description: o.description };
    if (negated) e.default = true;
    expected.push(e);
  }
  for (const p of spec.in.positionals || []) {
    expected.push({ name: p.name, type: 'positional', required: !p.optional, description: p.description });
  }
  const actual = Object.entries(cmdArgs || {}).map(([name, d]) => {
    const e = { name, type: d.type, description: d.description };
    if (d.type === 'positional') e.required = d.required === true;
    if (d.default !== undefined) e.default = d.default;
    return e;
  });
  assert.deepEqual(actual, expected, `${label} の args`);
  for (const o of Object.values(spec.in.options || {})) assert.ok(o.type === 'string' || o.type === 'boolean', `${label}: ${o.type} は citty に無い（作法 4.2）`);
}

/** manifest の要素 node と、citty の command cmd を再帰で比べる。 */
function compareNode(label, node, cmd) {
  assert.equal(cmd.meta.name, node.name, `${label} の meta.name`);
  assert.equal(cmd.meta.description, node.description, `${label} の description`);
  const kids = node.subcommands || [];
  if (kids.length > 0) {
    assert.equal(cmd.run, undefined, `${label}: 群は run を持たない（子の後に親の run も走る）`);
    assert.deepEqual(Object.keys(cmd.subCommands), kids.map((k) => k.name), `${label} の子（名前と順）`);
    for (const k of kids) compareNode(`${label} ${k.name}`, k, cmd.subCommands[k.name]);
  } else {
    assert.equal(cmd.subCommands, undefined, `${label}: 葉は subCommands を持たない`);
    assert.equal(typeof cmd.run, 'function', `${label} の run`);
    compareArgs(label, node.spec, cmd.args);
  }
}

for (const tool of ['macbuild', 'publish']) {
  test(`${tool}: main.ts は定義だけ（読み込んでも走らない）で、manifest と同じ木・説明・引数を持つ`, () => {
    const { main } = loadDef(tool);
    const tops = manifest.commands.filter((c) => c.tool === tool);
    assert.equal(main.meta.name, tool);
    assert.equal(main.meta.version, pkg.version);
    assert.equal(typeof main.meta.description, 'string');
    assert.equal(main.run, undefined, '入口の定義は run を持たない');

    // 1 段目: 必須の help と、上の要素の spec.subcommand（無ければ、その子）。
    const first = Object.keys(main.subCommands);
    assert.equal(first[0], 'help', 'help は必須の副 command');
    assert.equal(typeof main.subCommands.help.run, 'function');

    const expectedFirst = [];
    for (const top of tops) {
      assert.equal(top.version, main.meta.version, `${top.name} の version は main の meta.version と同じ`);
      const word = top.spec && top.spec.subcommand;
      if (word) {
        expectedFirst.push(word);
        assert.equal(word, top.name, `${top.name}: spec.subcommand は name と同じ語`);
        compareNode(top.name, top, main.subCommands[word]);
      } else {
        // spec.subcommand の無い上の要素（macbuild）は、その子が 1 段目に並ぶ。
        assert.equal(main.meta.description, top.description, `${top.name} の description は main の meta.description`);
        for (const k of top.subcommands) {
          expectedFirst.push(k.name);
          compareNode(`${top.name} ${k.name}`, k, main.subCommands[k.name]);
        }
      }
    }
    assert.deepEqual(first.slice(1), expectedFirst, '1 段目の key（help の後）');

    // 呼べる葉の数が同じ（定義にだけ在る葉・manifest にだけ在る葉が無い）。
    const count = (cmd) => (cmd.subCommands ? Object.values(cmd.subCommands).reduce((n, c) => n + count(c), 0) : 1);
    const cittyLeaves = Object.entries(main.subCommands)
      .filter(([k]) => k !== 'help')
      .reduce((n, [, c]) => n + count(c), 0);
    assert.equal(cittyLeaves, leaves(manifest, tool).length);
  });
}

test('manifest の flag は citty の kebab の flag と同じ（--target-dir・--dry-run・--notes-file）', () => {
  const { argv } = loadDef('macbuild');
  assert.equal(argv.kebab('targetDir'), 'target-dir');
  assert.equal(argv.kebab('dryRun'), 'dry-run');
  assert.equal(argv.kebab('notesFile'), 'notes-file');
  for (const tool of ['macbuild', 'publish']) {
    const { main, argv: a } = loadDef(tool);
    for (const l of leaves(manifest, tool)) {
      let cmd = main;
      for (const w of l.head) cmd = cmd.subCommands[w];
      for (const [key, o] of Object.entries(l.node.spec.in.options || {})) {
        const { name, negated } = cittyKey(key, o);
        const def = cmd.args[name];
        assert.equal(negated ? `--no-${a.kebab(name)}` : `--${a.kebab(name)}`, o.flag, `${l.name} の ${key}`);
        assert.equal(a.manifestKey(name, def), key, `${l.name} の manifest の key`);
      }
    }
  }
});

test('入口（cli.ts）は runCommand: -h・--help は help の外では使い方の誤り（終了 2、stdout は空）。help と引数無しは全体を出す', async () => {
  const { makeTmp, rmTmp, cleanEnv, runCli } = require('./helpers/env');
  const H = require('./helpers/publish');
  const home = makeTmp();
  try {
    const env = cleanEnv(home);
    for (const argv of [['info', '-h'], ['tauri', '--help', 'x'], ['sign', '--entitlements', 'e', '-h', 'p'], ['info', '--', '-h']]) {
      const r = runCli(argv, { env });
      assert.equal(r.status, 2, argv.join(' '));
      assert.equal(r.stdout, '', `${argv.join(' ')}: usage を stdout に出さない`);
    }
    assert.equal(runCli(['-h'], { env }).status, 0);
    assert.equal(runCli(['--help'], { env }).json.tool, 'macbuild');
    assert.equal(runCli(['help', '-h'], { env }).status, 2, 'help の語としても未知');
    const pub = { ...cleanEnv(home), PATH: process.env.PATH };
    for (const argv of [['github', 'release', 'create', '-h'], ['npm', 'publish', '--', '-h', 'x'], ['github', 'repo'], ['github']]) {
      const r = await H.runPublish(argv, { env: pub, cwd: home });
      assert.equal(r.status, 2, argv.join(' '));
      assert.equal(r.stdout, '');
    }
    assert.equal((await H.runPublish(['-h'], { env: pub, cwd: home })).json.tool, 'publish');
  } finally {
    rmTmp(home);
  }
});
