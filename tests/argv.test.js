'use strict';
// argv の組み立て: superbash の spec.in の規則 → CLI の読み取り、CLI → Tauri の CLI・codesign の argv と環境。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const codesign = require('../tools/macbuild/lib/codesign');
const { parse } = require('../tools/macbuild/lib/commands');
const { UsageError, EnvError, EXIT } = require('../tools/macbuild/lib/errors');
const tauri = require('../tools/macbuild/lib/tauri');
const { buildArgv } = require('./helpers/spec-in');
const { MANIFEST, FAKE, makeTmp, rmTmp, cleanEnv, runCli } = require('./helpers/env');

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const spec = (name) => manifest.commands.find((c) => c.name === name).spec;

test('spec.in の規則で組んだ argv', () => {
  assert.deepEqual(buildArgv(spec('macbuild-info'), {}), ['info']);
  assert.deepEqual(buildArgv(spec('macbuild-tauri'), { project: 'app' }), ['tauri', 'app']);
  assert.deepEqual(
    buildArgv(spec('macbuild-tauri'), {
      project: 'app',
      targetDir: 'out',
      debug: true,
      bundles: 'app,dmg',
      target: 'aarch64-apple-darwin',
    }),
    ['tauri', '--target', 'aarch64-apple-darwin', '--bundles', 'app,dmg', '--debug', '--target-dir', 'out', 'app'],
  );
  assert.deepEqual(buildArgv(spec('macbuild-tauri'), { project: 'app', debug: false }), ['tauri', 'app']);
  assert.deepEqual(buildArgv(spec('macbuild-sign'), { path: 'X.app' }), ['sign', 'X.app']);
  assert.deepEqual(buildArgv(spec('macbuild-sign'), { path: 'X.app', noTimestamp: true, entitlements: 'e.plist' }), [
    'sign',
    '--entitlements',
    'e.plist',
    '--no-timestamp',
    'X.app',
  ]);
});

test('組んだ argv を CLI が同じ値に読み戻す', () => {
  const cases = [
    ['macbuild-info', {}],
    ['macbuild-tauri', { project: 'app' }],
    ['macbuild-tauri', { project: 'app', target: 'x86_64-apple-darwin', bundles: 'dmg', debug: true, targetDir: '/t/x' }],
    ['macbuild-tauri', { project: 'a b;$(id)`id`*', target: '--debug' }],
    ['macbuild-sign', { path: "it's \"quoted\" & spaced.app", entitlements: 'e.plist' }],
    ['macbuild-sign', { path: 'X.app', noTimestamp: true }],
  ];
  for (const [name, args] of cases) {
    const s = spec(name);
    const got = parse(buildArgv(s, args));
    assert.equal(got.subcommand, s.subcommand);
    const expected = { ...args };
    for (const [key, o] of Object.entries(s.in.options)) {
      if (o.type === 'boolean' && expected[key] === undefined) expected[key] = false;
    }
    assert.deepEqual(got.values, expected, name);
  }
});

test('使い方の誤りは UsageError（終了 code 2）', () => {
  const bad = [
    ['tauri'],
    ['tauri', '--nope', 'app'],
    ['tauri', '--target'],
    ['tauri', '--debug', '--debug', 'app'],
    ['tauri', 'a', 'b'],
    ['sign'],
    ['info', 'extra'],
    ['nope'],
    ['help', 'a', 'b'],
  ];
  for (const argv of bad) {
    assert.throws(() => parse(argv), (e) => e instanceof UsageError && e.exitCode === EXIT.USAGE, argv.join(' '));
  }
  const home = makeTmp();
  try {
    const r = runCli(['tauri', '--nope', 'x'], { env: cleanEnv(home) });
    assert.equal(r.status, EXIT.USAGE);
    assert.match(r.stderr, /未知の option: --nope/);
  } finally {
    rmTmp(home);
  }
});

test('`--` の後と最初の positional の後は positional（`-` で始まる positional は既知の制限）', () => {
  assert.deepEqual(parse(['sign', '--', '--entitlements']).values, { path: '--entitlements', noTimestamp: false });
  assert.deepEqual(parse(['tauri', '--', '-app']).values, { project: '-app', debug: false });
  // superbash は `--` を入れないので、`-` で始まる positional は option と読まれて誤りになる（README の既知の制限）。
  assert.throws(() => parse(buildArgv(spec('macbuild-tauri'), { project: '-app' })), UsageError);
});

test('Tauri の CLI に渡す argv', () => {
  assert.deepEqual(tauri.tauriArgs({}), ['build', '--ci']);
  assert.deepEqual(tauri.tauriArgs({ target: 'universal-apple-darwin', bundles: 'app,dmg', debug: true }), [
    'build',
    '--ci',
    '--target',
    'universal-apple-darwin',
    '--bundles',
    'app,dmg',
    '--debug',
  ]);
});

test('codesign の argv: flag は元の署名から引き継ぎ、identity には timestamp（外せる）', () => {
  const preserve = '--preserve-metadata=entitlements,flags,runtime';
  assert.deepEqual(codesign.signArgs('/x/A.app', {}), ['--force', '--sign', '-', preserve, '/x/A.app']);
  assert.deepEqual(codesign.signArgs('/x/A.app', { noTimestamp: true }), ['--force', '--sign', '-', preserve, '/x/A.app']);
  assert.deepEqual(codesign.signArgs('/x/A.app', { identity: FAKE.identity, entitlements: '/x/e.plist' }), [
    '--force',
    '--sign',
    FAKE.identity,
    preserve,
    '--timestamp',
    '--entitlements',
    '/x/e.plist',
    '/x/A.app',
  ]);
  const offline = codesign.signArgs('/x/A.app', { identity: FAKE.identity, noTimestamp: true });
  assert.deepEqual(offline, ['--force', '--sign', FAKE.identity, preserve, '--timestamp=none', '/x/A.app']);
  for (const args of [codesign.signArgs('/x/A.app', { identity: FAKE.identity }), offline]) {
    assert.equal(args.includes('--options'), false, 'hardened runtime を無条件に付けない');
  }
});

// 親の環境: 生の署名・公証・updater の変数（偽の値）と、設定が名前で指す変数。
const PARENT = Object.freeze({
  PATH: '/usr/bin',
  APPLE_SIGNING_IDENTITY: 'from-parent',
  APPLE_CERTIFICATE: 'cert-from-parent',
  APPLE_CERTIFICATE_PASSWORD: 'pw-from-parent',
  APPLE_ID: FAKE.parentAppleId,
  APPLE_PASSWORD: FAKE.parentApplePassword,
  APPLE_TEAM_ID: 'PARENTTEAM',
  APPLE_API_KEY: 'parent-api-key',
  APPLE_API_ISSUER: 'parent-issuer',
  APPLE_API_KEY_PATH: '/parent/AuthKey.p8',
  APPLE_PROVIDER_SHORT_NAME: 'parent-provider',
  TAURI_SIGNING_PRIVATE_KEY: 'key-from-parent',
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: 'key-pw-from-parent',
  TAURI_PRIVATE_KEY: 'v1-key-from-parent',
  EXAMPLE_UPDATER_PW: FAKE.updaterPassword,
  EXAMPLE_APPLE_ID: FAKE.appleId,
  EXAMPLE_APPLE_PW: FAKE.applePassword,
  EXAMPLE_TEAM: FAKE.appleTeamId,
  EXAMPLE_PROVIDER: FAKE.providerShortName,
  KEEP_ME: 'ordinary',
});

const appleKeys = (env) => Object.keys(env).filter((k) => k.startsWith('APPLE_')).sort();

test('M3: 生の APPLE_* は常に子へ渡さない（ad-hoc）', () => {
  const env = tauri.tauriEnv({ signingMode: 'adhoc', identity: null }, { baseEnv: PARENT });
  assert.deepEqual(appleKeys(env), ['APPLE_SIGNING_IDENTITY']);
  assert.equal(env.APPLE_SIGNING_IDENTITY, '-');
  for (const k of ['TAURI_SIGNING_PRIVATE_KEY', 'TAURI_SIGNING_PRIVATE_KEY_PASSWORD', 'TAURI_PRIVATE_KEY']) {
    assert.equal(env[k], undefined, k);
  }
  assert.equal(env.KEEP_ME, 'ordinary');
  assert.equal(env.CARGO_TARGET_DIR, undefined);
});

test('M3: identity の時も生の APPLE_* は渡さず、公証の資格は設定の名前の変数から Tauri の名前で渡す', () => {
  const config = {
    signingMode: 'identity',
    identity: FAKE.identity,
    appleIdEnv: 'EXAMPLE_APPLE_ID',
    applePasswordEnv: 'EXAMPLE_APPLE_PW',
    appleTeamIdEnv: 'EXAMPLE_TEAM',
    appleProviderShortNameEnv: 'EXAMPLE_PROVIDER',
  };
  const env = tauri.tauriEnv(config, { baseEnv: PARENT, targetDir: '/t/target' });
  assert.deepEqual(appleKeys(env), [
    'APPLE_ID',
    'APPLE_PASSWORD',
    'APPLE_PROVIDER_SHORT_NAME',
    'APPLE_SIGNING_IDENTITY',
    'APPLE_TEAM_ID',
  ]);
  assert.equal(env.APPLE_PROVIDER_SHORT_NAME, FAKE.providerShortName, 'N2: 親の APPLE_PROVIDER_SHORT_NAME でなく、設定の名前の変数の値');
  assert.equal(env.APPLE_SIGNING_IDENTITY, FAKE.identity);
  assert.equal(env.APPLE_ID, FAKE.appleId, '親の APPLE_ID でなく、設定の名前の変数の値');
  assert.equal(env.APPLE_PASSWORD, FAKE.applePassword);
  assert.equal(env.APPLE_TEAM_ID, FAKE.appleTeamId);
  for (const k of ['EXAMPLE_APPLE_ID', 'EXAMPLE_APPLE_PW', 'EXAMPLE_TEAM', 'EXAMPLE_PROVIDER']) {
    assert.equal(env[k], undefined, `元の ${k} は渡さない`);
  }
  assert.equal(env.CARGO_TARGET_DIR, '/t/target');
  assert.equal(PARENT.APPLE_ID, FAKE.parentAppleId, '親の環境は変えない');

  assert.throws(
    () => tauri.tauriEnv({ ...config, appleApiKeyEnv: 'MISSING_API_KEY' }, { baseEnv: PARENT }),
    (e) => e instanceof EnvError && /MISSING_API_KEY/.test(e.message) && !e.message.includes(FAKE.identity),
  );
  // ad-hoc では公証しない（資格を渡さず、名前の変数が無くても誤りにしない）。
  const adhoc = tauri.tauriEnv({ ...config, signingMode: 'adhoc', appleApiKeyEnv: 'MISSING_API_KEY' }, { baseEnv: PARENT });
  assert.deepEqual(appleKeys(adhoc), ['APPLE_SIGNING_IDENTITY']);
  assert.equal(adhoc.EXAMPLE_APPLE_ID, undefined);
});

test('updater の鍵は path を渡し、password は設定の名前の変数から（L1: 鍵が無くても元の変数は渡さない）', () => {
  const withKey = tauri.tauriEnv(
    { signingMode: 'adhoc', updaterKeyPath: '/keys/example.key', updaterKeyPasswordEnv: 'EXAMPLE_UPDATER_PW' },
    { baseEnv: PARENT },
  );
  assert.equal(withKey.TAURI_SIGNING_PRIVATE_KEY, '/keys/example.key', '鍵は path のまま渡す');
  assert.equal(withKey.TAURI_SIGNING_PRIVATE_KEY_PASSWORD, FAKE.updaterPassword);
  assert.equal(withKey.EXAMPLE_UPDATER_PW, undefined, 'password の元の変数は子に渡さない');

  const noKey = tauri.tauriEnv({ signingMode: 'adhoc', updaterKeyPasswordEnv: 'EXAMPLE_UPDATER_PW' }, { baseEnv: PARENT });
  assert.equal(noKey.EXAMPLE_UPDATER_PW, undefined, 'L1: 鍵の path が無くても元の変数は渡さない');
  assert.equal(noKey.TAURI_SIGNING_PRIVATE_KEY, undefined);
  assert.equal(noKey.TAURI_SIGNING_PRIVATE_KEY_PASSWORD, undefined);

  assert.throws(
    () =>
      tauri.tauriEnv(
        { signingMode: 'adhoc', updaterKeyPath: '/keys/example.key', updaterKeyPasswordEnv: 'MISSING_PW' },
        { baseEnv: PARENT },
      ),
    (e) => e instanceof EnvError && /MISSING_PW/.test(e.message),
  );
});

test('Tauri の出力から成果物の path を拾う（色の escape を除く）', () => {
  const log = [
    '    Compiling tauri-min v0.1.0',
    '\u001b[32m    Finished\u001b[0m `release` profile [optimized] target(s) in 1m 02s',
    '    Bundling tauri-min.app (/t/release/bundle/macos/tauri-min.app)',
    '\u001b[32m    Finished\u001b[0m 2 bundles at:',
    '        /t/release/bundle/macos/tauri-min.app',
    '        /t/release/bundle/dmg/tauri-min_0.1.0_aarch64.dmg',
    '',
    '    Finished 1 updater signature at:',
    '        /t/release/bundle/macos/tauri-min.app.tar.gz.sig',
  ].join('\n');
  assert.deepEqual(tauri.parseFinishedPaths(log), [
    '/t/release/bundle/macos/tauri-min.app',
    '/t/release/bundle/dmg/tauri-min_0.1.0_aarch64.dmg',
    '/t/release/bundle/macos/tauri-min.app.tar.gz.sig',
  ]);
  assert.equal(tauri.artifactKind('/a/x.app'), 'app');
  assert.equal(tauri.artifactKind('/a/x.dmg'), 'dmg');
  assert.equal(tauri.artifactKind('/a/x.app.tar.gz'), 'updater');
  assert.equal(tauri.artifactKind('/a/x.app.tar.gz.sig'), 'updater-signature');
});

test('成果物の path は流しながら拾う（区切りの途中・stream の混ざり・長すぎる行）', () => {
  const c = tauri.finishedCollector();
  c.feed('    Compiling x\n\u001b[32m    Fini', 'stderr');
  c.feed('noise on stdout\n', 'stdout');
  c.feed('shed\u001b[0m 2 bundles at:\n        /t/b/A.app\n', 'stderr');
  c.feed('/not/a/bundle/path on stdout\n', 'stdout'); // stdout の行は stderr の block に入らない
  c.feed('        /t/b/A', 'stderr');
  c.feed('.dmg\n    Done\n        /t/after/block\n', 'stderr');
  c.feed('    Finished 1 bundle at:\n' + 'x'.repeat(70 * 1024), 'stdout'); // 改行の無い長すぎる行
  c.feed('/still/the/long/line\n        /t/next/line\n', 'stdout');
  c.feed('    Finished 1 updater signature at:\n        /t/b/A.app.tar.gz.sig', 'stdout'); // 最後に改行が無い
  assert.deepEqual(c.paths(), ['/t/b/A.app', '/t/b/A.dmg', '/t/b/A.app.tar.gz.sig']);
});

test('codesign -dv の出力から署名の種類を読む（Authority は出さない）', () => {
  const adhoc = codesign.parseDescribe(
    [
      'Executable=/x/A.app/Contents/MacOS/a',
      'Identifier=com.example.a',
      'Format=app bundle with Mach-O thin (arm64)',
      'CodeDirectory v=20500 size=1 flags=0x10002(adhoc,runtime) hashes=1+3 location=embedded',
      'Signature=adhoc',
    ].join('\n'),
  );
  assert.deepEqual(adhoc, { kind: 'adhoc', identifier: 'com.example.a', format: 'app bundle with Mach-O thin (arm64)', runtime: true });
  const cert = codesign.parseDescribe(
    ['Identifier=com.example.a', 'CodeDirectory v=20500 size=1 flags=0x10000(runtime) hashes=1+3', `Authority=${FAKE.identity}`].join('\n'),
  );
  assert.equal(cert.kind, 'certificate');
  assert.equal(JSON.stringify(cert).includes(FAKE.identity), false);
  assert.equal(codesign.parseDescribe('/x: code object is not signed at all').kind, 'unsigned');
});
