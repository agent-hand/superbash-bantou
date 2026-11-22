'use strict';
// 排他の test の子 process: lock を取りに行き、結果を 1 行の JSON で出す。
// 取れた時は stdin が閉じるまで持ち、閉じたら外して終わる（待ちは stdin の end の event だけ）。

const lock = require('../../tools/macbuild/src/lib/lock.ts');

const [lockDir] = process.argv.slice(2);
const r = lock.acquire(lockDir, { project: `child-${process.pid}` });
process.stdout.write(JSON.stringify({ pid: process.pid, acquired: r.acquired }) + '\n');
if (r.acquired) {
  process.stdin.on('end', () => {
    r.release();
  });
  process.stdin.resume();
}
