import { defineCommand } from 'citty';
import { valuesOf } from '../../../lib/argv.ts';
import { releaseCreate } from '../../../lib/gitea.ts';
import { runLeaf } from '../../../lib/runtime.ts';

const args = {
  url: { type: "string", description: "Gitea の URL（必須。http か https。API は <URL>/api/v1。認証情報を入れない）" },
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
  meta: { name: "create", description: "Gitea の REST API（/api/v1）を node の fetch から呼んで release を作り、asset を添付する（curl は使わない）。Gitea の URL は --url で受ける（必須）。token は実行時に git credential fill（protocol・host は --url から）で取り出し、出力に出さない。asset の添付が途中で失敗した時は、release は作成済みのまま、url・uploaded・failedAsset を返す。" },
  args,
  async run({ args: parsed }) {
    const values = valuesOf(args, parsed);
    await runLeaf((ctx) => releaseCreate(values, ctx));
  },
});
