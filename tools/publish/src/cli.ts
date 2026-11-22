// publish の入口。module（module.ts）の run を呼び、結果を終了 code にするだけ。
import { run } from './module.ts';

process.exitCode = await run(process.argv.slice(2));
