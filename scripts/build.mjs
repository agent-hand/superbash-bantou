// 各 tool の src/cli.ts（入口）を dist/cli.mjs に、src/module.ts（main と run。読み込んでも走らない）を dist/main.mjs に、
// それぞれ citty も中に入れた 1 file にまとめる（node 18 で動く形）。
// 実行の権限と shebang を付ける。dist/ は repo に commit し、CI で「build し直して差分が無い」を確かめる。

import { chmodSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tools = ['macbuild', 'publish'];

const outputs = [
  { src: 'cli.ts', out: 'cli.mjs', shebang: true },
  { src: 'module.ts', out: 'main.mjs', shebang: false },
];

for (const tool of tools) {
  for (const { src, out, shebang } of outputs) {
    const outfile = path.join(root, 'tools', tool, 'dist', out);
    await build({
      entryPoints: [path.join(root, 'tools', tool, 'src', src)],
      outfile,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node18',
      ...(shebang ? { banner: { js: '#!/usr/bin/env node' } } : {}),
      logLevel: 'warning',
    });
    if (shebang) chmodSync(outfile, 0o755);
    console.log(`built tools/${tool}/dist/${out}`);
  }
}
