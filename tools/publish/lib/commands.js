'use strict';
// CLI の副 command と引数の表。toolconfig.json の spec.in と同じ形・同じ順（test で照合する）。
// superbash の wrapper は argv = [subcommand] + options（定義の順）+ positionals（定義の順、`--` 無し）で起動する。

const { UsageError } = require('./errors');

const NPM_OPTIONS = [
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
const RELEASE_POSITIONALS = [
  { name: 'repo', type: 'string', optional: false },
  { name: 'tag', type: 'string', optional: false },
];

const COMMANDS = Object.freeze({
  'npm-publish': {
    name: 'npm-publish',
    options: NPM_OPTIONS,
    positionals: [{ name: 'target', type: 'string', optional: false }],
  },
  'verdaccio-publish': {
    name: 'verdaccio-publish',
    options: NPM_OPTIONS,
    positionals: [{ name: 'target', type: 'string', optional: false }],
  },
  'github-repo-create': {
    name: 'github-repo-create',
    options: REPO_CREATE_OPTIONS,
    positionals: [{ name: 'repo', type: 'string', optional: false }],
  },
  'github-release-create': {
    name: 'github-release-create',
    options: RELEASE_OPTIONS,
    positionals: RELEASE_POSITIONALS,
  },
  'gitea-repo-create': {
    name: 'gitea-repo-create',
    options: REPO_CREATE_OPTIONS,
    positionals: [{ name: 'repo', type: 'string', optional: false }],
  },
  'gitea-release-create': {
    name: 'gitea-release-create',
    options: RELEASE_OPTIONS,
    positionals: RELEASE_POSITIONALS,
  },
});

// help は副 command の表の外（必須の副 command。spec を出す）。
const HELP = 'help';

/**
 * argv を { subcommand, values } に読む。
 * options は最初の positional（か `--`）の前だけ読む（wrapper の並びと同じ）。それ以降はすべて positional。
 */
function parse(argv) {
  const [sub, ...rest] = argv;
  if (sub === undefined || sub === '-h' || sub === '--help') {
    return { subcommand: HELP, values: {} };
  }
  if (sub === HELP) {
    if (rest.length > 1) throw new UsageError('使い方: publish help [<command>]');
    return { subcommand: HELP, values: rest.length ? { command: rest[0] } : {} };
  }
  const def = Object.prototype.hasOwnProperty.call(COMMANDS, sub) ? COMMANDS[sub] : null;
  if (!def) throw new UsageError(`未知の副 command: ${sub}（publish help で一覧）`);

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
  return { subcommand: sub, values };
}

module.exports = { COMMANDS, HELP, parse };
