import { defineCommand } from 'citty';
import { valuesOf } from '../../../lib/argv.ts';
import { releaseCreate } from '../../../lib/github.ts';
import { runLeaf } from '../../../lib/runtime.ts';

const args = {
  title: { type: "string", description: "release の題。省略時は tag" },
  notesFile: { type: "string", description: "release の本文の file の path。省略時は空" },
  target: { type: "string", description: "tag が無い時にその tag を作る branch か commit。省略時は repo の既定" },
  draft: { type: "boolean", description: "下書きの release にする" },
  prerelease: { type: "boolean", description: "prerelease にする" },
  assets: { type: "string", description: "添付する file の path を , で区切る（相対 path は cwd から。path に , と # は使えない）" },
  repo: { type: 'positional', required: true, description: "owner/name" },
  tag: { type: 'positional', required: true, description: "release の tag（- で始めない）" },
} as const;

export const create = defineCommand({
  meta: { name: "create", description: "host の gh の CLI（gh release create）で GitHub の release を作る（tag・題・本文の file・target・draft・prerelease・asset の添付）。認証は host の gh の認証をそのまま使う。" },
  args,
  async run({ args: parsed }) {
    const values = valuesOf(args, parsed);
    await runLeaf((ctx) => releaseCreate(values, ctx));
  },
});
