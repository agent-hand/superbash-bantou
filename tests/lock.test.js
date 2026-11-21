'use strict';
// 排他の振る舞い: 同時 1 本、取れない時は待たずに終わる（終了 code 3）、
// 持ち主が SIGKILL で終わっても kernel が lock を外す（古い lock を外す処理が無い）。

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const test = require('node:test');

const lock = require('../tools/macbuild/lib/lock');
const { EXIT } = require('../tools/macbuild/lib/errors');
const { makeTmp, rmTmp, cleanEnv, runCli, makeFakeProject, readRecord } = require('./helpers/env');

const CHILD = path.join(__dirname, 'helpers', 'lock-child.js');

async function withTmp(fn) {
  const dir = makeTmp();
  try {
    return await fn(dir);
  } finally {
    rmTmp(dir);
  }
}

/** lock-child を起動し、1 行目（結果）と終わりを event で受ける。 */
function startChild(dir) {
  const p = spawn(process.execPath, [CHILD, dir], { stdio: ['pipe', 'pipe', 'inherit'] });
  const closed = new Promise((resolve) => p.once('close', (code, signal) => resolve({ code, signal })));
  const first = new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: p.stdout });
    rl.once('line', (line) => {
      rl.close();
      resolve(JSON.parse(line));
    });
    p.once('error', reject);
  });
  return { p, first, closed };
}

test('取る・持っている間は取れない（同じ process でも）・外すと取れる', () =>
  withTmp((dir) => {
    const a = lock.acquire(dir, { project: '/p/a' });
    assert.equal(a.acquired, true);
    assert.deepEqual(lock.inspect(dir), {
      path: path.join(dir, lock.LOCK_NAME),
      held: true,
      pid: process.pid,
      startedAt: a.owner.startedAt,
      project: '/p/a',
    });

    const b = lock.acquire(dir, { project: '/p/b' });
    assert.equal(b.acquired, false);
    assert.deepEqual(lock.publicOwner(b.owner), { pid: process.pid, startedAt: a.owner.startedAt, project: '/p/a' });

    a.release();
    a.release(); // 2 度目は何もしない
    assert.equal(lock.inspect(dir).held, false);
    assert.equal(fs.readFileSync(a.path, 'utf8'), '', '外す時に持ち主の情報を消す');

    const c = lock.acquire(dir);
    assert.equal(c.acquired, true);
    c.release();
    assert.deepEqual(fs.readdirSync(dir), [lock.LOCK_NAME], 'lock の file 1 つだけ（消さない・一時の物を残さない）');
  }));

test('持ち主が SIGKILL で終わると、kernel が lock を外す（中身が残っても取れる）', () =>
  withTmp(async (dir) => {
    const holder = startChild(dir);
    assert.equal((await holder.first).acquired, true);
    assert.equal(lock.acquire(dir).acquired, false, '持っている間は取れない');
    holder.p.kill('SIGKILL');
    assert.equal((await holder.closed).signal, 'SIGKILL');

    assert.notEqual(fs.readFileSync(path.join(dir, lock.LOCK_NAME), 'utf8'), '', '中身は残っている');
    assert.equal(lock.inspect(dir).held, false, '中身が残っていても持ち主は居ない');
    const r = lock.acquire(dir, { project: '/p/next' });
    assert.equal(r.acquired, true);
    assert.equal(lock.inspect(dir).pid, process.pid);
    r.release();
  }));

test('中身の壊れた lock の file も、lock が無ければ取れる', () =>
  withTmp((dir) => {
    fs.writeFileSync(path.join(dir, lock.LOCK_NAME), '{ broken');
    assert.equal(lock.inspect(dir).held, false);
    const r = lock.acquire(dir);
    assert.equal(r.acquired, true);
    r.release();
  }));

test('同時に取りに行く 6 本の process のうち、取れるのは 1 本だけ', () =>
  withTmp(async (dir) => {
    const children = Array.from({ length: 6 }, () => startChild(dir));
    const results = await Promise.all(children.map((c) => c.first));
    const winners = results.filter((r) => r.acquired);
    assert.equal(winners.length, 1, JSON.stringify(results));
    assert.equal(lock.inspect(dir).pid, winners[0].pid);

    // stdin を閉じて終わらせる（取れた 1 本はここで外す）。
    for (const c of children) c.p.stdin.end();
    await Promise.all(children.map((c) => c.closed));
    assert.equal(lock.inspect(dir).held, false);
  }));

test('macbuild tauri は lock が取れない時に待たずに終わる（終了 code 3、build は走らない）', () =>
  withTmp((home) => {
    const project = makeFakeProject(path.join(home, 'proj'));
    const lockDir = path.join(home, 'lock');
    const env = cleanEnv(home, { MACBUILD_LOCK_DIR: lockDir, MACBUILD_LOG_DIR: path.join(home, 'logs') });
    const held = lock.acquire(lockDir, { project: '/p/other' });
    try {
      const started = Date.now();
      const r = runCli(['tauri', project], { env });
      assert.equal(r.status, EXIT.BUSY, r.stderr);
      assert.ok(Date.now() - started < 30_000, '待たない');
      assert.equal(r.json.ok, false);
      assert.equal(r.json.error, 'lock-busy');
      assert.deepEqual(r.json.lock.owner, { pid: process.pid, startedAt: held.owner.startedAt, project: '/p/other' });
      assert.match(r.stderr, /lock を持っている/);
      assert.equal(readRecord(project), null, 'Tauri の CLI は起動しない');
    } finally {
      held.release();
    }
  }));

test('macbuild tauri は終わった後（成功でも失敗でも）lock を外す', () =>
  withTmp((home) => {
    const project = makeFakeProject(path.join(home, 'proj'));
    const lockDir = path.join(home, 'lock');
    const env = cleanEnv(home, { MACBUILD_LOCK_DIR: lockDir, MACBUILD_LOG_DIR: path.join(home, 'logs') });
    fs.writeFileSync(path.join(project, 'fail'), '');
    const failed = runCli(['tauri', project], { env });
    assert.equal(failed.status, EXIT.FAIL, failed.stderr);
    assert.equal(lock.inspect(lockDir).held, false);

    fs.rmSync(path.join(project, 'fail'));
    const ok = runCli(['tauri', '--target-dir', path.join(home, 'target'), project], { env });
    assert.equal(ok.status, EXIT.OK, ok.stderr);
    assert.equal(lock.inspect(lockDir).held, false);
  }));
