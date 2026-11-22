'use strict';
// module（dist/main.mjs）: 読み込んでも走らない。`main`（citty の command）と `run(rawArgs): Promise<number>` を出し、
// 終了 code を返す（成功 0、使い方の誤り 2、その他の誤り 1 など）。実行は子 process で行い、stdout・stderr を取る。

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { ROOT, MANIFEST, makeTmp, rmTmp, cleanEnv } = require('./helpers/env');

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

/** module を import() し、run(args) の返す数を終了 code にする（振り分けの側と同じ使い方）。 */
function viaModule(tool, args, env, cwd) {
  const file = path.join(ROOT, 'tools', tool, manifest.tools[tool].module);
  const code = `import(${JSON.stringify(file)}).then(async (m) => { process.exitCode = await m.run(${JSON.stringify(args)}); })`;
  return spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', env, cwd });
}

for (const tool of ['macbuild', 'publish']) {
  test(`${tool}: module は読み込んでも走らない。main と run を出し、cli.mjs は module と同じ結果を返す`, () => {
    const home = makeTmp();
    try {
      const env = cleanEnv(home, { PATH: process.env.PATH });
      const file = path.join(ROOT, 'tools', tool, manifest.tools[tool].module);
      assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /^#!/, 'module に shebang は要らない');
      const load = spawnSync(
        process.execPath,
        ['-e', `import(${JSON.stringify(file)}).then((m) => { process.stdout.write(JSON.stringify([Object.keys(m).sort(), typeof m.run, typeof m.main.subCommands, m.main.meta.name])); })`],
        { encoding: 'utf8', env, cwd: home },
      );
      assert.equal(load.status, 0, load.stderr);
      assert.equal(load.stderr, '');
      assert.deepEqual(JSON.parse(load.stdout), [['main', 'run'], 'function', 'object', tool], '読み込むだけで他は何も出さない');

      const entry = path.join(ROOT, 'tools', tool, manifest.tools[tool].entry);
      const cases = [
        [[], 0],
        [['help'], 0],
        [['--help'], 0],
        [['no-such-subcommand'], 2],
        [['help', '-h'], 2],
      ];
      for (const [args, status] of cases) {
        const m = viaModule(tool, args, env, home);
        const c = spawnSync(entry, args, { encoding: 'utf8', env, cwd: home });
        assert.equal(m.status, status, `${tool} ${args.join(' ')}: ${m.stderr}`);
        assert.equal(c.status, status, `cli.mjs ${args.join(' ')}: ${c.stderr}`);
        assert.equal(m.stdout, c.stdout, `${args.join(' ')} の stdout`);
        assert.equal(m.stderr, c.stderr, `${args.join(' ')} の stderr`);
      }
    } finally {
      rmTmp(home);
    }
  });
}

test('module の run は、command が置いた終了 code（process.exitCode）を返し、呼んだ側の値を汚さない（info は darwin 以外でも 0 か 4）', () => {
  const home = makeTmp();
  try {
    const env = cleanEnv(home, { MACBUILD_LOCK_DIR: path.join(home, 'lock'), MACBUILD_LOG_DIR: path.join(home, 'logs') });
    const file = path.join(ROOT, 'tools', 'macbuild', 'dist', 'main.mjs');
    const code = `process.exitCode = 7; import(${JSON.stringify(file)}).then(async (m) => { const c = await m.run(['info']); process.stdout.write('\\n@@' + JSON.stringify([c, process.exitCode])); process.exitCode = 0; })`;
    const r = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', env, cwd: home });
    assert.equal(r.status, 0, r.stderr);
    const [c, after] = JSON.parse(r.stdout.slice(r.stdout.indexOf('@@') + 2));
    assert.ok(c === 0 || c === 4, `info の終了 code: ${c}`);
    assert.equal(after, 7, '呼ぶ前の process.exitCode に戻す');
  } finally {
    rmTmp(home);
  }
});
