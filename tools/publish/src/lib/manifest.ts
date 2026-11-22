// .manifest/toolconfig.json（定義の正本）を読む。
// toolset でも superbash が生成した package でも、tools/publish/ の 2 つ上（root）の .manifest/ にある。
// build した dist/cli.mjs（tools/publish/dist/）からも、source（tools/publish/src/lib/）からも、上へたどって探す。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOOL = 'publish';

function findManifest(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = path.join(dir, '.manifest', 'toolconfig.json');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('.manifest/toolconfig.json が見つからない');
    dir = parent;
  }
}

export function loadManifest(file: string = findManifest()): any {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** この tool（publish）の上の要素だけを、定義の形（入れ子のまま）で返す。 */
export function toolCommands(manifest: any = loadManifest()): any[] {
  return (manifest.commands || []).filter((c: any) => c.tool === TOOL);
}

/**
 * help の引数（並びの名前。語に分けた物）で要素を引く。群も引ける。
 * 先頭の語は、上の要素の name か spec.subcommand。spec.subcommand の無い上の要素（macbuild）は、先頭の語を省いてもよい。
 */
export function findElement(commands: any[], words: string[]): any | null {
  const ws = words.flatMap((w) => String(w).split(/\s+/)).filter((w) => w !== '');
  if (ws.length === 0) return null;
  const descend = (node: any, rest: string[]) => {
    for (const w of rest) {
      node = (node.subcommands || []).find((c: any) => c.name === w);
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
