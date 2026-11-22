// macbuild の module（dist/main.mjs の元）。読み込んでも走らない。`main`（citty の command）と
// `run(rawArgs)`（runCommand で呼び、終了 code を返す）を出す。入口（cli.ts）も振り分けの側も、これを使う。
// citty の runMain は使わない: 引数のどこかに -h・--help があると usage を出して終了 0 で抜け、
// 使い方の誤りの終了 code が全部 1 になるため。runCommand で呼び、使い方の誤りは終了 2 にする。

import { runCommand } from 'citty';
import { findLeaf, normalizeArgv } from './lib/argv.ts';
import { EXIT } from './lib/errors.ts';
import { writeJson } from './lib/output.ts';
import { main } from './main.ts';

export { main };

/** argv を citty に渡す形にする。使い方の誤りは UsageError。help は語を verbatim で渡す。 */
function toRawArgs(argv: string[]): string[] {
  const [first] = argv;
  if (first === undefined || first === '-h' || first === '--help') return ['help'];
  if (first === 'help') return argv;
  const { names, cmd, rest } = findLeaf(main as any, argv, 'macbuild help で一覧');
  return [...names, ...normalizeArgv((cmd as any).args, rest)];
}

/** rawArgs で main を走らせ、終了 code を返す（0 = 成功、2 = 使い方の誤り、それ以外の誤り = 1 など）。 */
export async function run(rawArgs: string[]): Promise<number> {
  // command は結果の終了 code を process.exitCode に置く。呼んだ側の process の値を汚さないよう、
  // 走らせる間だけ借りて、読んだら元に戻す（振り分けの側が同じ process で走らせる時のため）。
  const before = process.exitCode;
  process.exitCode = undefined;
  try {
    await runCommand(main, { rawArgs: toRawArgs(rawArgs) });
    return Number(process.exitCode ?? EXIT.OK);
  } catch (e: any) {
    // exitCode を持つ error は自前の分類。citty の使い方の誤り（CLIError。export されていないので名前で見分ける）は 2。
    const code = typeof e?.exitCode === 'number' ? e.exitCode : e?.name === 'CLIError' ? EXIT.USAGE : EXIT.FAIL;
    const message = String(e?.message ?? e);
    process.stderr.write(`macbuild: ${message}\n`);
    if (code !== EXIT.USAGE) writeJson({ ok: false, error: message });
    return code;
  } finally {
    process.exitCode = before;
  }
}
