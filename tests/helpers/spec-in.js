'use strict';
// superbash（0.2.0）の wrapper が入れ子の manifest から argv を組む規則の写し（test 用）。
// 並びの名前（空白で区切る）で葉を引き、
// argv = [上の要素の spec.subcommand（あれば）] + [上の要素より下のサブコマンドの名前]
//        + options（定義の順。boolean は true の時だけ flag、string/number は flag と値の 2 引数）
//        + [`--`（positional を渡す時）] + positionals（定義の順。省略できるのは optional だけ）
// 呼べるのは葉だけ。args は呼ぶ葉の spec.in だけで読む。

/** tool の葉を並びの名前つきで全部返す: { name, top, node, head }。head は argv の頭。 */
function leaves(manifest, tool) {
  const out = [];
  const walk = (node, names, head, top) => {
    const subs = node.subcommands || [];
    if (subs.length === 0) {
      out.push({ name: names.join(' '), top, node, head });
      return;
    }
    for (const c of subs) walk(c, [...names, c.name], [...head, c.name], top);
  };
  for (const top of manifest.commands.filter((c) => c.tool === tool)) {
    walk(top, [top.name], top.spec && top.spec.subcommand ? [top.spec.subcommand] : [], top);
  }
  return out;
}

/** 並びの名前で葉を引く（前後の空白は捨て、続いた空白は 1 つの区切り）。群・未知の名前は誤り。 */
function findLeaf(manifest, tool, name) {
  const words = String(name).split(/\s+/).filter((w) => w !== '');
  const hit = leaves(manifest, tool).find((l) => l.name === words.join(' '));
  if (!hit) throw new Error(`葉が無い: ${name}`);
  return hit;
}

function buildArgv(leaf, args) {
  const spec = leaf.node.spec || {};
  const input = spec.in || {};
  const options = input.options || {};
  const positionals = input.positionals || [];
  const known = new Set([...Object.keys(options), ...positionals.map((p) => p.name)]);
  for (const key of Object.keys(args)) {
    if (!known.has(key)) throw new Error(`未定義の引数: ${key}`);
  }
  const argv = [...leaf.head];
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
  let separated = false;
  for (const p of positionals) {
    const v = args[p.name];
    if (v === undefined || v === null) {
      if (!p.optional) throw new Error(`必須の引数が無い: ${p.name}`);
      skipped = skipped || p.name;
      continue;
    }
    if (skipped) throw new Error(`${skipped} を省略して後ろの ${p.name} は渡せない`);
    if (!separated) {
      argv.push('--');
      separated = true;
    }
    argv.push(String(v));
  }
  return argv;
}

module.exports = { leaves, findLeaf, buildArgv };
