'use strict';
// CLI の副 command と引数の表。toolconfig.json の葉の spec.in と同じ形・同じ順（test で照合する）。
// 表の key は argv の頭の語を空白でつないだ物（上の要素の spec.subcommand と、下のサブコマンドの名前。`github release create`）。
// superbash の wrapper は argv = その語 + options（定義の順）+ [`--`] + positionals（定義の順）で起動する。name は葉の並びの名前。

const { UsageError } = require('./errors');

const NPM_OPTIONS = [
  { key: 'registry', flag: '--registry', type: 'string' },
  { key: 'tag', flag: '--tag', type: 'string' },
  { key: 'access', flag: '--access', type: 'string' },
  { key: 'dryRun', flag: '--dry-run', type: 'boolean' },
];
const REPO_CREATE_OPTIONS = [
  { key: 'visibility', flag: '--visibility', type: 'string' },
  { key: 'description', flag: '--description', type: 'string' },
];
const RELEASE_OPTIONS = [
  { key: 'title', flag: '--title', type: 'string' },
  { key: 'notesFile', flag: '--notes-file', type: 'string' },
  { key: 'target', flag: '--target', type: 'string' },
  { key: 'draft', flag: '--draft', type: 'boolean' },
  { key: 'prerelease', flag: '--prerelease', type: 'boolean' },
  { key: 'assets', flag: '--assets', type: 'string' },
];
const GITEA_URL = { key: 'url', flag: '--url', type: 'string' };
const RELEASE_POSITIONALS = [
  { name: 'repo', type: 'string', optional: false },
  { name: 'tag', type: 'string', optional: false },
];
const REPO_POSITIONALS = [{ name: 'repo', type: 'string', optional: false }];

const COMMANDS = Object.freeze({
  'npm publish': {
    name: 'npm publish',
    options: NPM_OPTIONS,
    positionals: [{ name: 'target', type: 'string', optional: false }],
  },
  'github repo create': { name: 'github repo create', options: REPO_CREATE_OPTIONS, positionals: REPO_POSITIONALS },
  'github release create': { name: 'github release create', options: RELEASE_OPTIONS, positionals: RELEASE_POSITIONALS },
  'gitea repo create': { name: 'gitea repo create', options: [GITEA_URL, ...REPO_CREATE_OPTIONS], positionals: REPO_POSITIONALS },
  'gitea release create': { name: 'gitea release create', options: [GITEA_URL, ...RELEASE_OPTIONS], positionals: RELEASE_POSITIONALS },
});
const MAX_WORDS = 3;

// help は副 command の表の外（必須の副 command。bin の直後だけ。`<bin> help [<並び>]`）。
const HELP = 'help';

/**
 * argv を { subcommand, values } に読む。subcommand は表の key（並びの名前の語）。
 * options は最初の positional か `--` の前だけ読む（wrapper の並びと同じ。`--` は options の後・positionals の前）。
 * `--` の後はすべて positional（`-` で始まる値も）。
 */
function parse(argv) {
  const [first, ...helpRest] = argv;
  if (first === undefined || first === '-h' || first === '--help') {
    return { subcommand: HELP, values: {} };
  }
  if (first === HELP) {
    return { subcommand: HELP, values: helpRest.length ? { words: helpRest } : {} };
  }
  // 頭の語を、長い並びから順に表と照らす（`github release create`）。
  let key = null;
  for (let n = Math.min(MAX_WORDS, argv.length); n >= 1 && key === null; n--) {
    const k = argv.slice(0, n).join(' ');
    if (Object.prototype.hasOwnProperty.call(COMMANDS, k)) key = k;
  }
  if (key === null) {
    throw new UsageError(`未知の副 command: ${argv.slice(0, MAX_WORDS).join(' ')}（help で一覧）`);
  }
  const def = COMMANDS[key];
  const rest = argv.slice(key.split(' ').length);

  const byFlag = new Map(def.options.map((o) => [o.flag, o]));
  const values = {};
  let i = 0;
  for (; i < rest.length; i++) {
    const tok = rest[i];
    if (tok === '--') {
      i++;
      break;
    }
    if (!tok.startsWith('-') || tok === '-') break;
    const opt = byFlag.get(tok);
    if (!opt) throw new UsageError(`未知の option: ${tok}`);
    if (Object.prototype.hasOwnProperty.call(values, opt.key)) {
      throw new UsageError(`option が 2 度ある: ${tok}`);
    }
    if (opt.type === 'boolean') {
      values[opt.key] = true;
    } else {
      if (i + 1 >= rest.length) throw new UsageError(`${tok} に値が無い`);
      values[opt.key] = rest[++i];
    }
  }
  const positionals = rest.slice(i);
  if (positionals.length > def.positionals.length) {
    throw new UsageError(`引数が多い: ${positionals.slice(def.positionals.length).join(' ')}`);
  }
  def.positionals.forEach((p, idx) => {
    if (idx < positionals.length) values[p.name] = positionals[idx];
    else if (!p.optional) throw new UsageError(`必須の引数が無い: <${p.name}>`);
  });
  for (const o of def.options) {
    if (o.type === 'boolean' && values[o.key] === undefined) values[o.key] = false;
  }
  return { subcommand: key, values };
}

module.exports = { COMMANDS, HELP, parse };
