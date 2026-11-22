'use strict';
// host の設定。項目ごとに 環境変数（MACBUILD_*）> 設定の file > 既定 の順で決める。
// 鍵は path を持つだけで、中身は読まない・写さない・出力しない。
// password と公証の資格は値を持たず、「値を持つ環境変数の名前」だけを持つ。

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { EnvError } = require('./errors');

const CONFIG_ENV = 'MACBUILD_CONFIG';

// file の key → 環境変数の名前と種類（path は ~ と相対 path を解く。envName は環境変数の名前）。
// passAs: identity で build する時、その名前の変数の値を Tauri にこの名前で渡す（公証の資格）。
const FIELDS = Object.freeze({
  identity: { env: 'MACBUILD_IDENTITY', kind: 'string' },
  updaterKeyPath: { env: 'MACBUILD_UPDATER_KEY_PATH', kind: 'path' },
  updaterKeyPasswordEnv: { env: 'MACBUILD_UPDATER_KEY_PASSWORD_ENV', kind: 'envName' },
  appleIdEnv: { env: 'MACBUILD_APPLE_ID_ENV', kind: 'envName', passAs: 'APPLE_ID' },
  applePasswordEnv: { env: 'MACBUILD_APPLE_PASSWORD_ENV', kind: 'envName', passAs: 'APPLE_PASSWORD' },
  appleTeamIdEnv: { env: 'MACBUILD_APPLE_TEAM_ID_ENV', kind: 'envName', passAs: 'APPLE_TEAM_ID' },
  appleApiKeyEnv: { env: 'MACBUILD_APPLE_API_KEY_ENV', kind: 'envName', passAs: 'APPLE_API_KEY' },
  appleApiIssuerEnv: { env: 'MACBUILD_APPLE_API_ISSUER_ENV', kind: 'envName', passAs: 'APPLE_API_ISSUER' },
  appleApiKeyPathEnv: { env: 'MACBUILD_APPLE_API_KEY_PATH_ENV', kind: 'envName', passAs: 'APPLE_API_KEY_PATH' },
  appleProviderShortNameEnv: {
    env: 'MACBUILD_APPLE_PROVIDER_SHORT_NAME_ENV',
    kind: 'envName',
    passAs: 'APPLE_PROVIDER_SHORT_NAME', // 複数の team に属する Apple ID で公証する時
  },
  lockDir: { env: 'MACBUILD_LOCK_DIR', kind: 'path' },
  logDir: { env: 'MACBUILD_LOG_DIR', kind: 'path' },
});

/** 公証の資格: [設定の key, Tauri に渡す名前]。 */
const NOTARIZE_FIELDS = Object.freeze(
  Object.entries(FIELDS)
    .filter(([, f]) => f.passAs)
    .map(([key, f]) => [key, f.passAs]),
);

const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function defaultConfigPath(home) {
  return path.join(home, '.config', 'superbash-bantou', 'config.json');
}

function defaults(home) {
  const d = {};
  for (const key of Object.keys(FIELDS)) d[key] = null;
  d.lockDir = path.join(home, 'Library', 'Caches', 'superbash-bantou');
  d.logDir = path.join(home, 'Library', 'Logs', 'superbash-bantou');
  return d;
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
  return data;
}

/**
 * host の設定を読む。設定の file の未知の key は無視し、warnings に入れる（誤りにはしない）。
 * @returns {{ identity, updaterKeyPath, updaterKeyPasswordEnv, apple*Env, lockDir, logDir,
 *            signingMode: 'adhoc'|'identity', sources: Object<string,string>, warnings: string[],
 *            file: { path, explicit, found } }}
 */
function loadConfig({ env = process.env, home = os.homedir(), cwd = process.cwd() } = {}) {
  const explicit = typeof env[CONFIG_ENV] === 'string' && env[CONFIG_ENV] !== '';
  const filePath = explicit ? expandPath(env[CONFIG_ENV], home, cwd) : defaultConfigPath(home);
  const data = readFile(filePath, explicit);

  const result = defaults(home);
  const sources = {};
  const warnings = [];
  for (const key of Object.keys(FIELDS)) {
    sources[key] = result[key] === null ? 'unset' : 'default';
  }
  if (data) {
    for (const [key, value] of Object.entries(data)) {
      if (key === '$schema') continue;
      if (!Object.prototype.hasOwnProperty.call(FIELDS, key)) {
        warnings.push(`設定の file の未知の key を無視する: ${key}`);
        continue;
      }
      if (value === null) continue;
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
    warnings,
    file: { path: filePath, explicit, found: data !== null },
  };
}

/** 設定の警告を stderr に出す。 */
function reportWarnings(config, stderr) {
  for (const w of config.warnings || []) stderr.write(`macbuild: 警告: ${w}\n`);
}

/** codesign に渡す identity（ad-hoc は `-`）。 */
function codesignIdentity(config) {
  return config.signingMode === 'identity' ? config.identity : '-';
}

module.exports = {
  CONFIG_ENV,
  FIELDS,
  NOTARIZE_FIELDS,
  defaultConfigPath,
  loadConfig,
  reportWarnings,
  codesignIdentity,
  expandPath,
};
