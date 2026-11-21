'use strict';
// CLI の副 command と引数の表。toolconfig.json の spec.in と同じ形・同じ順（test で照合する）。
// superbash の wrapper は argv = [subcommand] + options（定義の順）+ positionals（定義の順、`--` 無し）で起動する。

const { UsageError } = require('./errors');

const COMMANDS = Object.freeze({
  info: {
    name: 'macbuild-info',
    options: [],
    positionals: [],
  },
  tauri: {
    name: 'macbuild-tauri',
    options: [
      { key: 'target', flag: '--target', type: 'string' },
      { key: 'bundles', flag: '--bundles', type: 'string' },
      { key: 'debug', flag: '--debug', type: 'boolean' },
      { key: 'targetDir', flag: '--target-dir', type: 'string' },
    ],
    positionals: [{ name: 'project', type: 'string', optional: false }],
  },
  sign: {
    name: 'macbuild-sign',
    options: [
      { key: 'entitlements', flag: '--entitlements', type: 'string' },
      { key: 'noTimestamp', flag: '--no-timestamp', type: 'boolean' },
    ],
    positionals: [{ name: 'path', type: 'string', optional: false }],
  },
});

// help は副 command の表の外（必須の副 command。spec を出す）。
const HELP = 'help';

function scalar(name, type, raw) {
  if (type === 'string') return raw;
  if (type === 'number') {
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(n)) throw new UsageError(`${name} は number: ${raw}`);
    return n;
  }
  throw new UsageError(`未知の型: ${type}`);
}

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
    if (rest.length > 1) throw new UsageError('使い方: macbuild help [<command>]');
    return { subcommand: HELP, values: rest.length ? { command: rest[0] } : {} };
  }
  const def = COMMANDS[sub];
  if (!def) throw new UsageError(`未知の副 command: ${sub}（macbuild help で一覧）`);

  const byFlag = new Map(def.options.map((o) => [o.flag, o]));
  const values = {};
  const positionals = [];
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
      values[opt.key] = scalar(opt.key, opt.type, rest[++i]);
    }
  }
  positionals.push(...rest.slice(i));

  if (positionals.length > def.positionals.length) {
    throw new UsageError(`引数が多い: ${positionals.slice(def.positionals.length).join(' ')}`);
  }
  def.positionals.forEach((p, idx) => {
    if (idx < positionals.length) {
      values[p.name] = scalar(p.name, p.type, positionals[idx]);
    } else if (!p.optional) {
      throw new UsageError(`必須の引数が無い: <${p.name}>`);
    }
  });
  for (const o of def.options) {
    if (o.type === 'boolean' && values[o.key] === undefined) values[o.key] = false;
  }
  return { subcommand: sub, values };
}

module.exports = { COMMANDS, HELP, parse };
