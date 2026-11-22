// 各 tool の src/cli.ts を、citty も中に入れた dist/cli.mjs の 1 file にまとめる（node 18 で動く形）。
// 実行の権限と shebang を付ける。dist/ は repo に commit し、CI で「build し直して差分が無い」を確かめる。

import { chmodSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tools = ['macbuild', 'publish'];

for (const tool of tools) {
  const outfile = path.join(root, 'tools', tool, 'dist', 'cli.mjs');
  await build({
    entryPoints: [path.join(root, 'tools', tool, 'src', 'cli.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    banner: { js: '#!/usr/bin/env node' },
    logLevel: 'warning',
  });
  chmodSync(outfile, 0o755);
  console.log(`built tools/${tool}/dist/cli.mjs`);
}
