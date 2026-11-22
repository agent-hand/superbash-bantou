// citty の定義（args・subCommands）から argv を読む。
// 使い方の誤りは UsageError（終了 code 2）。citty は知らない option を誤りにしないので、ここで厳しく検査する。
// 検査した argv は [options（`--flag=値`）, `--`, positionals] の形に直してから citty に渡す。
// （options は最初の positional か `--` の前だけ読む。`--` の後と最初の positional の後は、`-` で始まる値も positional。）

import { UsageError } from './errors.ts';

type ArgDef = { type?: string; default?: unknown; required?: boolean; description?: string };
export type ArgsDef = Record<string, ArgDef>;
type Cmd = { args?: ArgsDef; subCommands?: Record<string, Cmd> };

/** `--no-xxx` の flag で受ける boolean（citty では xxx の default が true）。 */
export const isNegated = (def: ArgDef): boolean => def.type === 'boolean' && def.default === true;

export const kebab = (key: string): string => key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

/** citty の key に対応する、manifest 側の key（`--no-` の boolean は noXxx）。 */
export const manifestKey = (key: string, def: ArgDef): string =>
  isNegated(def) ? 'no' + key[0].toUpperCase() + key.slice(1) : key;

/** 葉の argv（subcommand の語を除いた残り）を検査し、citty に渡す形に直す。 */
export function normalizeArgv(args: ArgsDef | undefined, rest: string[]): string[] {
  const flags = new Map<string, { key: string; boolean: boolean }>();
  const positionals: { name: string; required: boolean }[] = [];
  for (const [key, def] of Object.entries(args ?? {})) {
    if (def.type === 'positional') {
      positionals.push({ name: key, required: def.required === true });
    } else {
      const flag = isNegated(def) ? `--no-${kebab(key)}` : `--${kebab(key)}`;
      flags.set(flag, { key, boolean: def.type === 'boolean' });
    }
  }

  const seen = new Set<string>();
  const out: string[] = [];
  let i = 0;
  for (; i < rest.length; i++) {
    const tok = rest[i];
    if (tok === '--') {
      i++;
      break;
    }
    if (!tok.startsWith('-') || tok === '-') break;
    const opt = flags.get(tok);
    if (!opt) throw new UsageError(`未知の option: ${tok}`);
    if (seen.has(opt.key)) throw new UsageError(`option が 2 度ある: ${tok}`);
    seen.add(opt.key);
    if (opt.boolean) {
      out.push(tok);
    } else {
      if (i + 1 >= rest.length) throw new UsageError(`${tok} に値が無い`);
      out.push(`${tok}=${rest[++i]}`);
    }
  }
  const pos = rest.slice(i);
  if (pos.length > positionals.length) {
    throw new UsageError(`引数が多い: ${pos.slice(positionals.length).join(' ')}`);
  }
  positionals.forEach((p, idx) => {
    if (idx >= pos.length && p.required) throw new UsageError(`必須の引数が無い: <${p.name}>`);
  });
  return [...out, '--', ...pos];
}

/** 先頭の語から葉をたどる。未知の語・群で止まった時は UsageError。 */
export function findLeaf(main: Cmd, argv: string[], helpHint: string): { names: string[]; cmd: Cmd; rest: string[] } {
  let node = main;
  let i = 0;
  while (node.subCommands) {
    const word = argv[i];
    const next = word === undefined || word === 'help' ? undefined : node.subCommands[word];
    if (!next || !Object.prototype.hasOwnProperty.call(node.subCommands, word)) {
      throw new UsageError(`未知の副 command: ${argv.slice(0, 3).join(' ')}（${helpHint}）`);
    }
    node = next;
    i++;
  }
  return { names: argv.slice(0, i), cmd: node, rest: argv.slice(i) };
}

/** citty が読んだ args を、manifest の key の values にする（boolean は無ければ false）。 */
export function valuesOf(defs: ArgsDef | undefined, args: Record<string, unknown>): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(defs ?? {})) {
    const k = manifestKey(key, def);
    if (def.type === 'boolean') {
      values[k] = isNegated(def) ? args[key] === false : Boolean(args[key]);
    } else if (args[key] !== undefined) {
      values[k] = args[key];
    }
  }
  return values;
}
