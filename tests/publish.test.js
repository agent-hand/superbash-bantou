'use strict';
// publish の 6 command: spec と CLI の整合、組み立てた argv・API の要求・出力・秘密の伏せ。
// 偽の npm・gh（PATH の先の stub）、127.0.0.1 の偽の Gitea API server、偽の HOME だけを使う。

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { COMMANDS, parse } = require('../tools/publish/lib/commands');
const { EXIT } = require('../tools/publish/lib/errors');
const { makeRedactor } = require('../tools/publish/lib/secrets');
const { buildArgv } = require('./helpers/spec-in');
const { MANIFEST, rmTmp } = require('./helpers/env');
const H = require('./helpers/publish');

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const pubCommands = manifest.commands.filter((c) => c.tool === 'publish');
const spec = (name) => pubCommands.find((c) => c.name === name).spec;
const NAMES = ['npm-publish', 'verdaccio-publish', 'github-repo-create', 'github-release-create', 'gitea-repo-create', 'gitea-release-create'];

const NPMJS = 'https://registry.npmjs.org/';
const VERDACCIO = 'http://registry.example.invalid:4873/';

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

test('publish の command は 6 つで、tool は publish・版は 0.2.0・PR と CI の command は無い', () => {
  assert.deepEqual(pubCommands.map((c) => c.name), NAMES);
  for (const c of pubCommands) {
    assert.equal(c.version, '0.2.0');
    assert.equal(c.spec.subcommand, c.name);
  }
  assert.ok(!pubCommands.some((c) => /(^|-)(pr|pull|merge|ci|run|status)(-|$)/.test(c.name)));
});

test('CLI の引数の表は spec.in と同じ（名前・flag・型・順・optional・usage）', () => {
  assert.deepEqual(Object.keys(COMMANDS).sort(), [...NAMES].sort());
  for (const c of pubCommands) {
    const def = COMMANDS[c.spec.subcommand];
    assert.equal(def.name, c.name);
    const opts = Object.entries(c.spec.in.options || {}).map(([key, o]) => ({ key, flag: o.flag, type: o.type }));
    assert.deepEqual(def.options, opts, c.name);
    const pos = (c.spec.in.positionals || []).map((p) => ({ name: p.name, type: p.type, optional: Boolean(p.optional) }));
    assert.deepEqual(def.positionals, pos, c.name);
    assert.ok(c.spec.usage.startsWith(`publish ${c.spec.subcommand}`));
    for (const o of Object.values(c.spec.in.options)) assert.ok(c.spec.usage.includes(o.flag), `${c.name} の usage に ${o.flag}`);
    for (const p of c.spec.in.positionals) assert.ok(c.spec.usage.includes(`<${p.name}>`), `${c.name} の usage に <${p.name}>`);
    for (const code of Object.keys(c.spec.out.exitCodes)) {
      assert.ok(Object.values(EXIT).includes(Number(code)), `${c.name} の終了 code ${code}`);
    }
  }
});

test('組んだ argv を CLI が同じ値に読み戻す（shell の記号を含む値も）', () => {
  const cases = [
    ['npm-publish', { target: 'a b;$(id)`id`*', tag: 'next', access: 'public', dryRun: true }],
    ['verdaccio-publish', { target: 'pkg.tgz' }],
    ['github-repo-create', { repo: 'example/name', visibility: 'public', description: '--説明 "x" & y' }],
    ['github-release-create', { repo: 'example/name', tag: 'v1.0.0', title: 'T', notesFile: 'n.md', target: 'main', draft: true, prerelease: true, assets: 'a.zip,b.zip' }],
    ['gitea-repo-create', { repo: 'example/name' }],
    ['gitea-release-create', { repo: 'example/name', tag: 'v1' }],
  ];
  for (const [name, args] of cases) {
    const s = spec(name);
    const got = parse(buildArgv(s, args));
    const expected = { ...args };
    for (const [key, o] of Object.entries(s.in.options)) if (o.type === 'boolean' && expected[key] === undefined) expected[key] = false;
    assert.equal(got.subcommand, s.subcommand);
    assert.deepEqual(got.values, expected, name);
  }
  assert.deepEqual(buildArgv(spec('npm-publish'), { target: 'p', tag: 't', access: 'public', dryRun: true }), [
    'npm-publish', '--tag', 't', '--access', 'public', '--dry-run', 'p',
  ]);
});

test('help は spec を出す・未知や任意の command 文字列は受けない', async (t) => {
  const { run } = setup(t);
  const all = await run(['help']);
  assert.equal(all.status, 0, all.stderr);
  assert.deepEqual(all.json.commands, pubCommands);
  for (const c of pubCommands) assert.deepEqual((await run(['help', c.name])).json, c);
  assert.equal((await run(['help', 'nope'])).status, EXIT.USAGE);
  assert.equal((await run(['pr-create', 'x'])).status, EXIT.USAGE);
  assert.equal((await run(['npm-publish', '--exec', 'id', 'x'])).status, EXIT.USAGE);
  assert.equal((await run(['npm-publish'])).status, EXIT.USAGE);
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
    '//registry.npmjs.org/:_authToken=abc123',
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

// ---- npm-publish・verdaccio-publish ----

test('npm-publish: npmjs を --registry で明示し、option を argv の配列で渡す', async (t) => {
  const { work, record, run } = setup(t);
  const dir = makePackage(work, { name: 'example-pkg', version: '1.2.3' });
  const r = await run(['npm-publish', '--tag', 'next', '--access', 'public', '--dry-run', dir]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.json, {
    ok: true, registry: NPMJS, target: dir, targetKind: 'dir', name: 'example-pkg', version: '1.2.3',
    tag: 'next', access: 'public', dryRun: true,
  });
  const [rec] = H.readRecords(record);
  assert.deepEqual(rec.args, ['publish', dir, '--registry', NPMJS, '--json', '--tag', 'next', '--access', 'public', '--dry-run']);
  assert.equal(rec.cwd, fs.realpathSync(dir));
  assert.equal(rec.env.NPM_CONFIG_USERCONFIG, path.join(work, 'npmrc'), 'host の npm の設定（userconfig）はそのまま渡る');
});

test('npm-publish: 相対 path は cwd から絶対 path にし、scope の package は scope の registry も指定する', async (t) => {
  const { work, record, run } = setup(t);
  makePackage(work, { name: '@example/scoped', version: '0.0.1' });
  const r = await run(['npm-publish', 'pkg']);
  assert.equal(r.status, 0, r.stderr);
  const [rec] = H.readRecords(record);
  assert.deepEqual(rec.args, ['publish', path.join(work, 'pkg'), '--registry', NPMJS, '--json', `--@example:registry=${NPMJS}`]);
  assert.equal(r.json.tag, null);
});

test('npm-publish: tarball も受ける（名前と版は tarball の package.json から）', async (t) => {
  const { work, record, run } = setup(t);
  const dir = path.join(work, 'build', 'package');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'tar-pkg', version: '2.0.0' }));
  const tgz = path.join(work, 'tar-pkg-2.0.0.tgz');
  const tar = spawnSync('tar', ['-czf', tgz, '-C', path.join(work, 'build'), 'package']);
  assert.equal(tar.status, 0);
  const r = await run(['verdaccio-publish', tgz], { PUBLISH_VERDACCIO_REGISTRY: VERDACCIO });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.json.targetKind, 'tarball');
  assert.equal(r.json.name, 'tar-pkg');
  assert.equal(r.json.registry, VERDACCIO);
  assert.deepEqual(H.readRecords(record)[0].args.slice(0, 4), ['publish', tgz, '--registry', VERDACCIO]);
});

test('npm-publish: 失敗の message と環境の秘密は伏せる・使い方の誤り・publishConfig の食い違い', async (t) => {
  const { work, record, run } = setup(t);
  const dir = makePackage(work, { name: 'example-pkg', version: '1.0.0' });
  const r = await run(['npm-publish', dir], {
    NPM_TOKEN: H.FAKE.envSecret,
    NPM_CONFIG_ALWAYS_AUTH: 'true', // 名前が AUTH の変数の値 true で、出力の JSON を壊さない
    FAKE_EXIT: '1',
    FAKE_STDERR: `npm error 401 //registry.npmjs.org/:_authToken=${H.FAKE.npmToken} ${H.FAKE.envSecret}`,
  });
  assert.equal(r.status, 1);
  assert.ok(r.json, `stdout が JSON でない: ${r.stdout}`);
  assert.equal(r.json.ok, false);
  assert.equal(r.json.dryRun, false);
  assert.match(r.json.error, /npm publish が失敗/);
  noLeak(r, H.FAKE.npmToken, H.FAKE.envSecret);

  for (const args of [['--access', 'secret', dir], ['--tag', '-x', dir], [path.join(work, 'nope')], [path.join(work, 'pkg', 'package.json')]]) {
    const bad = await run(['npm-publish', ...args]);
    assert.equal(bad.status, EXIT.USAGE, args.join(' '));
  }

  const other = path.join(work, 'other');
  fs.mkdirSync(other);
  fs.writeFileSync(path.join(other, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0', publishConfig: { registry: VERDACCIO } }));
  const before = H.readRecords(record).length;
  const mismatch = await run(['npm-publish', other]);
  assert.equal(mismatch.status, 1);
  assert.match(mismatch.json.error, /publishConfig\.registry/);
  assert.equal(H.readRecords(record).length, before, 'npm を起動していない');
});

test('npm が PATH に無ければ終了 code 4', async (t) => {
  const { work, env } = setup(t);
  const dir = makePackage(work, { name: 'p', version: '1.0.0' });
  const r = await H.runPublish(['npm-publish', dir], { env: { ...env, PATH: '/nonexistent' }, cwd: work });
  assert.equal(r.status, EXIT.ENV);
  assert.match(r.json.error, /npm が PATH に無い/);
});

test('verdaccio-publish: host の設定（環境変数・file）の registry を使う。無い・不正なら終了 code 4', async (t) => {
  const { work, home, record, run } = setup(t);
  const dir = makePackage(work, { name: 'p', version: '1.0.0' });

  const none = await run(['verdaccio-publish', dir]);
  assert.equal(none.status, EXIT.ENV);
  assert.match(none.json.error, /verdaccioRegistry/);
  assert.equal(H.readRecords(record).length, 0);

  fs.mkdirSync(path.join(home, '.config', 'superbash-bantou'), { recursive: true });
  fs.writeFileSync(
    path.join(home, '.config', 'superbash-bantou', 'config.json'),
    JSON.stringify({ verdaccioRegistry: 'http://file.example.invalid:4873', identity: 'x', futureKey: 1 }),
  );
  const fromFile = await run(['verdaccio-publish', dir]);
  assert.equal(fromFile.status, 0, fromFile.stderr);
  assert.equal(fromFile.json.registry, 'http://file.example.invalid:4873/');
  assert.match(fromFile.stderr, /未知の key.*futureKey/);
  assert.ok(!/identity/.test(fromFile.stderr), 'macbuild の key は警告しない');

  const fromEnv = await run(['verdaccio-publish', dir], { PUBLISH_VERDACCIO_REGISTRY: VERDACCIO });
  assert.equal(fromEnv.json.registry, VERDACCIO, '環境変数が file に勝つ');

  for (const bad of ['not a url', 'ftp://x.example.invalid/', 'http://user:pw@x.example.invalid/']) {
    const r = await run(['verdaccio-publish', dir], { PUBLISH_VERDACCIO_REGISTRY: bad });
    assert.equal(r.status, EXIT.ENV, bad);
    noLeak(r, 'user:pw');
  }
});

// ---- GitHub（偽の gh） ----

test('github-repo-create: gh repo create の argv と出力', async (t) => {
  const { record, run } = setup(t);
  const r = await run(['github-repo-create', '--visibility', 'public', '--description', '--説明 "q"', 'example/new-repo']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.json, { ok: true, repo: 'example/new-repo', visibility: 'public', url: 'https://github.com/example/new-repo' });
  const [rec] = H.readRecords(record);
  assert.deepEqual(rec.args, ['repo', 'create', 'example/new-repo', '--public', '--description=--説明 "q"']);

  const dflt = await run(['github-repo-create', 'example/other']);
  assert.equal(dflt.json.visibility, 'private');
  assert.ok(H.readRecords(record).some((x) => x.args.includes('--private')));
  for (const bad of [['--visibility', 'secret', 'a/b'], ['no-slash'], ['a/b/c'], ['-a/b']]) {
    assert.equal((await run(['github-repo-create', ...bad])).status, EXIT.USAGE, bad.join(' '));
  }
});

test('github-repo-create: 失敗は終了 code 1 で、gh の message の秘密を伏せる。gh が無ければ 4', async (t) => {
  const { env, work, run } = setup(t);
  const r = await run(['github-repo-create', 'example/x'], {
    GH_TOKEN: H.FAKE.ghToken,
    FAKE_EXIT: '1',
    FAKE_STDERR: `HTTP 401 bad credentials ${H.FAKE.ghToken}`,
  });
  assert.equal(r.status, 1);
  assert.match(r.json.error, /repo の作成が失敗/);
  noLeak(r, H.FAKE.ghToken);
  const none = await H.runPublish(['github-repo-create', 'example/x'], { env: { ...env, PATH: '/nonexistent' }, cwd: work });
  assert.equal(none.status, EXIT.ENV);
});

test('github-release-create: gh release create の argv（asset・notes・target・draft・prerelease）', async (t) => {
  const { work, record, run } = setup(t);
  fs.writeFileSync(path.join(work, 'notes.md'), 'body');
  fs.writeFileSync(path.join(work, 'a.zip'), 'a');
  fs.writeFileSync(path.join(work, 'b.zip'), 'b');
  const r = await run([
    'github-release-create', '--title', 'Title X', '--notes-file', 'notes.md', '--target', 'main', '--draft', '--prerelease',
    '--assets', 'a.zip,b.zip', 'example/repo', 'v1.0.0',
  ]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.json.url, 'https://github.com/example/repo/releases/tag/v1.0.0');
  assert.deepEqual(r.json.assets, [path.join(work, 'a.zip'), path.join(work, 'b.zip')]);
  const [rec] = H.readRecords(record);
  assert.deepEqual(rec.args, [
    'release', 'create', 'v1.0.0', path.join(work, 'a.zip'), path.join(work, 'b.zip'), '--repo=example/repo', '--title=Title X',
    `--notes-file=${path.join(work, 'notes.md')}`, '--target=main', '--draft', '--prerelease',
  ]);

  const min = await run(['github-release-create', 'example/repo', 'v2']);
  assert.equal(min.status, 0, min.stderr);
  const rec2 = H.readRecords(record).find((x) => x.args[2] === 'v2');
  assert.deepEqual(rec2.args, ['release', 'create', 'v2', '--repo=example/repo', '--title=v2', '--notes=']);

  for (const bad of [['example/repo', '--bad'], ['example/repo', 'v1', '--x'], ['--assets', 'missing.zip', 'example/repo', 'v1'], ['--notes-file', 'missing.md', 'example/repo', 'v1']]) {
    assert.equal((await run(['github-release-create', ...bad])).status, EXIT.USAGE, bad.join(' '));
  }
});

// ---- Gitea（127.0.0.1 の偽の API server と、偽の HOME の git credential） ----

async function giteaSetup(t, serverOpts = {}) {
  const ctx = setup(t);
  const server = await H.startFakeGitea({ token: H.FAKE.giteaToken, ...serverOpts });
  t.after(() => server.close());
  const credRecord = path.join(ctx.work, 'cred.log');
  const extra = {
    PUBLISH_GITEA_URL: server.url,
    PUBLISH_GITEA_USERNAME: H.FAKE.giteaUser,
    FAKE_CRED_VALUE: H.FAKE.giteaToken,
    FAKE_CRED_RECORD: credRecord,
  };
  return { ...ctx, server, credRecord, grun: (args, more = {}) => ctx.run(args, { ...extra, ...more }) };
}

test('gitea-repo-create: user の repo（owner が username）と organization の repo。token は git credential fill から', async (t) => {
  const { server, credRecord, grun } = await giteaSetup(t);
  const r = await grun(['gitea-repo-create', '--visibility', 'public', '--description', 'desc', `${H.FAKE.giteaUser}/mine`]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.json, { ok: true, repo: `${H.FAKE.giteaUser}/mine`, visibility: 'public', url: `${server.url}/${H.FAKE.giteaUser}/mine` });
  const req = server.requests[0];
  assert.equal(req.method, 'POST');
  assert.equal(req.url, '/api/v1/user/repos');
  assert.equal(req.headers.authorization, `token ${H.FAKE.giteaToken}`);
  assert.deepEqual(JSON.parse(req.body.toString()), { name: 'mine', private: false, description: 'desc' });
  noLeak(r, H.FAKE.giteaToken);

  const org = await grun(['gitea-repo-create', 'example-org/theirs']);
  assert.equal(org.status, 0, org.stderr);
  assert.equal(server.requests[1].url, '/api/v1/orgs/example-org/repos');
  assert.equal(JSON.parse(server.requests[1].body.toString()).private, true, '既定は private');

  // git credential fill には protocol・host（port 付き）・username が渡る。
  const input = JSON.parse(fs.readFileSync(credRecord, 'utf8').split('\n')[0]);
  assert.match(input, /protocol=http\n/);
  assert.ok(input.includes(`host=${server.host}\n`), input);
  assert.ok(input.includes(`username=${H.FAKE.giteaUser}\n`), input);
});

test('gitea-repo-create: 失敗（API の message に token が混ざっても伏せる）・設定と認証の不足は終了 code 4', async (t) => {
  const { server, grun, env, work } = await giteaSetup(t, {
    handler: (req) => (req.url.endsWith('/user/repos') ? { status: 409, body: { message: `repo exists (${H.FAKE.giteaToken})` } } : null),
  });
  const r = await grun(['gitea-repo-create', `${H.FAKE.giteaUser}/dup`]);
  assert.equal(r.status, 1);
  assert.match(r.json.error, /HTTP 409/);
  noLeak(r, H.FAKE.giteaToken);

  const noCfg = await H.runPublish(['gitea-repo-create', 'a/b'], { env, cwd: work });
  assert.equal(noCfg.status, EXIT.ENV);
  assert.match(noCfg.json.error, /giteaUrl/);
  const noUser = await H.runPublish(['gitea-repo-create', 'a/b'], { env: { ...env, PUBLISH_GITEA_URL: server.url }, cwd: work });
  assert.equal(noUser.status, EXIT.ENV);
  assert.match(noUser.json.error, /giteaUsername/);

  const noToken = await grun(['gitea-repo-create', 'a/b'], { FAKE_CRED_NONE: '1' });
  assert.equal(noToken.status, EXIT.ENV);
  assert.match(noToken.json.error, /token が取れない/);
  assert.equal(server.requests.length, 1, 'token が無ければ API を呼ばない');
});

test('gitea-repo-create: redirect は追わない（別の host に token を持ち出さない）', async (t) => {
  const other = await H.startFakeGitea({ token: H.FAKE.giteaToken });
  t.after(() => other.close());
  const { grun } = await giteaSetup(t, {
    handler: () => ({ status: 307, body: {}, headers: { Location: `${other.url}/api/v1/user/repos` } }),
  });
  const r = await grun(['gitea-repo-create', `${H.FAKE.giteaUser}/x`]);
  assert.equal(r.status, 1);
  assert.match(r.json.error, /HTTP 307/);
  assert.equal(other.requests.length, 0);
});

test('gitea-release-create: release を作り asset を添付する（multipart）', async (t) => {
  const { work, server, grun } = await giteaSetup(t);
  fs.writeFileSync(path.join(work, 'notes.md'), '# notes\nbody');
  fs.writeFileSync(path.join(work, 'a.bin'), 'AAA-asset-content');
  fs.writeFileSync(path.join(work, 'b.txt'), 'BBB-asset-content');
  const r = await grun([
    'gitea-release-create', '--title', 'Rel', '--notes-file', 'notes.md', '--target', 'main', '--draft', '--prerelease',
    '--assets', 'a.bin,b.txt', 'example-org/repo', 'v1.0.0',
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

  const min = await grun(['gitea-release-create', 'example-org/repo', 'v2']);
  assert.equal(min.status, 0, min.stderr);
  const body = JSON.parse(server.requests[3].body.toString());
  assert.deepEqual(body, { tag_name: 'v2', name: 'v2', body: '', draft: false, prerelease: false });
});

test('gitea-release-create: asset の添付が失敗したら、作成済みの release の url と添付できた物を返す', async (t) => {
  const { work, grun } = await giteaSetup(t, {
    handler: (req) => (req.url.includes('name=bad.bin') ? { status: 500, body: { message: `boom ${H.FAKE.giteaToken}` } } : null),
  });
  fs.writeFileSync(path.join(work, 'ok.bin'), '1');
  fs.writeFileSync(path.join(work, 'bad.bin'), '2');
  const r = await grun(['gitea-release-create', '--assets', 'ok.bin,bad.bin', 'example-org/repo', 'v1']);
  assert.equal(r.status, 1);
  assert.equal(r.json.ok, false);
  assert.ok(r.json.url.endsWith('/releases/tag/v1'));
  assert.deepEqual(r.json.uploaded, [path.join(work, 'ok.bin')]);
  assert.equal(r.json.failedAsset, path.join(work, 'bad.bin'));
  noLeak(r, H.FAKE.giteaToken);
});

test('設定の file（HOME）から Gitea の URL と username を読む', async (t) => {
  const { home, server, env, work } = await giteaSetup(t);
  fs.mkdirSync(path.join(home, '.config', 'superbash-bantou'), { recursive: true });
  fs.writeFileSync(
    path.join(home, '.config', 'superbash-bantou', 'config.json'),
    JSON.stringify({ giteaUrl: server.url + '/', giteaUsername: H.FAKE.giteaUser }),
  );
  const r = await H.runPublish(['gitea-repo-create', `${H.FAKE.giteaUser}/viafile`], {
    env: { ...env, FAKE_CRED_VALUE: H.FAKE.giteaToken },
    cwd: work,
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(server.requests[0].url, '/api/v1/user/repos');
});
