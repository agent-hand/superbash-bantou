'use strict';
// host の設定。項目ごとに 環境変数（MACBUILD_*）> 設定の file > 既定 の順で決める。
// 鍵は path を持つだけで、中身は読まない・写さない・出力しない。

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { EnvError } = require('./errors');

const CONFIG_ENV = 'MACBUILD_CONFIG';

// file の key → 環境変数の名前と種類（path は ~ と相対 path を解く）。
const FIELDS = Object.freeze({
  identity: { env: 'MACBUILD_IDENTITY', kind: 'string' },
  updaterKeyPath: { env: 'MACBUILD_UPDATER_KEY_PATH', kind: 'path' },
  updaterKeyPasswordEnv: { env: 'MACBUILD_UPDATER_KEY_PASSWORD_ENV', kind: 'envName' },
  lockDir: { env: 'MACBUILD_LOCK_DIR', kind: 'path' },
  logDir: { env: 'MACBUILD_LOG_DIR', kind: 'path' },
});

const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function defaultConfigPath(home) {
  return path.join(home, '.config', 'superbash-macbuild', 'config.json');
}

function defaults(home) {
  return {
    identity: null,
    updaterKeyPath: null,
    updaterKeyPasswordEnv: null,
    lockDir: path.join(home, 'Library', 'Caches', 'superbash-macbuild'),
    logDir: path.join(home, 'Library', 'Logs', 'superbash-macbuild'),
  };
}

function expandPath(value, home, base) {
  let v = value;
  if (v === '~') v = home;
  else if (v.startsWith('~/')) v = path.join(home, v.slice(2));
  return path.resolve(base, v);
}

function normalize(key, value, { home, base, where }) {
  const field = FIELDS[key];
  if (typeof value !== 'string') throw new EnvError(`${where} の ${key} は文字列でなければならない`);
  if (field.kind === 'path') return expandPath(value, home, base);
  if (field.kind === 'envName' && !ENV_NAME_RE.test(value)) {
    throw new EnvError(`${where} の ${key} は環境変数の名前でなければならない`);
  }
  return value;
}

function readFile(file, explicit) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT' && !explicit) return null;
    if (e.code === 'ENOENT') throw new EnvError(`${CONFIG_ENV} の設定の file が無い: ${file}`);
    throw new EnvError(`設定の file を読めない: ${file}: ${e.code || e.message}`);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new EnvError(`設定の file が JSON でない: ${file}: ${e.message}`);
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new EnvError(`設定の file は JSON の object でなければならない: ${file}`);
  }
  for (const key of Object.keys(data)) {
    if (key === '$schema') continue;
    if (!Object.prototype.hasOwnProperty.call(FIELDS, key)) {
      throw new EnvError(`設定の file に未知の key: ${key}（使える key: ${Object.keys(FIELDS).join(', ')}）`);
    }
  }
  return data;
}

/**
 * host の設定を読む。
 * @returns {{ identity, updaterKeyPath, updaterKeyPasswordEnv, lockDir, logDir,
 *            signingMode: 'adhoc'|'identity', sources: Object<string,string>,
 *            file: { path, explicit, found } }}
 */
function loadConfig({ env = process.env, home = os.homedir(), cwd = process.cwd() } = {}) {
  const explicit = typeof env[CONFIG_ENV] === 'string' && env[CONFIG_ENV] !== '';
  const filePath = explicit ? expandPath(env[CONFIG_ENV], home, cwd) : defaultConfigPath(home);
  const data = readFile(filePath, explicit);

  const result = defaults(home);
  const sources = {};
  for (const key of Object.keys(FIELDS)) {
    sources[key] = result[key] === null ? 'unset' : 'default';
  }
  if (data) {
    for (const [key, value] of Object.entries(data)) {
      if (key === '$schema' || value === null) continue;
      result[key] = normalize(key, value, { home, base: path.dirname(filePath), where: '設定の file' });
      sources[key] = 'file';
    }
  }
  for (const [key, field] of Object.entries(FIELDS)) {
    const v = env[field.env];
    if (typeof v !== 'string' || v === '') continue; // 空は未設定と同じ
    result[key] = normalize(key, v, { home, base: cwd, where: field.env });
    sources[key] = 'env';
  }

  const signingMode = result.identity && result.identity !== '-' ? 'identity' : 'adhoc';
  return {
    ...result,
    signingMode,
    sources,
    file: { path: filePath, explicit, found: data !== null },
  };
}

/** codesign に渡す identity（ad-hoc は `-`）。 */
function codesignIdentity(config) {
  return config.signingMode === 'identity' ? config.identity : '-';
}

module.exports = { CONFIG_ENV, FIELDS, defaultConfigPath, loadConfig, codesignIdentity, expandPath };
