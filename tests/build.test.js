'use strict';
// macbuild tauri と macbuild sign の流れ（偽の Tauri の CLI と ad-hoc の codesign で。Rust は使わない）。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const codesign = require('../tools/macbuild/lib/codesign');
const { EXIT } = require('../tools/macbuild/lib/errors');
const { makeTmp, rmTmp, cleanEnv, runCli, makeFakeProject, readRecord } = require('./helpers/env');

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

test('tauri: ad-hoc で build し、成果物・log・署名の確かめを出す', () =>
  withHome((home) => {
    const { project, env } = setup(home, {
      APPLE_CERTIFICATE: 'parent-cert',
      APPLE_ID: 'someone@example.com',
      CARGO_TARGET_DIR: '/should/be/overridden',
    });
    const targetDir = path.join(home, 'target');
    const r = runCli(['tauri', '--bundles', 'app', '--target-dir', targetDir, project], { env, cwd: home });
    assert.equal(r.status, EXIT.OK, r.stderr + r.stdout);

    const rec = readRecord(project);
    assert.deepEqual(rec.args, ['build', '--ci', '--bundles', 'app']);
    assert.equal(rec.cwd, project);
    assert.equal(rec.APPLE_SIGNING_IDENTITY, '-');
    assert.equal(rec.CARGO_TARGET_DIR, targetDir);
    assert.equal(rec.APPLE_CERTIFICATE, null, '親の証明書は渡さない');
    assert.equal(rec.APPLE_ID, null, 'ad-hoc では公証の資格を渡さない');
    assert.equal(rec.TAURI_SIGNING_PRIVATE_KEY, null);

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
        signature: { kind: 'adhoc', identifier: 'com.example.fake', format: 'app bundle with generic', runtime: false },
        verified: true,
      },
    ]);
    assert.ok(fs.existsSync(out.log));
    assert.ok(out.log.startsWith(path.join(home, 'logs') + path.sep));
    const log = fs.readFileSync(out.log, 'utf8');
    assert.match(log, /# signing: adhoc/);
    assert.match(log, /Running fake tauri build/);
    assert.match(r.stderr, /lock を取った/);
    assert.match(r.stderr, new RegExp(`build を始めた: log ${out.log.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  }));

test('tauri: updater の鍵は path を渡し、password は設定の環境変数名から引く（中身は出さない）', () =>
  withHome((home) => {
    const keyPath = path.join(home, 'keys', 'example-updater.key');
    fs.mkdirSync(path.dirname(keyPath), { recursive: true });
    fs.writeFileSync(keyPath, 'example key body');
    const { project, env } = setup(home, {
      MACBUILD_UPDATER_KEY_PATH: keyPath,
      MACBUILD_UPDATER_KEY_PASSWORD_ENV: 'EXAMPLE_UPDATER_PW',
      EXAMPLE_UPDATER_PW: 'example-password-value',
    });
    const r = runCli(['tauri', project], { env });
    assert.equal(r.status, EXIT.OK, r.stderr);
    const rec = readRecord(project);
    assert.equal(rec.TAURI_SIGNING_PRIVATE_KEY, keyPath);
    assert.equal(rec.TAURI_SIGNING_PRIVATE_KEY_PASSWORD, 'example-password-value');
    assert.equal(r.json.updaterKey, true);
    const all = r.stdout + r.stderr + fs.readFileSync(r.json.log, 'utf8');
    for (const secret of ['example key body', 'example-password-value', keyPath]) {
      assert.equal(all.includes(secret), false, `出力・log に ${secret}`);
    }
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

test('tauri: Tauri の project でない・無い dir は終了 code 2、CLI が無いと 4', () =>
  withHome((home) => {
    const env = cleanEnv(home, { MACBUILD_LOCK_DIR: path.join(home, 'lock'), MACBUILD_LOG_DIR: path.join(home, 'logs') });
    assert.equal(runCli(['tauri', path.join(home, 'nope')], { env }).status, EXIT.USAGE);
    fs.mkdirSync(path.join(home, 'plain'));
    assert.equal(runCli(['tauri', path.join(home, 'plain')], { env }).status, EXIT.USAGE);
    const bare = path.join(home, 'bare');
    fs.mkdirSync(path.join(bare, 'src-tauri'), { recursive: true });
    fs.writeFileSync(path.join(bare, 'src-tauri', 'tauri.conf.json'), '{}');
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
    assert.match(r.stderr, /fake build failed on purpose/);
    assert.ok(fs.existsSync(r.json.log));
  }));

test('sign: ad-hoc で署名し直し、確かめる', () =>
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

    // 中身を足すと確かめが通らない → 署名し直すと通る
    fs.mkdirSync(path.join(app, 'Contents', 'Resources'), { recursive: true });
    fs.writeFileSync(path.join(app, 'Contents', 'Resources', 'extra.txt'), 'changed');
    assert.equal(codesign.verify(app).ok, false);
    const again = runCli(['sign', app], { env });
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
