'use strict';
// 秘密の扱い。出力・error message・log に出す文字列は、必ずここの redactor を通す。
// - 決まった形（npm・GitHub の token・Authorization・_authToken・URL の userinfo）を伏せる。
// - 環境の token らしい変数の値と、実行時に取り出した token（Gitea）を、値の一致で伏せる。
// wrapper は token を読まない。Gitea の token は git credential fill で実行時に取り、この redactor に登録する。

const MIN_SECRET_LENGTH = 4;
const SECRET_NAME_RE = /(TOKEN|PASSWORD|PASSWD|SECRET|CREDENTIAL|AUTH)/i;

const PATTERNS = [
  [/(_authToken|_auth|_password)(\s*=\s*)\S+/gi, '$1$2<secret>'],
  [/\bnpm_[A-Za-z0-9]{20,}/g, '<secret>'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, '<secret>'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, '<secret>'],
  [/(authorization\s*[:=]\s*)(bearer|token|basic)\s+\S+/gi, '$1$2 <secret>'],
  [/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+(?::[^\s/@]*)?@/gi, '$1<credentials>@'],
];

/** 環境変数のうち、名前が token・password らしい物の値。 */
function envSecrets(env = process.env) {
  const out = [];
  for (const [k, v] of Object.entries(env)) {
    if (SECRET_NAME_RE.test(k) && typeof v === 'string' && v.length >= MIN_SECRET_LENGTH) out.push(v);
  }
  return out;
}

/** 文字列から秘密を伏せる object。add() で実行時に得た値を足せる。長い値から先に置き換える。 */
function makeRedactor(values = []) {
  const set = new Set();
  const add = (v) => {
    if (typeof v === 'string' && v.length >= MIN_SECRET_LENGTH) set.add(v);
  };
  values.forEach(add);
  const redact = (text) => {
    let s = String(text);
    for (const v of [...set].sort((a, b) => b.length - a.length)) s = s.split(v).join('<secret>');
    for (const [re, to] of PATTERNS) s = s.replace(re, to);
    return s;
  };
  return { add, redact };
}

module.exports = { envSecrets, makeRedactor, MIN_SECRET_LENGTH };
