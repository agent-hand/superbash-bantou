'use strict';
// .manifest/toolconfig.json（定義の正本）を読む。tools/publish/ から見て ../../.manifest/ にある。

const fs = require('node:fs');
const path = require('node:path');

const TOOL = 'publish';
const MANIFEST_PATH = path.resolve(__dirname, '..', '..', '..', '.manifest', 'toolconfig.json');

function loadManifest(file = MANIFEST_PATH) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** この tool（publish）の上の要素だけを、定義の形（入れ子のまま）で返す。 */
function toolCommands(manifest = loadManifest()) {
  return (manifest.commands || []).filter((c) => c.tool === TOOL);
}

/**
 * help の引数（並びの名前。語に分けた物）で要素を引く。群も引ける。
 * 先頭の語は、上の要素の name か spec.subcommand。spec.subcommand の無い上の要素（macbuild）は、先頭の語を省いてもよい。
 */
function findElement(commands, words) {
  const ws = words.flatMap((w) => String(w).split(/\s+/)).filter((w) => w !== '');
  if (ws.length === 0) return null;
  const descend = (node, rest) => {
    for (const w of rest) {
      node = (node.subcommands || []).find((c) => c.name === w);
      if (!node) return null;
    }
    return node;
  };
  for (const top of commands) {
    if (top.name === ws[0] || (top.spec && top.spec.subcommand === ws[0])) {
      const hit = descend(top, ws.slice(1));
      if (hit) return hit;
    }
  }
  for (const top of commands) {
    if (top.spec && top.spec.subcommand) continue;
    const hit = descend(top, ws);
    if (hit) return hit;
  }
  return null;
}

module.exports = { TOOL, MANIFEST_PATH, loadManifest, toolCommands, findElement };
