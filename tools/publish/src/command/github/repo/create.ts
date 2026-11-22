import { defineCommand } from 'citty';
import { valuesOf } from '../../../lib/argv.ts';
import { repoCreate } from '../../../lib/github.ts';
import { runLeaf } from '../../../lib/runtime.ts';

const args = {
  visibility: { type: "string", description: "公開範囲（public・private・internal）。省略時は private" },
  description: { type: "string", description: "repo の説明" },
  repo: { type: 'positional', required: true, description: "owner/name" },
} as const;

export const create = defineCommand({
  meta: { name: "create", description: "host の gh の CLI（gh repo create）で GitHub の repo を作る。認証は host の gh の認証をそのまま使う。公開範囲の既定は private。" },
  args,
  async run({ args: parsed }) {
    const values = valuesOf(args, parsed);
    await runLeaf((ctx) => repoCreate(values, ctx));
  },
});
