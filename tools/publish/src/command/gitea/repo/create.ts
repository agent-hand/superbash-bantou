import { defineCommand } from 'citty';
import { valuesOf } from '../../../lib/argv.ts';
import { repoCreate } from '../../../lib/gitea.ts';
import { runLeaf } from '../../../lib/runtime.ts';

const args = {
  url: { type: "string", description: "Gitea の URL（必須。http か https。API は <URL>/api/v1。認証情報を入れない）" },
  visibility: { type: "string", description: "公開範囲（public・private）。省略時は private" },
  description: { type: "string", description: "repo の説明" },
  repo: { type: 'positional', required: true, description: "owner/name" },
} as const;

export const create = defineCommand({
  meta: { name: "create", description: "Gitea の REST API（/api/v1）を node の fetch から呼んで repo を作る（curl は使わない）。Gitea の URL は --url で受ける（必須）。token は実行時に git credential fill（protocol・host は --url から）で取り出し、出力に出さない。token の持ち主（GET /user の login）が owner と同じなら user の repo、違えば organization の repo。公開範囲の既定は private。" },
  args,
  async run({ args: parsed }) {
    const values = valuesOf(args, parsed);
    await runLeaf((ctx) => repoCreate(values, ctx));
  },
});
