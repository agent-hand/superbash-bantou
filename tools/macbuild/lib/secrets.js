'use strict';
// 秘密の扱い。
// - 子の環境: 署名・公証の生の変数（APPLE_*）と updater の鍵の変数（TAURI_SIGNING_* など）は、親の環境から子へ渡さない。
//   設定が「値を持つ環境変数の名前」として指す元の変数（password・公証の資格）も渡さない。
//   必要な値は、呼ぶ側（tauri）が Tauri の期待する名前で入れ直す。
// - 出力と log: identity の文字列（と、その末尾の team id）・updater の鍵の path・設定が名前で指す変数の値・
//   keychain の path を、書く前に伏せる。

const { FIELDS } = require('./config');

const SECRET_PREFIXES = ['APPLE_', 'TAURI_SIGNING_'];
const SECRET_NAMES = new Set(['TAURI_PRIVATE_KEY', 'TAURI_KEY_PASSWORD']); // Tauri v1 の名前

// 短すぎる値は伏せない（log 全体を壊すため）。identity・path・資格は通常これより長い。
const MIN_SECRET_LENGTH = 4;

const KEYCHAINS_DIR_RE = /[^\s'"`()]*\/Keychains(?:\/[^\s'"`()]*)?/g;
const KEYCHAIN_FILE_RE = /[^\s'"`()]*\.keychain(?:-db)?(?![\w.-])/g;
const TEAM_ID_RE = /\(([A-Z0-9]{10})\)\s*$/;

function isSecretName(name) {
  return SECRET_NAMES.has(name) || SECRET_PREFIXES.some((p) => name.startsWith(p));
}

/** 設定が「値を持つ環境変数の名前」として指す変数の名前。 */
function namedEnvs(config) {
  if (!config) return [];
  return Object.entries(FIELDS)
    .filter(([, f]) => f.kind === 'envName')
    .map(([key]) => config[key])
    .filter(Boolean);
}

/** 子の環境（署名・公証・updater の秘密の変数を外した写し）。親の環境は変えない。 */
function scrubEnv(baseEnv, config) {
  const drop = new Set(namedEnvs(config));
  const env = {};
  for (const [k, v] of Object.entries(baseEnv)) {
    if (drop.has(k) || isSecretName(k)) continue;
    env[k] = v;
  }
  return env;
}

/** 伏せる文字列と置き換え: [[値, 印], ...]。 */
function secretsOf(config, baseEnv = {}) {
  const list = [];
  if (config) {
    if (config.signingMode === 'identity') {
      list.push([config.identity, '<identity>']);
      const team = config.identity.match(TEAM_ID_RE);
      if (team) list.push([team[1], '<team-id>']);
    }
    if (config.updaterKeyPath) list.push([config.updaterKeyPath, '<updater-key>']);
    for (const name of namedEnvs(config)) {
      if (typeof baseEnv[name] === 'string') list.push([baseEnv[name], '<secret>']);
    }
  }
  return list.filter(([v]) => typeof v === 'string' && v.length >= MIN_SECRET_LENGTH);
}

/** 文字列から秘密を伏せる関数。長い値から先に置き換える。 */
function makeRedactor(secrets) {
  const sorted = [...secrets].sort((a, b) => b[0].length - a[0].length);
  return (text) => {
    let s = String(text);
    for (const [value, mark] of sorted) s = s.split(value).join(mark);
    return s.replace(KEYCHAINS_DIR_RE, '<keychain>').replace(KEYCHAIN_FILE_RE, '<keychain>');
  };
}

module.exports = { isSecretName, namedEnvs, scrubEnv, secretsOf, makeRedactor, MIN_SECRET_LENGTH };
