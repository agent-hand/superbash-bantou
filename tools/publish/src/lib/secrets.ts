// 秘密の扱い。出力・error message・log に出す文字列は、必ずここの redactor を通す。
// - 決まった形（npm・GitHub の token・Authorization・_authToken・URL の userinfo）を伏せる。
// - 環境の token らしい変数の値と、実行時に取り出した token（Gitea）を、値の一致で伏せる。
// wrapper は token を読まない。Gitea の token は git credential fill で実行時に取り、この redactor に登録する。

const MIN_SECRET_LENGTH = 4;
// 環境の変数の値から拾う時は、短い物・true/false・数字だけの物（NPM_CONFIG_ALWAYS_AUTH=true など）を除く（出力を壊すため）。
const MIN_ENV_SECRET_LENGTH = 8;
const PLAIN_VALUE_RE = /^(true|false|null|undefined|\d+)$/i;
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
    if (SECRET_NAME_RE.test(k) && typeof v === 'string' && v.length >= MIN_ENV_SECRET_LENGTH && !PLAIN_VALUE_RE.test(v)) out.push(v);
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
  // 値の文字列の葉だけを伏せる（直列化の後の文字列に通すと、escape された値が漏れ、短い値の一致で JSON が壊れる）。
  const redactDeep = (value) => {
    if (typeof value === 'string') return redact(value);
    if (Array.isArray(value)) return value.map(redactDeep);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactDeep(v)]));
    return value;
  };
  return { add, redact, redactDeep };
}

export { envSecrets, makeRedactor, MIN_SECRET_LENGTH };
