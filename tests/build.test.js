'use strict';
// macbuild tauri と macbuild sign の流れ（偽の Tauri の CLI と ad-hoc の codesign で。Rust は使わない）。
// 偽の identity では本物の codesign を呼ばない（keychain を引かせない）。identity の時の codesign は偽の物か stub。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const codesign = require('../tools/macbuild/lib/codesign');
const { EXIT } = require('../tools/macbuild/lib/errors');
const { signArtifact } = require('../tools/macbuild/lib/sign');
const {
  FAKE,
  makeTmp,
  rmTmp,
  cleanEnv,
  runCli,
  makeFakeProject,
  readRecord,
  makeFakeBin,
  readFakeRecords,
} = require('./helpers/env');

function withHome(fn) {
  const home = makeTmp();
  try {
    return fn(home);
  } finally {
    rmTmp(home);
  }
}

function setup(home, extra = {}) {
  const project = makeFakeProject(path.join(home, 'proj'));
  const env = cleanEnv(home, {
    MACBUILD_LOCK_DIR: path.join(home, 'lock'),
    MACBUILD_LOG_DIR: path.join(home, 'logs'),
    ...extra,
  });
  return { project, env };
}

function assertNoSecrets(text, secrets, where) {
  for (const s of secrets) assert.equal(text.includes(s), false, `${where} に ${s}:\n${text}`);
}

test('tauri: ad-hoc で build し、成果物・log・署名の確かめを出す（src-tauri/ を要らない）', () =>
  withHome((home) => {
    const { project, env } = setup(home, {
      APPLE_CERTIFICATE: 'parent-cert',
      APPLE_ID: FAKE.parentAppleId,
      CARGO_TARGET_DIR: '/should/be/overridden',
    });
    assert.equal(fs.existsSync(path.join(project, 'src-tauri')), false);
    const targetDir = path.join(home, 'target');
    const r = runCli(['tauri', '--bundles', 'app', '--target-dir', targetDir, project], { env, cwd: home });
    assert.equal(r.status, EXIT.OK, r.stderr + r.stdout);

    const rec = readRecord(project);
    assert.deepEqual(rec.args, ['build', '--ci', '--bundles', 'app']);
    assert.equal(rec.cwd, project);
    assert.deepEqual(rec.APPLE, { APPLE_SIGNING_IDENTITY: '-' }, '親の APPLE_* は渡さない');
    assert.equal(rec.CARGO_TARGET_DIR, targetDir);
    assert.deepEqual(rec.TAURI, {});

    const out = r.json;
    assert.equal(out.ok, true);
    assert.equal(out.signing, 'adhoc');
    assert.equal(out.project, project);
    assert.equal(out.targetDir, targetDir);
    const app = path.join(targetDir, 'release', 'bundle', 'macos', 'Fake.app');
    assert.deepEqual(out.artifacts, [
      {
        kind: 'app',
        path: app,
        signature: { kind: 'adhoc', identifier: 'com.example.fake', format: 'app bundle with generic', runtime: true },
        verified: true,
      },
    ]);
    assert.ok(out.log.startsWith(path.join(home, 'logs') + path.sep));
    const log = fs.readFileSync(out.log, 'utf8');
    assert.match(log, /# signing: adhoc/);
    assert.match(log, /Running fake tauri build/);
    assert.match(log, /Signing with identity "-"/);
    assert.match(log, /using keychain <keychain>/, 'keychain の path は伏せる');
    assert.match(r.stderr, /lock を取った/);
  }));

test('M1: identity の文字列（と team id・keychain の path）は log にも、stderr に写す log の末尾にも出ない', () =>
  withHome((home) => {
    const { project, env } = setup(home, { MACBUILD_IDENTITY: FAKE.identity });
    fs.writeFileSync(path.join(project, 'fail'), '');
    const r = runCli(['tauri', project], { env });
    assert.equal(r.status, EXIT.FAIL, r.stderr);
    assert.equal(readRecord(project).APPLE.APPLE_SIGNING_IDENTITY, FAKE.identity, 'Tauri には identity を渡す');

    const log = fs.readFileSync(r.json.log, 'utf8');
    const secrets = [FAKE.identity, FAKE.teamId, 'fake-build.keychain-db', 'Keychains'];
    assertNoSecrets(log, secrets, 'log');
    assertNoSecrets(r.stderr, secrets, 'stderr');
    assertNoSecrets(r.stdout, secrets, 'stdout');
    assert.match(log, /Signing with identity "<identity>"/);
    assert.match(r.stderr, /--- log の末尾/);
    assert.match(r.stderr, /failed to sign with identity "<identity>" \(team <team-id>\)/);
    assert.match(r.stderr, /using keychain <keychain>/);
  }));

test('M1: 失敗でない時も（成果物の確かめの段まで）log に identity を出さない', () =>
  withHome((home) => {
    const { project, env } = setup(home, { MACBUILD_IDENTITY: FAKE.identity });
    const r = runCli(['tauri', project], { env });
    // 偽の Tauri は偽の identity では署名しないので、確かめで失敗する。
    assert.equal(r.status, EXIT.FAIL, r.stderr);
    assert.equal(r.json.signing, 'identity');
    assert.equal(r.json.artifacts[0].signature.kind, 'unsigned');
    const all = r.stdout + r.stderr + fs.readFileSync(r.json.log, 'utf8');
    assertNoSecrets(all, [FAKE.identity, FAKE.teamId], '出力と log');
  }));

test('M3: identity の時、公証の資格は設定の名前の変数の値だけを Tauri の名前で渡す（親の APPLE_* は渡さない）', () =>
  withHome((home) => {
    const { project, env } = setup(home, {
      MACBUILD_IDENTITY: FAKE.identity,
      MACBUILD_APPLE_ID_ENV: 'EXAMPLE_APPLE_ID',
      MACBUILD_APPLE_PASSWORD_ENV: 'EXAMPLE_APPLE_PW',
      MACBUILD_APPLE_TEAM_ID_ENV: 'EXAMPLE_TEAM',
      MACBUILD_APPLE_PROVIDER_SHORT_NAME_ENV: 'EXAMPLE_PROVIDER',
      EXAMPLE_APPLE_ID: FAKE.appleId,
      EXAMPLE_APPLE_PW: FAKE.applePassword,
      EXAMPLE_TEAM: FAKE.appleTeamId,
      EXAMPLE_PROVIDER: FAKE.providerShortName,
      APPLE_PROVIDER_SHORT_NAME: 'parent-provider',
      APPLE_ID: FAKE.parentAppleId,
      APPLE_PASSWORD: FAKE.parentApplePassword,
      APPLE_API_KEY: 'parent-api-key',
      APPLE_API_ISSUER: 'parent-issuer',
      APPLE_API_KEY_PATH: '/parent/AuthKey.p8',
    });
    fs.writeFileSync(path.join(project, 'fail'), ''); // 環境を見るだけ
    const r = runCli(['tauri', project], { env });
    assert.equal(r.status, EXIT.FAIL, r.stderr);
    const rec = readRecord(project);
    assert.deepEqual(rec.APPLE, {
      APPLE_SIGNING_IDENTITY: FAKE.identity,
      APPLE_ID: FAKE.appleId,
      APPLE_PASSWORD: FAKE.applePassword,
      APPLE_TEAM_ID: FAKE.appleTeamId,
      APPLE_PROVIDER_SHORT_NAME: FAKE.providerShortName,
    });
    for (const k of ['EXAMPLE_APPLE_ID', 'EXAMPLE_APPLE_PW', 'EXAMPLE_TEAM', 'EXAMPLE_PROVIDER']) {
      assert.equal(rec.keys.includes(k), false, `元の ${k} は渡さない`);
    }
    const all = r.stdout + r.stderr + fs.readFileSync(r.json.log, 'utf8');
    assertNoSecrets(all, [FAKE.appleId, FAKE.applePassword, FAKE.appleTeamId, FAKE.parentAppleId], '出力と log');
  }));

test('N3: 成果物の path は伏せる前の出力から拾う（秘密の値が path の一部と一致しても壊さない。log は伏せる）', () =>
  withHome((home) => {
    // 公証の資格の変数（ad-hoc なので Tauri には渡らない）の値が、成果物の dir の名前と同じ。
    const secretDir = 'fakesecretdir';
    const bundleDir = path.join(home, secretDir, 'out');
    const { project, env } = setup(home, {
      MACBUILD_APPLE_PASSWORD_ENV: 'EXAMPLE_APPLE_PW',
      EXAMPLE_APPLE_PW: secretDir,
      FAKE_BUNDLE_DIR: bundleDir, // 既定の target の dir の外（log から拾えないと見つからない所）
    });
    const r = runCli(['tauri', project], { env });
    assert.equal(r.status, EXIT.OK, r.stderr + r.stdout);
    const app = path.join(bundleDir, 'Fake.app');
    assert.equal(r.json.artifacts.length, 1);
    assert.equal(r.json.artifacts[0].path, app);
    assert.equal(r.json.artifacts[0].verified, true);
    const log = fs.readFileSync(r.json.log, 'utf8');
    assert.equal(log.includes(secretDir), false, 'log では伏せる');
    assert.ok(log.includes(path.join(home, '<secret>', 'out', 'Fake.app')), log);
  }));

test('tauri: updater の鍵は path を渡し、password は設定の環境変数名から引く（中身は出さない）', () =>
  withHome((home) => {
    const keyPath = path.join(home, 'keys', 'example-updater.key');
    fs.mkdirSync(path.dirname(keyPath), { recursive: true });
    fs.writeFileSync(keyPath, 'example key body');
    const { project, env } = setup(home, {
      MACBUILD_UPDATER_KEY_PATH: keyPath,
      MACBUILD_UPDATER_KEY_PASSWORD_ENV: 'EXAMPLE_UPDATER_PW',
      EXAMPLE_UPDATER_PW: FAKE.updaterPassword,
    });
    const r = runCli(['tauri', project], { env });
    assert.equal(r.status, EXIT.OK, r.stderr);
    const rec = readRecord(project);
    assert.deepEqual(rec.TAURI, { TAURI_SIGNING_PRIVATE_KEY: keyPath, TAURI_SIGNING_PRIVATE_KEY_PASSWORD: FAKE.updaterPassword });
    assert.equal(rec.keys.includes('EXAMPLE_UPDATER_PW'), false);
    assert.equal(r.json.updaterKey, true);
    const all = r.stdout + r.stderr + fs.readFileSync(r.json.log, 'utf8');
    assertNoSecrets(all, ['example key body', FAKE.updaterPassword, keyPath], '出力と log');
  }));

test('tauri: 設定の不足は build の前に終了 code 4（鍵の file・password の環境変数）', () =>
  withHome((home) => {
    const { project, env } = setup(home, { MACBUILD_UPDATER_KEY_PATH: path.join(home, 'missing.key') });
    const r1 = runCli(['tauri', project], { env });
    assert.equal(r1.status, EXIT.ENV, r1.stderr);
    assert.equal(readRecord(project), null);

    const keyPath = path.join(home, 'k.key');
    fs.writeFileSync(keyPath, 'x');
    const r2 = runCli(['tauri', project], {
      env: { ...env, MACBUILD_UPDATER_KEY_PATH: keyPath, MACBUILD_UPDATER_KEY_PASSWORD_ENV: 'NOT_SET_PW' },
    });
    assert.equal(r2.status, EXIT.ENV, r2.stderr);
    assert.match(r2.stderr, /NOT_SET_PW/);
    assert.equal(readRecord(project), null);
  }));

test('tauri: 無い dir は終了 code 2、CLI や cargo が無いと 4', () =>
  withHome((home) => {
    const env = cleanEnv(home, { MACBUILD_LOCK_DIR: path.join(home, 'lock'), MACBUILD_LOG_DIR: path.join(home, 'logs') });
    assert.equal(runCli(['tauri', path.join(home, 'nope')], { env }).status, EXIT.USAGE);
    const bare = path.join(home, 'bare');
    fs.mkdirSync(bare);
    // PATH を node と /usr/bin（codesign）だけにする: cargo・cargo-tauri が無い host と同じ。
    const r = runCli(['tauri', bare], { env: { ...env, PATH: [path.dirname(process.execPath), '/usr/bin'].join(':') } });
    assert.equal(r.status, EXIT.ENV, r.stderr);
    assert.match(r.stderr, /Tauri の CLI が無い|cargo が無い/);
    assert.equal(r.json.ok, false);
  }));

test('tauri: build の失敗は終了 code 1 と log の末尾', () =>
  withHome((home) => {
    const { project, env } = setup(home);
    fs.writeFileSync(path.join(project, 'fail'), '');
    const r = runCli(['tauri', project], { env });
    assert.equal(r.status, EXIT.FAIL);
    assert.equal(r.json.ok, false);
    assert.match(r.json.error, /終了 code 1/);
    assert.match(r.stderr, /failed to sign with identity "-"/);
    assert.ok(fs.existsSync(r.json.log));
  }));

test('sign: ad-hoc で署名し直し、確かめる（元の hardened runtime を引き継ぐ）', () =>
  withHome((home) => {
    const { project, env } = setup(home);
    const built = runCli(['tauri', project], { env });
    assert.equal(built.status, EXIT.OK, built.stderr);
    const app = built.json.artifacts[0].path;

    const r = runCli(['sign', path.relative(home, app)], { env, cwd: home });
    assert.equal(r.status, EXIT.OK, r.stderr);
    assert.equal(r.json.ok, true);
    assert.equal(r.json.path, app);
    assert.equal(r.json.signing, 'adhoc');
    assert.equal(r.json.verified, true);
    assert.equal(r.json.signature.kind, 'adhoc');
    assert.equal(r.json.signature.runtime, true, '元の hardened runtime を引き継ぐ');

    // 中身を足すと確かめが通らない → 署名し直すと通る
    fs.mkdirSync(path.join(app, 'Contents', 'Resources'), { recursive: true });
    fs.writeFileSync(path.join(app, 'Contents', 'Resources', 'extra.txt'), 'changed');
    assert.equal(codesign.verify(app).ok, false);
    const again = runCli(['sign', '--no-timestamp', app], { env });
    assert.equal(again.status, EXIT.OK, again.stderr);
    assert.equal(codesign.verify(app).ok, true);

    // 署名できない物（bundle の root に余計な file）は終了 code 1 と codesign の理由
    fs.writeFileSync(path.join(app, 'Contents', 'stray.txt'), 'x');
    const bad = runCli(['sign', app], { env });
    assert.equal(bad.status, EXIT.FAIL);
    assert.equal(bad.json.ok, false);
    assert.doesNotMatch(bad.json.error, /replacing existing signature/);

    assert.equal(runCli(['sign', path.join(home, 'missing.app')], { env }).status, EXIT.USAGE);
  }));

test('M2: sign の codesign の失敗の message から identity・team id・keychain の path を伏せる', () =>
  withHome((home) => {
    const target = path.join(home, 'A.app');
    fs.mkdirSync(target);
    const env = cleanEnv(home, { MACBUILD_IDENTITY: FAKE.identity });
    const keychain = path.join(home, 'Library', 'Keychains', 'login.keychain-db');
    const leaky = `${FAKE.identity}: no identity found (team ${FAKE.teamId}) in ${keychain}`;
    const calls = [];
    const stub = (over) => ({
      sign: (t, opts) => {
        calls.push(opts);
        return { ok: true, message: null, ...over.sign };
      },
      verify: () => ({ ok: true, message: null, ...over.verify }),
      describe: () => ({ kind: 'certificate', identifier: 'x', format: 'y', runtime: false }),
    });
    const stderrChunks = [];
    const stderr = { write: (s) => stderrChunks.push(s) };

    const failedSign = signArtifact({ path: target }, { env, stderr, tool: stub({ sign: { ok: false, message: leaky } }) });
    assert.equal(failedSign.exitCode, EXIT.FAIL);
    assertNoSecrets(JSON.stringify(failedSign.result), [FAKE.identity, FAKE.teamId, 'login.keychain-db', 'Keychains'], 'sign の error');
    assert.match(failedSign.result.error, /<identity>: no identity found \(team <team-id>\) in <keychain>/);
    assert.equal(calls[0].identity, FAKE.identity, 'codesign には identity を渡す');
    assert.equal(calls[0].noTimestamp, false);

    const failedVerify = signArtifact({ path: target, noTimestamp: true }, { env, stderr, tool: stub({ verify: { ok: false, message: leaky } }) });
    assert.equal(failedVerify.exitCode, EXIT.FAIL);
    assertNoSecrets(JSON.stringify(failedVerify.result), [FAKE.identity, FAKE.teamId, 'Keychains'], 'verify の error');
    assert.equal(calls[1].noTimestamp, true);
    assert.equal(stderrChunks.join(''), '', '設定の警告が無ければ stderr に何も出さない');
  }));

test('N1: identity を team id 抜きで設定した時の ambiguous の message でも、候補の team id を伏せる', () =>
  withHome((home) => {
    const target = path.join(home, 'A.app');
    fs.mkdirSync(target);
    const prefix = 'Developer ID Application: Fake Example Corp';
    const env = cleanEnv(home, { MACBUILD_IDENTITY: prefix });
    const ambiguous = `${prefix}: ambiguous (matches "${prefix} (FAKE123456)" and "${prefix} (FAKE654321)" in ${path.join(home, 'Library', 'Keychains', 'login.keychain-db')})`;
    const tool = {
      sign: () => ({ ok: false, message: ambiguous }),
      verify: () => ({ ok: true, message: null }),
      describe: () => ({ kind: 'certificate', identifier: null, format: null, runtime: false }),
    };
    const r = signArtifact({ path: target }, { env, stderr: { write() {} }, tool });
    assert.equal(r.exitCode, EXIT.FAIL);
    assertNoSecrets(r.result.error, [prefix, 'FAKE123456', 'FAKE654321', 'Keychains'], 'sign の error');
    assert.match(r.result.error, /"<identity-candidate>" and "<identity-candidate>" in <keychain>/);
  }));

test('L2: codesign の呼び出しと info の版の照会の子に、署名・公証・updater の秘密の変数を渡さない', () =>
  withHome((home) => {
    const recordDir = path.join(home, 'records');
    fs.mkdirSync(recordDir);
    const PATH = makeFakeBin(path.join(home, 'fakebin'));
    const env = cleanEnv(home, {
      PATH,
      FAKE_RECORD: recordDir,
      MACBUILD_LOCK_DIR: path.join(home, 'lock'),
      MACBUILD_UPDATER_KEY_PASSWORD_ENV: 'EXAMPLE_UPDATER_PW',
      MACBUILD_APPLE_PASSWORD_ENV: 'EXAMPLE_APPLE_PW',
      EXAMPLE_UPDATER_PW: FAKE.updaterPassword,
      EXAMPLE_APPLE_PW: FAKE.applePassword,
      APPLE_ID: FAKE.parentAppleId,
      APPLE_SIGNING_IDENTITY: FAKE.identity,
      TAURI_SIGNING_PRIVATE_KEY: 'parent-key',
    });
    const target = path.join(home, 'thing.bin');
    fs.writeFileSync(target, 'x');
    const signed = runCli(['sign', target], { env });
    assert.equal(signed.status, EXIT.OK, signed.stderr);
    const info = runCli(['info'], { env });
    assert.equal(info.status, EXIT.OK, info.stderr);

    const records = readFakeRecords(recordDir);
    assert.ok(records.some((r) => r.name === 'codesign' && r.args.includes('--sign')), 'codesign の署名');
    assert.ok(records.some((r) => r.name === 'codesign' && r.args.includes('--verify')), 'codesign の確かめ');
    assert.ok(records.some((r) => r.name === 'cargo' && r.args.includes('--version')), 'info の cargo --version');
    for (const r of records) {
      assert.deepEqual(r.APPLE, {}, `${r.name} ${r.args.join(' ')}`);
      assert.deepEqual(r.TAURI, {}, `${r.name} ${r.args.join(' ')}`);
      for (const k of ['EXAMPLE_UPDATER_PW', 'EXAMPLE_APPLE_PW']) assert.equal(r.keys.includes(k), false, `${r.name} に ${k}`);
    }
  }));
