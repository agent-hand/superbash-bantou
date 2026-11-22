import { defineCommand } from 'citty';
import { valuesOf } from '../../lib/argv.ts';
import { publishPackage } from '../../lib/npm.ts';
import { runLeaf } from '../../lib/runtime.ts';

const args = {
  registry: { type: "string", description: "publish する registry の URL（http か https。認証情報を入れない）。省略時は npm 自身の設定（host の npm の設定）のまま" },
  tag: { type: "string", description: "dist-tag（省略時は npm の既定の latest）" },
  access: { type: "string", description: "public か restricted（scope の package の公開範囲。省略時は npm の既定）" },
  dryRun: { type: "boolean", description: "実際には出さず、npm の dry-run で確かめる" },
  target: { type: 'positional', required: true, description: "publish する tarball（.tgz・.tar.gz）か package の dir。相対 path は起動した cwd から" },
} as const;

export const publish = defineCommand({
  meta: { name: "publish", description: "指定の tarball か dir を npm publish で registry に publish する。registry は --registry で受け、省略時は npm 自身の設定のまま（wrapper は宛先を持たない）。認証は host の npm login（host の npm の設定）をそのまま使い、wrapper は token を読まない。--registry を付けた時、package の publishConfig.registry がそれと違えば publish しない。publish（dry-run 含む）の前に、--registry を付けた時、または scope も publishConfig.registry も無い package の時は、その registry（--registry か npm の既定の registry）に短い上限（10 秒・retry 無し）で届くか npm ping で確かめ、届かなければ publish せずすぐ ok:false（終了 code 1）を返す。--registry が無く、package が scope 付きか publishConfig.registry を持つ時は、npm ping が別の registry を確かめて誤判定するので ping を省き、publish 自身に任せる（出力の pingSkipped が true）（launchd 常駐の process は macOS のローカルネットワーク制限で届かない事がある）。dry-run の成功は registry に届く事と認証を保証しない（この確かめは届く事だけを手当てする）。実際に公開されるので、dry-run で確かめてから使う。長くなりうるので run_in_background で呼ぶ。Claude Code の 1 回の呼び出しの上限（既定 60 秒、mcp 設定の timeout で延ばす）で打ち切られても command は走り続けるので、本番 publish を呼び直す前に registry に出たかを確かめる。" },
  args,
  async run({ args: parsed }) {
    const values = valuesOf(args, parsed);
    await runLeaf((ctx) => publishPackage(values, { ...ctx, label: "npm publish" }));
  },
});
