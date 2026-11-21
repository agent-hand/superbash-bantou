'use strict';
// superbash（0.1.0）の wrapper が spec.in から argv を組む規則の写し（test 用）。
// argv = [subcommand] + options（定義の順。boolean は true の時だけ flag、string/number は flag と値の 2 引数）
//        + positionals（定義の順。省略できるのは optional だけ。`--` は入れない）

function buildArgv(spec, args) {
  const input = spec.in || {};
  const options = input.options || {};
  const positionals = input.positionals || [];
  const known = new Set([...Object.keys(options), ...positionals.map((p) => p.name)]);
  for (const key of Object.keys(args)) {
    if (!known.has(key)) throw new Error(`未定義の引数: ${key}`);
  }
  const argv = [];
  if (spec.subcommand) argv.push(spec.subcommand);
  for (const [name, def] of Object.entries(options)) {
    const v = args[name];
    if (v === undefined || v === null) continue;
    if (def.type === 'boolean') {
      if (v) argv.push(def.flag);
    } else {
      argv.push(def.flag, String(v));
    }
  }
  let skipped = null;
  for (const p of positionals) {
    const v = args[p.name];
    if (v === undefined || v === null) {
      if (!p.optional) throw new Error(`必須の引数が無い: ${p.name}`);
      skipped = skipped || p.name;
      continue;
    }
    if (skipped) throw new Error(`${skipped} を省略して後ろの ${p.name} は渡せない`);
    argv.push(String(v));
  }
  return argv;
}

module.exports = { buildArgv };
