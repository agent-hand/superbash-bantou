// macbuild の入口。main（定義）を読み込み、引数を渡して走らせる。結果は stdout に JSON で出す。
// citty の runMain は使わない: 引数のどこかに -h・--help があると usage を出して終了 0 で抜け、
// 使い方の誤りの終了 code が全部 1 になるため。runCommand で呼び、使い方の誤りは終了 2 にする。

import { runCommand } from 'citty';
import { findLeaf, normalizeArgv } from './lib/argv.ts';
import { EXIT } from './lib/errors.ts';
import { writeJson } from './lib/output.ts';
import { main } from './main.ts';

/** argv を citty に渡す形にする。使い方の誤りは UsageError。help は語を verbatim で渡す。 */
function toRawArgs(argv: string[]): string[] {
  const [first] = argv;
  if (first === undefined || first === '-h' || first === '--help') return ['help'];
  if (first === 'help') return argv;
  const { names, cmd, rest } = findLeaf(main as any, argv, 'macbuild help で一覧');
  return [...names, ...normalizeArgv((cmd as any).args, rest)];
}

async function run(argv: string[]): Promise<void> {
  await runCommand(main, { rawArgs: toRawArgs(argv) });
}

run(process.argv.slice(2)).catch((e: any) => {
  // exitCode を持つ error は自前の分類。citty の使い方の誤り（CLIError。export されていないので名前で見分ける）は 2。
  const code = typeof e?.exitCode === 'number' ? e.exitCode : e?.name === 'CLIError' ? EXIT.USAGE : EXIT.FAIL;
  const message = String(e?.message ?? e);
  process.stderr.write(`macbuild: ${message}\n`);
  if (code !== EXIT.USAGE) writeJson({ ok: false, error: message });
  process.exitCode = code;
});
