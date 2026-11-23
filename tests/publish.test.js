'use strict';
// publish の 5 つの葉（npm publish・github repo create・github release create・gitea repo create・gitea release create）:
// manifest（入れ子）と CLI の整合、組み立てた argv・API の要求・出力・秘密の伏せ。
// 偽の npm・gh（PATH の先の stub）、127.0.0.1 の偽の Gitea API server、偽の HOME だけを使う。

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const { EXIT } = require('../tools/publish/src/lib/errors.ts');
const { makeRedactor } = require('../tools/publish/src/lib/secrets.ts');
const { buildArgv, leaves, findLeaf } = require('./helpers/spec-in');
const { MANIFEST, rmTmp } = require('./helpers/env');
const H = require('./helpers/publish');
const { loadDef } = require('./helpers/cli-def');

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const pubTops = manifest.commands.filter((c) => c.tool === 'publish');
const pubLeaves = leaves(manifest, 'publish');
const leaf = (name) => findLeaf(manifest, 'publish', name);
const { parse } = loadDef('publish'); // citty の定義を、入口（cli.ts）と同じ検査・読み方で使う
const NAMES = ['npm publish', 'github repo create', 'github release create', 'gitea repo create', 'gitea release create'];

const REGISTRY = 'http://registry.example.invalid:4873/';
const OTHER_REGISTRY = 'http://other.example.invalid:4873/';

/** 作業 dir・偽の bin・偽の HOME・record dir を作る。 */
function setup(t, { extra = {} } = {}) {
  const work = H.makeTmp('publish-test-');
  t.after(() => rmTmp(work));
  const bin = H.makeFakeBin(path.join(work, 'bin'));
  const { home } = H.makeFakeHome(work);
  const record = path.join(work, 'record');
  fs.mkdirSync(record);
  const env = H.baseEnv({ home, bin, work, extra: { FAKE_RECORD: record, ...extra } });
  const run = (args, more = {}) => H.runPublish(args, { env: { ...env, ...more }, cwd: work });
  return { work, home, record, env, run };
}

function makePackage(work, pkg) {
  const dir = path.join(work, 'pkg');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
  return dir;
}

const noLeak = (r, ...secrets) => {
  for (const s of secrets) {
    assert.ok(!r.stdout.includes(s), `stdout に ${s}`);
    assert.ok(!r.stderr.includes(s), `stderr に ${s}`);
  }
};

// ---- spec と CLI の整合 ----

test('manifest の木: 上の要素は npm・github・gitea（各 spec.subcommand に同じ語）、葉は 5 つ、版は 0.6.2、PR と CI の command は無い', () => {
  assert.deepEqual(pubTops.map((c) => [c.name, c.spec.subcommand, c.version]), [
    ['npm', 'npm', '0.6.2'],
    ['github', 'github', '0.6.2'],
    ['gitea', 'gitea', '0.6.2'],
  ]);
  assert.deepEqual(pubLeaves.map((l) => l.name), NAMES);
  assert.deepEqual(pubLeaves.map((l) => l.head.join(' ')), NAMES, '葉の argv の頭は並びの名前と同じ');
  const github = pubTops.find((c) => c.name === 'github');
  assert.deepEqual(github.subcommands.map((c) => [c.name, c.subcommands.map((x) => x.name)]), [
    ['repo', ['create']],
    ['release', ['create']],
  ]);
  assert.ok(!pubLeaves.some((l) => /(^|\s)(pr|pull|merge|ci|run|status)(\s|$)/.test(l.name)));
});

test('usage と終了 code は葉の spec と同じ（引数の定義の照合は citty.test.js）', () => {
  for (const l of pubLeaves) {
    const s = l.node.spec;
    // usage は MCP で呼ぶ name（並びの名前）と同じ形で始まる（tool 名の publish を頭に付けない）
    assert.ok(s.usage === l.name || s.usage.startsWith(`${l.name} `), s.usage);
    assert.ok(!/^publish\s/.test(s.usage), `${l.name}: usage の頭に tool 名を付けない: ${s.usage}`);
    for (const o of Object.values(s.in.options)) assert.ok(s.usage.includes(o.flag), `${l.name} の usage に ${o.flag}`);
    for (const p of s.in.positionals) assert.ok(s.usage.includes(`<${p.name}>`), `${l.name} の usage に <${p.name}>`);
    for (const code of Object.keys(s.out.exitCodes)) {
      assert.ok(Object.values(EXIT).includes(Number(code)), `${l.name} の終了 code ${code}`);
    }
  }
});

test('終了 code 4 の説明は、その葉が実際に要る物だけを挙げる（gitea は gh を使わない・git の credential で動く）', () => {
  for (const name of ['gitea repo create', 'gitea release create']) {
    const four = leaf(name).node.spec.out.exitCodes['4'];
    assert.ok(!/\bgh\b/.test(four), `${name}: gh を挙げない: ${four}`);
    assert.ok(/git/.test(four), `${name}: git を挙げる: ${four}`);
  }
  for (const name of ['github repo create', 'github release create']) {
    assert.ok(/gh/.test(leaf(name).node.spec.out.exitCodes['4']), `${name}: gh を挙げる`);
  }
  assert.ok(/npm/.test(leaf('npm publish').node.spec.out.exitCodes['4']));
});

test('組んだ argv（`--` を含む）を CLI が同じ値に読み戻す（shell の記号・`-` で始まる値も）', () => {
  const cases = [
    ['npm publish', { registry: REGISTRY, target: 'a b;$(id)`id`*', tag: 'next', access: 'public', dryRun: true }],
    ['npm publish', { target: '-pkg.tgz' }],
    ['github repo create', { repo: 'example/name', visibility: 'public', description: '--説明 "x" & y' }],
    ['github release create', { repo: 'example/name', tag: 'v1.0.0', title: 'T', notesFile: 'n.md', target: 'main', draft: true, prerelease: true, assets: 'a.zip,b.zip' }],
    ['gitea repo create', { url: 'http://127.0.0.1:1', repo: 'example/name' }],
    ['gitea release create', { url: 'http://127.0.0.1:1', repo: 'example/name', tag: 'v1' }],
  ];
  for (const [name, args] of cases) {
    const l = leaf(name);
    const got = parse(buildArgv(l, args));
    const expected = { ...args };
    for (const [key, o] of Object.entries(l.node.spec.in.options)) if (o.type === 'boolean' && expected[key] === undefined) expected[key] = false;
    assert.equal(got.subcommand, l.head.join(' '));
    assert.deepEqual(got.values, expected, name);
  }
  assert.deepEqual(buildArgv(leaf('npm publish'), { target: 'p', tag: 't', access: 'public', dryRun: true }), [
    'npm', 'publish', '--tag', 't', '--access', 'public', '--dry-run', '--', 'p',
  ]);
  assert.deepEqual(buildArgv(leaf('github release create'), { repo: 'a/b', tag: 'v1', draft: true }), [
    'github', 'release', 'create', '--draft', '--', 'a/b', 'v1',
  ]);
  // `--` が無ければ、`-` で始まる値は option と読まれて誤りになる。
  assert.throws(() => parse(['npm', 'publish', '-pkg.tgz']), (e) => e.exitCode === EXIT.USAGE);
});

test('help は `<bin> help [<並び>]`: 全体・葉・群を出す。未知・古い名前・任意の command 文字列は受けない', async (t) => {
  const { run } = setup(t);
  const all = await run(['help']);
  assert.equal(all.status, 0, all.stderr);
  assert.deepEqual(all.json.commands, pubTops);
  for (const l of pubLeaves) {
    assert.deepEqual((await run(['help', ...l.name.split(' ')])).json, l.node, l.name);
    assert.deepEqual((await run(['help', l.name])).json, l.node, `${l.name}（1 つの引数）`);
  }
  assert.deepEqual((await run(['help', 'github', 'release', 'create'])).json, leaf('github release create').node);
  assert.deepEqual((await run(['help', 'github'])).json, pubTops[1], '群も引ける');
  assert.deepEqual((await run(['help', 'github', 'release'])).json, pubTops[1].subcommands[1]);
  const bad = [['nope'], ['github', 'nope'], ['npm-publish'], ['verdaccio-publish'], ['github-repo-create'], ['create']];
  for (const words of bad) assert.equal((await run(['help', ...words])).status, EXIT.USAGE, words.join(' '));
  for (const argv of [
    ['pr-create', 'x'], ['npm-publish', 'x'], ['verdaccio-publish', 'x'], ['github-repo-create', 'a/b'],
    ['npm', 'publish', '--exec', 'id', 'x'], ['npm', 'publish'], ['npm'], ['github'], ['github', 'repo'], ['github', 'release'],
  ]) {
    assert.equal((await run(argv)).status, EXIT.USAGE, argv.join(' '));
  }
});

test('静的: publish の code は curl も shell も使わない', () => {
  const dir = path.join(__dirname, '..', 'tools', 'publish');
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(d, e.name));
      else if (e.name.endsWith('.js')) files.push(path.join(d, e.name));
    }
  })(dir);
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    assert.equal(/['"`]curl['"`]/.test(text), false, f);
    assert.equal(/child_process['"]\)\.(exec|execSync)\b/.test(text), false, f);
  }
});

// ---- 秘密の伏せ ----

test('redactor: 形による伏せと値による伏せ', () => {
  const { redact, add } = makeRedactor(['env-secret-value-xyz']);
  add('runtime-token-abcdef');
  const text = [
    '//registry.example.invalid/:_authToken=abc123',
    `token ${H.FAKE.npmToken} ${H.FAKE.ghToken}`,
    'Authorization: token runtime-token-abcdef',
    'https://user:pw@git.example.invalid/x',
    'env-secret-value-xyz',
  ].join('\n');
  const out = redact(text);
  for (const s of ['abc123', H.FAKE.npmToken, H.FAKE.ghToken, 'runtime-token-abcdef', 'user:pw', 'env-secret-value-xyz']) {
    assert.ok(!out.includes(s), `${s} が残る: ${out}`);
  }
  assert.ok(out.includes('git.example.invalid/x'));
});

// ---- npm publish ----

test('npm publish: --registry が無ければ npm 自身の設定のまま（--registry を渡さない）。option を argv の配列で渡す', async (t) => {
  const { work, record, run } = setup(t);
  const dir = makePackage(work, { name: 'example-pkg', version: '1.2.3' });
  const r = await run(['npm', 'publish', '--tag', 'next', '--access', 'public', '--dry-run', dir]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.json, {
    ok: true, registry: null, target: dir, targetKind: 'dir', name: 'example-pkg', version: '1.2.3',
    tag: 'next', access: 'public', dryRun: true, pingSkipped: false,
  });
  const [rec] = H.readRecords(record);
  assert.deepEqual(rec.args, ['publish', dir, '--json', '--tag', 'next', '--access', 'public', '--dry-run']);
  assert.equal(rec.cwd, fs.realpathSync(dir));
  assert.equal(rec.env.NPM_CONFIG_USERCONFIG, path.join(work, 'npmrc'), 'host の npm の設定（userconfig）はそのまま渡る');
});

test('npm publish: --registry は option で受け、相対 path は cwd から絶対 path に。scope の package は scope の registry も指定する', async (t) => {
  const { work, record, run } = setup(t);
  makePackage(work, { name: '@example/scoped', version: '0.0.1' });
  const r = await run(['npm', 'publish', '--registry', REGISTRY, '--', 'pkg']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.json.registry, REGISTRY);
  const [rec] = H.readRecords(record);
  assert.deepEqual(rec.args, ['publish', path.join(work, 'pkg'), '--registry', REGISTRY, '--json', `--@example:registry=${REGISTRY}`]);
  assert.equal(r.json.tag, null);

  // scope の package でも、--registry が無ければ scope の registry は指定しない。
  const none = await run(['npm', 'publish', 'pkg']);
  assert.equal(none.status, 0, none.stderr);
  const rec2 = H.readRecords(record).find((x) => !x.args.includes('--registry'));
  assert.deepEqual(rec2.args, ['publish', path.join(work, 'pkg'), '--json']);
});

test('npm publish: tarball も受ける（名前と版は tarball の package.json から）', async (t) => {
  const { work, record, run } = setup(t);
  const dir = path.join(work, 'build', 'package');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'tar-pkg', version: '2.0.0' }));
  const tgz = path.join(work, 'tar-pkg-2.0.0.tgz');
  const tar = spawnSync('tar', ['-czf', tgz, '-C', path.join(work, 'build'), 'package']);
  assert.equal(tar.status, 0);
  const r = await run(['npm', 'publish', '--registry', REGISTRY, tgz]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.json.targetKind, 'tarball');
  assert.equal(r.json.name, 'tar-pkg');
  assert.equal(r.json.registry, REGISTRY);
  assert.deepEqual(H.readRecords(record)[0].args.slice(0, 4), ['publish', tgz, '--registry', REGISTRY]);
});

test('publish の前に、実際に publish する registry へ届くかを短い上限・retry 無しで確かめる（dry-run でも）', async (t) => {
  const { work, record, run } = setup(t);
  const dir = makePackage(work, { name: 'example-pkg', version: '1.0.0' });
  const withReg = await run(['npm', 'publish', '--registry', REGISTRY, '--dry-run', dir]);
  assert.equal(withReg.status, 0, withReg.stderr);
  const withoutReg = await run(['npm', 'publish', '--dry-run', dir]);
  assert.equal(withoutReg.status, 0, withoutReg.stderr);
  const pings = H.readPings(record).map((p) => p.args);
  assert.equal(pings.length, 2);
  assert.ok(pings.some((a) => JSON.stringify(a) === JSON.stringify(['ping', '--registry', REGISTRY, '--fetch-retries=0', '--fetch-timeout=10000'])), 'option の registry に対して');
  assert.ok(pings.some((a) => JSON.stringify(a) === JSON.stringify(['ping', '--fetch-retries=0', '--fetch-timeout=10000'])), 'option が無ければ npm 自身の設定に対して（--registry を付けない）');
  assert.equal(H.readRecords(record).length, 2, 'publish は 2 回');
});

test('npm publish: --registry が無く scope 付き・publishConfig.registry 付きの package では、ping を省いて publish に任せる（pingSkipped）', async (t) => {
  const { work, record, run } = setup(t);
  const scoped = makePackage(work, { name: '@example/scoped', version: '1.0.0' });
  const a = await run(['npm', 'publish', scoped]);
  assert.equal(a.status, 0, a.stderr);
  assert.equal(a.json.pingSkipped, true);
  assert.match(a.stderr, /ping を省く/);

  const pc = path.join(work, 'withpc');
  fs.mkdirSync(pc);
  fs.writeFileSync(path.join(pc, 'package.json'), JSON.stringify({ name: 'plain', version: '1.0.0', publishConfig: { registry: OTHER_REGISTRY } }));
  const b = await run(['npm', 'publish', '--dry-run', pc]);
  assert.equal(b.status, 0, b.stderr);
  assert.equal(b.json.pingSkipped, true);

  assert.equal(H.readPings(record).length, 0, 'ping は走らない');
  assert.equal(H.readRecords(record).length, 2, 'publish は走る');

  // --registry を付けた時は、scope 付きでも ping する。
  const c = await run(['npm', 'publish', '--registry', REGISTRY, scoped]);
  assert.equal(c.status, 0, c.stderr);
  assert.equal(c.json.pingSkipped, false);
  assert.equal(H.readPings(record).length, 1);

  // scope も publishConfig も無い package は、--registry が無くても ping する。
  const plain = path.join(work, 'plain');
  fs.mkdirSync(plain);
  fs.writeFileSync(path.join(plain, 'package.json'), JSON.stringify({ name: 'plain', version: '1.0.0' }));
  const d = await run(['npm', 'publish', plain]);
  assert.equal(d.json.pingSkipped, false);
  assert.equal(H.readPings(record).length, 2);
});

test('npm publish: 届かない registry（閉じた port）では、すぐ ok:false を返し publish を走らせない', async (t) => {
  const { work, record, run } = setup(t);
  const dir = makePackage(work, { name: 'example-pkg', version: '1.0.0' });
  const srv = http.createServer();
  await new Promise((res) => srv.listen(0, '127.0.0.1', res));
  const { port } = srv.address();
  await new Promise((res) => srv.close(res)); // 閉じた port
  const registry = `http://127.0.0.1:${port}/`;
  for (const extra of [[], ['--dry-run']]) {
    const started = Date.now();
    const r = await run(['npm', 'publish', '--registry', registry, ...extra, dir], { FAKE_PING_REAL: '1' });
    assert.ok(Date.now() - started < 5000, '数秒以内に返る');
    assert.equal(r.status, EXIT.FAIL, r.stderr);
    assert.equal(r.json.ok, false);
    assert.equal(r.json.registry, registry);
    assert.match(r.json.error, /registry に届かない/);
    assert.match(r.json.error, /ローカルネットワーク制限/);
  }
  assert.equal(H.readRecords(record).length, 0, 'publish の stub は呼ばれない');
  assert.equal(H.readPings(record).length, 2, 'ping は publish と dry-run の 2 回');
});

test('npm publish: 届く registry（偽の server）では今のまま publish を呼ぶ', async (t) => {
  const { work, record, run } = setup(t);
  const dir = makePackage(work, { name: 'example-pkg', version: '1.0.0' });
  const srv = http.createServer((req, res) => res.end('{}'));
  await new Promise((res) => srv.listen(0, '127.0.0.1', res));
  t.after(() => new Promise((res) => srv.close(res)));
  const registry = `http://127.0.0.1:${srv.address().port}/`;
  const r = await run(['npm', 'publish', '--registry', registry, dir], { FAKE_PING_REAL: '1' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.json.ok, true);
  const recs = H.readRecords(record);
  assert.equal(recs.length, 1);
  assert.deepEqual(recs[0].args, ['publish', dir, '--registry', registry, '--json']);
});

test('npm publish: 失敗の message と環境の秘密は伏せる・使い方の誤り・publishConfig の食い違い', async (t) => {
  const { work, record, run } = setup(t);
  const dir = makePackage(work, { name: 'example-pkg', version: '1.0.0' });
  const r = await run(['npm', 'publish', dir], {
    NPM_TOKEN: H.FAKE.envSecret,
    NPM_CONFIG_ALWAYS_AUTH: 'true', // 名前が AUTH の変数の値 true で、出力の JSON を壊さない
    FAKE_EXIT: '1',
    FAKE_STDERR: `npm error 401 //registry.example.invalid/:_authToken=${H.FAKE.npmToken} ${H.FAKE.envSecret}`,
  });
  assert.equal(r.status, 1);
  assert.ok(r.json, `stdout が JSON でない: ${r.stdout}`);
  assert.equal(r.json.ok, false);
  assert.equal(r.json.dryRun, false);
  assert.match(r.json.error, /npm publish が失敗/);
  noLeak(r, H.FAKE.npmToken, H.FAKE.envSecret);

  for (const args of [['--access', 'secret', dir], ['--tag', '-x', dir], [path.join(work, 'nope')], [path.join(work, 'pkg', 'package.json')]]) {
    const bad = await run(['npm', 'publish', ...args]);
    assert.equal(bad.status, EXIT.USAGE, args.join(' '));
  }

  const other = path.join(work, 'other');
  fs.mkdirSync(other);
  fs.writeFileSync(path.join(other, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0', publishConfig: { registry: OTHER_REGISTRY } }));
  const before = H.readRecords(record).length;
  const mismatch = await run(['npm', 'publish', '--registry', REGISTRY, other]);
  assert.equal(mismatch.status, 1);
  assert.match(mismatch.json.error, /publishConfig\.registry/);
  assert.equal(H.readRecords(record).length, before, 'npm を起動していない');
  // --registry が無ければ、package の publishConfig は npm 自身に任せる（食い違いの確かめは無い）。
  const dflt = await run(['npm', 'publish', other]);
  assert.equal(dflt.status, 0, dflt.stderr);
});

test('npm publish: --registry の不正（URL でない・http か https 以外・認証情報つき）は使い方の誤り（終了 code 2）', async (t) => {
  const { work, record, run } = setup(t);
  const dir = makePackage(work, { name: 'p', version: '1.0.0' });
  for (const bad of ['not a url', 'ftp://x.example.invalid/', 'http://user:pw@x.example.invalid/', 'http://x.example.invalid/?a=b']) {
    const r = await run(['npm', 'publish', '--registry', bad, dir]);
    assert.equal(r.status, EXIT.USAGE, bad);
    noLeak(r, 'user:pw');
  }
  assert.equal(H.readRecords(record).length, 0);
  assert.equal(H.readPings(record).length, 0);
});

test('npm が PATH に無ければ終了 code 4', async (t) => {
  const { work, env } = setup(t);
  const dir = makePackage(work, { name: 'p', version: '1.0.0' });
  const r = await H.runPublish(['npm', 'publish', dir], { env: { ...env, PATH: '/nonexistent' }, cwd: work });
  assert.equal(r.status, EXIT.ENV);
  assert.match(r.json.error, /npm が PATH に無い/);
});

// ---- GitHub（偽の gh） ----

test('github repo create: gh repo create の argv と出力（URL は gh が返した物だけ）', async (t) => {
  const { record, run } = setup(t);
  const r = await run(['github', 'repo', 'create', '--visibility', 'public', '--description', '--説明 "q"', 'example/new-repo']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.json, { ok: true, repo: 'example/new-repo', visibility: 'public', url: 'https://gh.example.invalid/example/new-repo' });
  const [rec] = H.readRecords(record);
  assert.deepEqual(rec.args, ['repo', 'create', 'example/new-repo', '--public', '--description=--説明 "q"']);

  const dflt = await run(['github', 'repo', 'create', 'example/other']);
  assert.equal(dflt.json.visibility, 'private');
  assert.ok(H.readRecords(record).some((x) => x.args.includes('--private')));
  for (const bad of [['--visibility', 'secret', 'a/b'], ['no-slash'], ['a/b/c'], ['-a/b']]) {
    assert.equal((await run(['github', 'repo', 'create', ...bad])).status, EXIT.USAGE, bad.join(' '));
  }

  // gh が URL を返さなければ、自分で組まず null。
  const none = await run(['github', 'repo', 'create', 'example/nourl'], { FAKE_NO_URL: '1' });
  assert.equal(none.status, 0, none.stderr);
  assert.deepEqual(none.json, { ok: true, repo: 'example/nourl', visibility: 'private', url: null });
});

test('github repo create: 失敗は終了 code 1 で、gh の message の秘密を伏せる。gh が無ければ 4', async (t) => {
  const { env, work, run } = setup(t);
  const r = await run(['github', 'repo', 'create', 'example/x'], {
    GH_TOKEN: H.FAKE.ghToken,
    FAKE_EXIT: '1',
    FAKE_STDERR: `HTTP 401 bad credentials ${H.FAKE.ghToken}`,
  });
  assert.equal(r.status, 1);
  assert.match(r.json.error, /repo の作成が失敗/);
  noLeak(r, H.FAKE.ghToken);
  const none = await H.runPublish(['github', 'repo', 'create', 'example/x'], { env: { ...env, PATH: '/nonexistent' }, cwd: work });
  assert.equal(none.status, EXIT.ENV);
});

test('github release create: gh release create の argv（asset・notes・target・draft・prerelease）', async (t) => {
  const { work, record, run } = setup(t);
  fs.writeFileSync(path.join(work, 'notes.md'), 'body');
  fs.writeFileSync(path.join(work, 'a.zip'), 'a');
  fs.writeFileSync(path.join(work, 'b.zip'), 'b');
  const r = await run([
    'github', 'release', 'create', '--title', 'Title X', '--notes-file', 'notes.md', '--target', 'main', '--draft', '--prerelease',
    '--assets', 'a.zip,b.zip', '--', 'example/repo', 'v1.0.0',
  ]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.json.url, 'https://gh.example.invalid/example/repo/releases/tag/v1.0.0');
  assert.deepEqual(r.json.assets, [path.join(work, 'a.zip'), path.join(work, 'b.zip')]);
  const [rec] = H.readRecords(record);
  assert.deepEqual(rec.args, [
    'release', 'create', 'v1.0.0', path.join(work, 'a.zip'), path.join(work, 'b.zip'), '--repo=example/repo', '--title=Title X',
    `--notes-file=${path.join(work, 'notes.md')}`, '--target=main', '--draft', '--prerelease',
  ]);

  const min = await run(['github', 'release', 'create', 'example/repo', 'v2']);
  assert.equal(min.status, 0, min.stderr);
  const rec2 = H.readRecords(record).find((x) => x.args[2] === 'v2');
  assert.deepEqual(rec2.args, ['release', 'create', 'v2', '--repo=example/repo', '--title=v2', '--notes=']);

  const nourl = await run(['github', 'release', 'create', 'example/repo', 'v3'], { FAKE_NO_URL: '1' });
  assert.equal(nourl.status, 0, nourl.stderr);
  assert.equal(nourl.json.url, null, 'gh が URL を返さなければ自分で組まない');

  for (const bad of [['example/repo', '--bad'], ['example/repo', 'v1', '--x'], ['--assets', 'missing.zip', 'example/repo', 'v1'], ['--notes-file', 'missing.md', 'example/repo', 'v1']]) {
    assert.equal((await run(['github', 'release', 'create', ...bad])).status, EXIT.USAGE, bad.join(' '));
  }
});

// ---- Gitea（127.0.0.1 の偽の API server と、偽の HOME の git credential） ----

async function giteaSetup(t, serverOpts = {}) {
  const ctx = setup(t);
  const server = await H.startFakeGitea({ token: H.FAKE.giteaToken, ...serverOpts });
  t.after(() => server.close());
  const credRecord = path.join(ctx.work, 'cred.log');
  const extra = { FAKE_CRED_VALUE: H.FAKE.giteaToken, FAKE_CRED_RECORD: credRecord };
  // cmd（['gitea', 'repo', 'create']）の直後に --url（呼ぶ時の引数）を足して呼ぶ。
  const grun = (cmd, args, more = {}) => ctx.run([...cmd, '--url', server.url, ...args], { ...extra, ...more });
  return { ...ctx, server, credRecord, grun };
}
const REPO = ['gitea', 'repo', 'create'];
const REL = ['gitea', 'release', 'create'];

test('gitea repo create: user の repo（owner が token の持ち主）と organization の repo。token は git credential fill から', async (t) => {
  const { server, credRecord, grun } = await giteaSetup(t);
  const r = await grun(REPO, ['--visibility', 'public', '--description', 'desc', `${H.FAKE.giteaUser}/mine`]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.json, { ok: true, repo: `${H.FAKE.giteaUser}/mine`, visibility: 'public', url: `${server.url}/${H.FAKE.giteaUser}/mine` });
  const [who, req] = server.requests;
  assert.equal(who.method, 'GET');
  assert.equal(who.url, '/api/v1/user', 'token の持ち主を引く');
  assert.equal(req.method, 'POST');
  assert.equal(req.url, '/api/v1/user/repos');
  assert.equal(req.headers.authorization, `token ${H.FAKE.giteaToken}`);
  assert.deepEqual(JSON.parse(req.body.toString()), { name: 'mine', private: false, description: 'desc' });
  noLeak(r, H.FAKE.giteaToken);

  const org = await grun(REPO, ['example-org/theirs']);
  assert.equal(org.status, 0, org.stderr);
  assert.equal(server.requests[3].url, '/api/v1/orgs/example-org/repos');
  assert.equal(JSON.parse(server.requests[3].body.toString()).private, true, '既定は private');

  // git credential fill には protocol・host（port 付き）が渡る（username は渡さない）。
  const input = JSON.parse(fs.readFileSync(credRecord, 'utf8').split('\n')[0]);
  assert.match(input, /protocol=http\n/);
  assert.ok(input.includes(`host=${server.host}\n`), input);
  assert.ok(!/username=/.test(input), input);
});

test('gitea repo create: API が url を返さなければ自分で組まず null', async (t) => {
  const { grun } = await giteaSetup(t, {
    handler: (req) => (req.method === 'POST' ? { status: 201, body: { name: 'x' } } : null),
  });
  const r = await grun(REPO, [`${H.FAKE.giteaUser}/x`]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.json.url, null);
});

test('gitea repo create: 失敗（API の message に token が混ざっても伏せる）・--url が無いのは使い方の誤り・token の不足は終了 code 4', async (t) => {
  const { server, grun, env, work } = await giteaSetup(t, {
    handler: (req) => (req.url.endsWith('/user/repos') ? { status: 409, body: { message: `repo exists (${H.FAKE.giteaToken})` } } : null),
  });
  const r = await grun(REPO, [`${H.FAKE.giteaUser}/dup`]);
  assert.equal(r.status, 1);
  assert.match(r.json.error, /HTTP 409/);
  noLeak(r, H.FAKE.giteaToken);

  const noUrl = await H.runPublish(['gitea', 'repo', 'create', 'a/b'], { env, cwd: work });
  assert.equal(noUrl.status, EXIT.USAGE);
  assert.match(noUrl.stderr, /--url/);
  for (const bad of ['not a url', 'ftp://x.example.invalid/', 'http://user:pw@x.example.invalid/', 'http://x.example.invalid/?a=b']) {
    const b = await H.runPublish(['gitea', 'repo', 'create', '--url', bad, 'a/b'], { env, cwd: work });
    assert.equal(b.status, EXIT.USAGE, bad);
    noLeak(b, 'user:pw');
  }
  assert.equal(server.requests.length, 2, 'ここまでの API の要求は、最初の呼び出しの 2 回（user と repos）だけ');

  const noToken = await grun(REPO, ['a/b'], { FAKE_CRED_NONE: '1' });
  assert.equal(noToken.status, EXIT.ENV);
  assert.match(noToken.json.error, /token が取れない/);
  assert.equal(server.requests.length, 2, 'token が無ければ API を呼ばない');
});

test('gitea repo create: redirect は追わない（別の host に token を持ち出さない）', async (t) => {
  const other = await H.startFakeGitea({ token: H.FAKE.giteaToken });
  t.after(() => other.close());
  const { grun } = await giteaSetup(t, {
    handler: () => ({ status: 307, body: {}, headers: { Location: `${other.url}/api/v1/user` } }),
  });
  const r = await grun(REPO, [`${H.FAKE.giteaUser}/x`]);
  assert.equal(r.status, 1);
  assert.match(r.json.error, /HTTP 307/);
  assert.equal(other.requests.length, 0);
});

test('gitea release create: release を作り asset を添付する（multipart）', async (t) => {
  const { work, server, grun, env } = await giteaSetup(t);
  fs.writeFileSync(path.join(work, 'notes.md'), '# notes\nbody');
  fs.writeFileSync(path.join(work, 'a.bin'), 'AAA-asset-content');
  fs.writeFileSync(path.join(work, 'b.txt'), 'BBB-asset-content');
  const r = await grun(REL, [
    '--title', 'Rel', '--notes-file', 'notes.md', '--target', 'main', '--draft', '--prerelease',
    '--assets', 'a.bin,b.txt', '--', 'example-org/repo', 'v1.0.0',
  ]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.json.url, `${server.url}/example-org/repo/releases/tag/v1.0.0`);
  assert.deepEqual(r.json.uploaded, [path.join(work, 'a.bin'), path.join(work, 'b.txt')]);
  const [rel, a, b] = server.requests;
  assert.equal(rel.url, '/api/v1/repos/example-org/repo/releases');
  assert.deepEqual(JSON.parse(rel.body.toString()), {
    tag_name: 'v1.0.0', name: 'Rel', body: '# notes\nbody', draft: true, prerelease: true, target_commitish: 'main',
  });
  assert.equal(a.url, '/api/v1/repos/example-org/repo/releases/100/assets?name=a.bin');
  assert.match(a.headers['content-type'], /^multipart\/form-data; boundary=/);
  assert.ok(a.body.toString().includes('name="attachment"; filename="a.bin"'));
  assert.ok(a.body.toString().includes('AAA-asset-content'));
  assert.equal(b.url, '/api/v1/repos/example-org/repo/releases/100/assets?name=b.txt');
  assert.ok(b.body.toString().includes('BBB-asset-content'));
  for (const q of server.requests) assert.equal(q.headers.authorization, `token ${H.FAKE.giteaToken}`);
  noLeak(r, H.FAKE.giteaToken);

  const min = await grun(REL, ['example-org/repo', 'v2']);
  assert.equal(min.status, 0, min.stderr);
  const body = JSON.parse(server.requests[3].body.toString());
  assert.deepEqual(body, { tag_name: 'v2', name: 'v2', body: '', draft: false, prerelease: false });

  const noUrl = await H.runPublish(['gitea', 'release', 'create', 'a/b', 'v1'], { env, cwd: work });
  assert.equal(noUrl.status, EXIT.USAGE, '--url が無い');
});

test('gitea release create: API が url を返さなければ null。asset の添付が失敗したら、作成済みの release の url と添付できた物を返す', async (t) => {
  const noUrl = await giteaSetup(t, {
    handler: (req) => (/\/releases$/.test(req.url) ? { status: 201, body: { id: 5 } } : null),
  });
  const n = await noUrl.grun(REL, ['example-org/repo', 'v9']);
  assert.equal(n.status, 0, n.stderr);
  assert.equal(n.json.url, null);

  const { work, grun } = await giteaSetup(t, {
    handler: (req) => (req.url.includes('name=bad.bin') ? { status: 500, body: { message: `boom ${H.FAKE.giteaToken}` } } : null),
  });
  fs.writeFileSync(path.join(work, 'ok.bin'), '1');
  fs.writeFileSync(path.join(work, 'bad.bin'), '2');
  const r = await grun(REL, ['--assets', 'ok.bin,bad.bin', 'example-org/repo', 'v1']);
  assert.equal(r.status, 1);
  assert.equal(r.json.ok, false);
  assert.ok(r.json.url.endsWith('/releases/tag/v1'));
  assert.deepEqual(r.json.uploaded, [path.join(work, 'ok.bin')]);
  assert.equal(r.json.failedAsset, path.join(work, 'bad.bin'));
  noLeak(r, H.FAKE.giteaToken);
});
