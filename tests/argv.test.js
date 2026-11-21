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
const { MANIFEST, makeTmp, rmTmp, cleanEnv, runCli } = require('./helpers/env');

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
  assert.deepEqual(buildArgv(spec('macbuild-sign'), { path: 'X.app', entitlements: 'e.plist' }), [
    'sign',
    '--entitlements',
    'e.plist',
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

test('`--` の後と最初の positional の後は positional', () => {
  assert.deepEqual(parse(['sign', '--', '--entitlements']).values, { path: '--entitlements' });
  assert.deepEqual(parse(['tauri', '--', '-app']).values, { project: '-app', debug: false });
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

test('codesign の argv（ad-hoc と identity）', () => {
  assert.deepEqual(codesign.signArgs('/x/A.app', {}), ['--force', '--sign', '-', '/x/A.app']);
  assert.deepEqual(codesign.signArgs('/x/A.app', { identity: 'Example Identity', entitlements: '/x/e.plist' }), [
    '--force',
    '--sign',
    'Example Identity',
    '--options',
    'runtime',
    '--timestamp',
    '--entitlements',
    '/x/e.plist',
    '/x/A.app',
  ]);
});

test('Tauri の子の環境: 署名の変数は host の設定だけから入れる', () => {
  const base = {
    PATH: '/usr/bin',
    APPLE_SIGNING_IDENTITY: 'from-parent',
    APPLE_CERTIFICATE: 'cert-from-parent',
    APPLE_CERTIFICATE_PASSWORD: 'pw-from-parent',
    TAURI_SIGNING_PRIVATE_KEY: 'key-from-parent',
    APPLE_ID: 'someone@example.com',
    EXAMPLE_PW: 'example-password',
  };
  const adhoc = tauri.tauriEnv({ signingMode: 'adhoc', identity: null }, { baseEnv: base });
  assert.equal(adhoc.APPLE_SIGNING_IDENTITY, '-');
  for (const k of ['APPLE_CERTIFICATE', 'APPLE_CERTIFICATE_PASSWORD', 'TAURI_SIGNING_PRIVATE_KEY', 'APPLE_ID']) {
    assert.equal(adhoc[k], undefined, k);
  }
  assert.equal(adhoc.CARGO_TARGET_DIR, undefined);

  const withId = tauri.tauriEnv(
    {
      signingMode: 'identity',
      identity: 'Example Identity',
      updaterKeyPath: '/keys/example.key',
      updaterKeyPasswordEnv: 'EXAMPLE_PW',
    },
    { baseEnv: base, targetDir: '/t/target' },
  );
  assert.equal(withId.APPLE_SIGNING_IDENTITY, 'Example Identity');
  assert.equal(withId.APPLE_ID, 'someone@example.com', 'identity の時は公証の資格を残す');
  assert.equal(withId.APPLE_CERTIFICATE, undefined);
  assert.equal(withId.TAURI_SIGNING_PRIVATE_KEY, '/keys/example.key', '鍵は path のまま渡す');
  assert.equal(withId.TAURI_SIGNING_PRIVATE_KEY_PASSWORD, 'example-password');
  assert.equal(withId.EXAMPLE_PW, undefined, 'password の元の変数は子に渡さない');
  assert.equal(withId.CARGO_TARGET_DIR, '/t/target');
  assert.equal(base.EXAMPLE_PW, 'example-password', '親の環境は変えない');

  assert.throws(
    () =>
      tauri.tauriEnv(
        { signingMode: 'adhoc', updaterKeyPath: '/keys/example.key', updaterKeyPasswordEnv: 'MISSING_PW' },
        { baseEnv: base },
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
    ['Identifier=com.example.a', 'CodeDirectory v=20500 size=1 flags=0x10000(runtime) hashes=1+3', 'Authority=Example Authority'].join('\n'),
  );
  assert.equal(cert.kind, 'certificate');
  assert.equal(JSON.stringify(cert).includes('Example Authority'), false);
  assert.equal(codesign.parseDescribe('/x: code object is not signed at all').kind, 'unsigned');
});
