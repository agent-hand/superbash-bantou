'use strict';
// host の設定。項目ごとに 環境変数（PUBLISH_*）> 設定の file の順で決める。既定は無い（無ければ誤り、終了 code 4）。
// 設定の file は macbuild と同じ（~/.config/superbash-bantou/config.json）。macbuild の key は無視する。

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { EnvError } = require('./errors');

const CONFIG_ENV = 'PUBLISH_CONFIG';

const FIELDS = Object.freeze({
  verdaccioRegistry: { env: 'PUBLISH_VERDACCIO_REGISTRY' },
  giteaUrl: { env: 'PUBLISH_GITEA_URL' },
  giteaUsername: { env: 'PUBLISH_GITEA_USERNAME' },
});

// 同じ file を読む macbuild の key（未知の key の警告から外す）。
const OTHER_TOOL_KEYS = new Set(Object.keys(require('../../macbuild/lib/config').FIELDS));

function defaultConfigPath(home) {
  return path.join(home, '.config', 'superbash-bantou', 'config.json');
}

function expandPath(value, home, base) {
  let v = value;
  if (v === '~') v = home;
  else if (v.startsWith('~/')) v = path.join(home, v.slice(2));
  return path.resolve(base, v);
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

/** 設定の URL を検証して返す（http・https のみ。userinfo・query・fragment は誤り）。 */
function normalizeUrl(value, where) {
  let u;
  try {
    u = new URL(value);
  } catch {
    throw new EnvError(`${where} は URL でなければならない`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new EnvError(`${where} は http か https の URL でなければならない`);
  if (u.username || u.password) throw new EnvError(`${where} に認証情報（user:pass@）を入れてはならない`);
  if (u.search || u.hash) throw new EnvError(`${where} に query・fragment を入れてはならない`);
  return u;
}

/**
 * host の設定を読む。
 * @returns {{ verdaccioRegistry: string|null, giteaUrl: string|null, giteaUsername: string|null,
 *            sources: Object<string,string>, warnings: string[] }}
 */
function loadConfig({ env = process.env, home = os.homedir(), cwd = process.cwd() } = {}) {
  const explicit = typeof env[CONFIG_ENV] === 'string' && env[CONFIG_ENV] !== '';
  const filePath = explicit ? expandPath(env[CONFIG_ENV], home, cwd) : defaultConfigPath(home);
  const data = readFile(filePath, explicit);
  const result = {};
  const sources = {};
  const warnings = [];
  for (const key of Object.keys(FIELDS)) {
    result[key] = null;
    sources[key] = 'unset';
  }
  if (data) {
    for (const [key, value] of Object.entries(data)) {
      if (key === '$schema' || OTHER_TOOL_KEYS.has(key)) continue;
      if (!Object.prototype.hasOwnProperty.call(FIELDS, key)) {
        warnings.push(`設定の file の未知の key を無視する: ${key}`);
        continue;
      }
      if (value === null) continue;
      if (typeof value !== 'string') throw new EnvError(`設定の file の ${key} は文字列でなければならない`);
      result[key] = value;
      sources[key] = 'file';
    }
  }
  for (const [key, field] of Object.entries(FIELDS)) {
    const v = env[field.env];
    if (typeof v !== 'string' || v === '') continue;
    result[key] = v;
    sources[key] = 'env';
  }
  return { ...result, sources, warnings };
}

function need(config, key) {
  const v = config[key];
  if (v === null || v === '') {
    throw new EnvError(`host の設定に ${key} が無い（環境変数 ${FIELDS[key].env} か設定の file の ${key}）`);
  }
  return v;
}

/** verdaccio の registry の URL（検証済み。npm に渡す形）。 */
function verdaccioRegistry(config) {
  const u = normalizeUrl(need(config, 'verdaccioRegistry'), 'verdaccioRegistry');
  return u.href.endsWith('/') ? u.href : u.href + '/';
}

/** Gitea の設定: { baseUrl（末尾 / 無し）, host（port 付き。credential の host）, protocol, username }。 */
function gitea(config) {
  const u = normalizeUrl(need(config, 'giteaUrl'), 'giteaUrl');
  const username = need(config, 'giteaUsername');
  return {
    baseUrl: (u.origin + u.pathname).replace(/\/+$/, ''),
    host: u.host,
    protocol: u.protocol.slice(0, -1),
    username,
  };
}

function reportWarnings(config, stderr) {
  for (const w of config.warnings || []) stderr.write(`publish: 警告: ${w}\n`);
}

module.exports = { CONFIG_ENV, FIELDS, loadConfig, verdaccioRegistry, gitea, reportWarnings, defaultConfigPath };
