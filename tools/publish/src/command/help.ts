import { defineCommand } from 'citty';
import { runHelp } from '../lib/help.ts';

// 必須の副 command。bin の直後だけ（`publish help [<並び>]`）。語は rawArgs のまま読む（`-` で始まる語も誤りとして扱う）。
export const help = defineCommand({
  meta: { name: 'help', description: '定義（.manifest/toolconfig.json）の内容を出す。引数は並びの名前（省略すると全体）' },
  args: {
    words: { type: 'positional', required: false, description: '並びの名前' },
  },
  run({ rawArgs }) {
    process.exitCode = runHelp(rawArgs);
  },
});
