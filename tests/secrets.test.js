'use strict';
// 秘密の外しと伏せ: 子の環境（scrubEnv）と、出力・log の文字列（makeRedactor）。

const assert = require('node:assert/strict');
const test = require('node:test');

const { scrubEnv, secretsOf, makeRedactor } = require('../tools/macbuild/lib/secrets');
const { FAKE } = require('./helpers/env');

test('scrubEnv: APPLE_*・TAURI_SIGNING_*・Tauri v1 の鍵の変数と、設定が名前で指す変数を外す', () => {
  const base = {
    PATH: '/usr/bin',
    HOME: '/h',
    APPLE_ID: FAKE.parentAppleId,
    APPLE_SIGNING_IDENTITY: FAKE.identity,
    APPLE_SOMETHING_NEW: 'x',
    TAURI_SIGNING_PRIVATE_KEY: 'k',
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: 'p',
    TAURI_PRIVATE_KEY: 'k1',
    TAURI_KEY_PASSWORD: 'p1',
    TAURI_ENV_DEBUG: 'kept', // 署名と関係の無い TAURI_* は残す
    EXAMPLE_UPDATER_PW: FAKE.updaterPassword,
    EXAMPLE_APPLE_PW: FAKE.applePassword,
  };
  const config = { updaterKeyPasswordEnv: 'EXAMPLE_UPDATER_PW', applePasswordEnv: 'EXAMPLE_APPLE_PW' };
  assert.deepEqual(scrubEnv(base, config), { PATH: '/usr/bin', HOME: '/h', TAURI_ENV_DEBUG: 'kept' });
  assert.deepEqual(Object.keys(scrubEnv(base, null)).sort(), ['EXAMPLE_APPLE_PW', 'EXAMPLE_UPDATER_PW', 'HOME', 'PATH', 'TAURI_ENV_DEBUG']);
  assert.equal(base.APPLE_ID, FAKE.parentAppleId, '親の環境は変えない');
});

test('secretsOf と makeRedactor: identity・team id・鍵の path・名前の変数の値・keychain の path を伏せる', () => {
  const config = {
    signingMode: 'identity',
    identity: FAKE.identity,
    updaterKeyPath: '/secrets/example-updater.key',
    updaterKeyPasswordEnv: 'EXAMPLE_UPDATER_PW',
    appleIdEnv: 'EXAMPLE_APPLE_ID',
  };
  const env = { EXAMPLE_UPDATER_PW: FAKE.updaterPassword, EXAMPLE_APPLE_ID: FAKE.appleId };
  const redact = makeRedactor(secretsOf(config, env));
  const text = [
    `     Signing with identity "${FAKE.identity}"`,
    `error: team ${FAKE.teamId} not found`,
    'failed to read private key from file /secrets/example-updater.key',
    `notarize as ${FAKE.appleId} with ${FAKE.updaterPassword}`,
    'using keychain /var/example/Library/Keychains/login.keychain-db',
    'also build.keychain and "/var/example/Library/Keychains"',
  ].join('\n');
  const out = redact(text);
  for (const secret of [FAKE.identity, FAKE.teamId, '/secrets/example-updater.key', FAKE.appleId, FAKE.updaterPassword, 'login.keychain-db', 'build.keychain', 'Keychains']) {
    assert.equal(out.includes(secret), false, `${secret} が残っている:\n${out}`);
  }
  assert.match(out, /Signing with identity "<identity>"/);
  assert.match(out, /team <team-id> not found/);
  assert.match(out, /from file <updater-key>/);
  assert.match(out, /using keychain <keychain>/);
});

test('ad-hoc（`-`）と短すぎる値は伏せない（log を壊さない）', () => {
  const redact = makeRedactor(secretsOf({ signingMode: 'adhoc', identity: '-', updaterKeyPasswordEnv: 'PW' }, { PW: 'ab' }));
  assert.equal(redact('Signing with identity "-" ab'), 'Signing with identity "-" ab');
});
