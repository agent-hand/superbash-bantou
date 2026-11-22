'use strict';
// host の設定の読み込み: 環境変数 > 設定の file > 既定。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { loadConfig, defaultConfigPath, codesignIdentity } = require('../tools/macbuild/src/lib/config.ts');
const { EnvError, EXIT } = require('../tools/macbuild/src/lib/errors.ts');
const { FAKE, makeTmp, rmTmp, cleanEnv, runCli } = require('./helpers/env');

function withTmp(fn) {
  const dir = makeTmp();
  try {
    return fn(dir);
  } finally {
    rmTmp(dir);
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
}

test('何も無い時は既定（ad-hoc・lock と log は home の Library の下）', () =>
  withTmp((home) => {
    const c = loadConfig({ env: {}, home, cwd: home });
    assert.equal(c.signingMode, 'adhoc');
    assert.equal(codesignIdentity(c), '-');
    assert.equal(c.identity, null);
    assert.equal(c.updaterKeyPath, null);
    assert.equal(c.lockDir, path.join(home, 'Library', 'Caches', 'superbash-bantou'));
    assert.equal(c.logDir, path.join(home, 'Library', 'Logs', 'superbash-bantou'));
    assert.deepEqual(c.file, { path: defaultConfigPath(home), explicit: false, found: false });
    assert.equal(c.file.path, path.join(home, '.config', 'superbash-bantou', 'config.json'));
    assert.deepEqual(c.sources, {
      identity: 'unset',
      updaterKeyPath: 'unset',
      updaterKeyPasswordEnv: 'unset',
      appleIdEnv: 'unset',
      applePasswordEnv: 'unset',
      appleTeamIdEnv: 'unset',
      appleApiKeyEnv: 'unset',
      appleApiIssuerEnv: 'unset',
      appleApiKeyPathEnv: 'unset',
      appleProviderShortNameEnv: 'unset',
      lockDir: 'default',
      logDir: 'default',
    });
    assert.deepEqual(c.warnings, []);
  }));

test('公証の資格は「値を持つ環境変数の名前」だけを持つ（file と MACBUILD_APPLE_*_ENV）', () =>
  withTmp((home) => {
    writeJson(defaultConfigPath(home), { appleIdEnv: 'EXAMPLE_APPLE_ID', applePasswordEnv: 'EXAMPLE_APPLE_PW' });
    const c = loadConfig({
      env: { MACBUILD_APPLE_TEAM_ID_ENV: 'EXAMPLE_TEAM', MACBUILD_APPLE_PROVIDER_SHORT_NAME_ENV: 'EXAMPLE_PROVIDER' },
      home,
      cwd: home,
    });
    assert.equal(c.appleProviderShortNameEnv, 'EXAMPLE_PROVIDER');
    assert.equal(c.sources.appleProviderShortNameEnv, 'env');
    assert.equal(c.appleIdEnv, 'EXAMPLE_APPLE_ID');
    assert.equal(c.applePasswordEnv, 'EXAMPLE_APPLE_PW');
    assert.equal(c.appleTeamIdEnv, 'EXAMPLE_TEAM');
    assert.deepEqual([c.sources.appleIdEnv, c.sources.appleTeamIdEnv, c.sources.appleApiKeyEnv], ['file', 'env', 'unset']);
    writeJson(defaultConfigPath(home), { appleIdEnv: 'not a name' });
    assert.throws(() => loadConfig({ env: {}, home, cwd: home }), EnvError);
  }));

test('既定の場所の設定の file を読む（~ と相対 path は file の dir から解く）', () =>
  withTmp((home) => {
    const file = defaultConfigPath(home);
    writeJson(file, {
      identity: 'Example Identity',
      updaterKeyPath: '~/keys/example.key',
      updaterKeyPasswordEnv: 'EXAMPLE_UPDATER_PW',
      lockDir: 'locks',
      logDir: '/var/example/logs',
    });
    const c = loadConfig({ env: {}, home, cwd: '/' });
    assert.equal(c.signingMode, 'identity');
    assert.equal(codesignIdentity(c), 'Example Identity');
    assert.equal(c.updaterKeyPath, path.join(home, 'keys', 'example.key'));
    assert.equal(c.updaterKeyPasswordEnv, 'EXAMPLE_UPDATER_PW');
    assert.equal(c.lockDir, path.join(path.dirname(file), 'locks'));
    assert.equal(c.logDir, '/var/example/logs');
    assert.equal(c.file.found, true);
    assert.equal(c.sources.identity, 'file');
  }));

test('環境変数は項目ごとに file より優先する（空の値は未設定と同じ）', () =>
  withTmp((home) => {
    writeJson(defaultConfigPath(home), { identity: 'From File', lockDir: '/from/file/lock', logDir: '/from/file/log' });
    const env = {
      MACBUILD_IDENTITY: 'From Env',
      MACBUILD_LOCK_DIR: 'rel/lock',
      MACBUILD_LOG_DIR: '',
    };
    const c = loadConfig({ env, home, cwd: '/work' });
    assert.equal(c.identity, 'From Env');
    assert.equal(c.lockDir, '/work/rel/lock', '環境変数の相対 path は cwd から');
    assert.equal(c.logDir, '/from/file/log', '空の環境変数は無視して file');
    assert.deepEqual(
      [c.sources.identity, c.sources.lockDir, c.sources.logDir, c.sources.updaterKeyPath],
      ['env', 'env', 'file', 'unset'],
    );
  }));

test('identity が `-` なら ad-hoc（file の identity を環境変数で ad-hoc に戻せる）', () =>
  withTmp((home) => {
    writeJson(defaultConfigPath(home), { identity: 'From File' });
    const c = loadConfig({ env: { MACBUILD_IDENTITY: '-' }, home, cwd: home });
    assert.equal(c.signingMode, 'adhoc');
    assert.equal(codesignIdentity(c), '-');
  }));

test('MACBUILD_CONFIG で別の file を指す（既定の file は読まない。無ければ誤り）', () =>
  withTmp((home) => {
    writeJson(defaultConfigPath(home), { identity: 'Default File' });
    const other = path.join(home, 'other', 'macbuild.json');
    writeJson(other, { identity: 'Other File' });
    const c = loadConfig({ env: { MACBUILD_CONFIG: 'other/macbuild.json' }, home, cwd: home });
    assert.equal(c.identity, 'Other File');
    assert.deepEqual(c.file, { path: other, explicit: true, found: true });

    assert.throws(
      () => loadConfig({ env: { MACBUILD_CONFIG: path.join(home, 'missing.json') }, home, cwd: home }),
      (e) => e instanceof EnvError && e.exitCode === EXIT.ENV,
    );
  }));

test('設定の file の未知の key は誤りにせず、警告にして続ける', () =>
  withTmp((home) => {
    writeJson(defaultConfigPath(home), { identiy: 'typo', lockDir: '/x/lock', futureKey: 1 });
    const c = loadConfig({ env: {}, home, cwd: home });
    assert.equal(c.lockDir, '/x/lock');
    assert.equal(c.signingMode, 'adhoc');
    assert.deepEqual(c.warnings, ['設定の file の未知の key を無視する: identiy', '設定の file の未知の key を無視する: futureKey']);

    const r = runCli(['info'], { env: cleanEnv(home) });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /警告: 設定の file の未知の key を無視する: identiy/);
    assert.deepEqual(r.json.config.warnings, c.warnings);
  }));

test('設定の file の誤り（読めない値）は EnvError（終了 code 4）', () =>
  withTmp((home) => {
    const file = defaultConfigPath(home);
    const bad = [
      '{ not json',
      '[]',
      { identity: 42 },
      { updaterKeyPasswordEnv: 'not a name' },
    ];
    for (const value of bad) {
      writeJson(file, value);
      assert.throws(() => loadConfig({ env: {}, home, cwd: home }), EnvError, JSON.stringify(value));
    }
    writeJson(file, { $schema: 'x', identity: null });
    assert.equal(loadConfig({ env: {}, home, cwd: home }).signingMode, 'adhoc', '$schema と null は許す');
    assert.throws(
      () => loadConfig({ env: { MACBUILD_UPDATER_KEY_PASSWORD_ENV: 'bad-name' }, home, cwd: home }),
      EnvError,
    );
  }));

test('info は署名の設定の有無だけを出し、値（identity・鍵の path・password・公証の資格）は出さない', () =>
  withTmp((home) => {
    const keyPath = path.join(home, 'keys', 'example-updater.key');
    writeJson(keyPath, 'not a real key');
    writeJson(defaultConfigPath(home), {
      updaterKeyPath: keyPath,
      updaterKeyPasswordEnv: 'EXAMPLE_UPDATER_PW',
      appleIdEnv: 'EXAMPLE_APPLE_ID',
      applePasswordEnv: 'EXAMPLE_APPLE_PW',
    });
    const env = cleanEnv(home, {
      MACBUILD_IDENTITY: FAKE.identity,
      MACBUILD_LOCK_DIR: path.join(home, 'lock'),
      EXAMPLE_UPDATER_PW: FAKE.updaterPassword,
      EXAMPLE_APPLE_ID: FAKE.appleId,
    });
    const r = runCli(['info'], { env });
    assert.equal(r.status, 0, r.stderr);
    for (const secret of [FAKE.identity, FAKE.teamId, 'example-updater.key', FAKE.updaterPassword, FAKE.appleId, 'EXAMPLE_UPDATER_PW', 'EXAMPLE_APPLE_ID']) {
      assert.equal((r.stdout + r.stderr).includes(secret), false, `info の出力に ${secret}`);
    }
    assert.deepEqual(r.json.signing, {
      mode: 'identity',
      identity: true,
      updaterKey: true,
      updaterKeyFound: true,
      updaterKeyPassword: true,
      updaterKeyPasswordSet: true,
      notarize: true,
      notarizeSet: false,
    });
    assert.equal(r.json.config.found, true);
    assert.equal(r.json.config.sources.identity, 'env');
    assert.equal(r.json.lock.held, false);
    assert.ok(r.json.tools.codesign, 'codesign の項目');
    for (const name of ['xcodebuild', 'codesign', 'sccache', 'cargo', 'node']) {
      assert.equal(typeof r.json.tools[name].available, 'boolean', name);
    }
    assert.equal(fs.existsSync(path.join(home, 'lock')), false, 'info は lock の dir を作らない');
  }));

test('info は設定の誤りの時も道具の有無を出し、終了 code 4', () =>
  withTmp((home) => {
    writeJson(defaultConfigPath(home), '{ broken');
    const r = runCli(['info'], { env: cleanEnv(home) });
    assert.equal(r.status, EXIT.ENV);
    assert.match(r.json.config.error, /JSON でない/);
    assert.equal(typeof r.json.tools.codesign.available, 'boolean');
    assert.equal(r.json.signing, null);
    assert.deepEqual(Object.keys(r.json).sort(), ['config', 'developerDir', 'host', 'signing', 'tools'], 'spec の out の形');
  }));
