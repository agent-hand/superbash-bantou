'use strict';
// 排他の振る舞い: 同時 1 本、取れない時は待たずに終わる（終了 code 3）、居ない持ち主の lock は外して取る。

const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const test = require('node:test');

const lock = require('../tools/macbuild/lib/lock');
const { EXIT } = require('../tools/macbuild/lib/errors');
const { makeTmp, rmTmp, cleanEnv, runCli, makeFakeProject, readRecord } = require('./helpers/env');

async function withTmp(fn) {
  const dir = makeTmp();
  try {
    return await fn(dir);
  } finally {
    rmTmp(dir);
  }
}

function deadPid() {
  // 終わった子の pid（もう居ない）。
  const r = spawnSync(process.execPath, ['-e', '0']);
  return r.pid;
}

test('取る・持っている間は取れない・外すと取れる', () =>
  withTmp((dir) => {
    const a = lock.acquire(dir, { project: '/p/a' });
    assert.equal(a.acquired, true);
    assert.equal(lock.inspect(dir).held, true);
    assert.equal(lock.inspect(dir).stale, false);

    const b = lock.acquire(dir, { project: '/p/b' });
    assert.equal(b.acquired, false);
    assert.deepEqual(lock.publicOwner(b.owner), { pid: process.pid, startedAt: a.owner.startedAt, project: '/p/a' });
    assert.equal('token' in lock.publicOwner(b.owner), false, 'token は出さない');

    assert.equal(lock.release(a.path, 'not-my-token'), false, '他人の token では外さない');
    assert.equal(lock.inspect(dir).held, true);
    a.release();
    a.release(); // 2 度目は何もしない
    assert.equal(lock.inspect(dir).held, false);

    const c = lock.acquire(dir);
    assert.equal(c.acquired, true);
    c.release();
    assert.deepEqual(fs.readdirSync(dir), [], '一時の dir を残さない');
  }));

test('持ち主の process が居ない lock は外して取り直す', () =>
  withTmp((dir) => {
    const lockPath = path.join(dir, lock.LOCK_NAME);
    fs.mkdirSync(lockPath);
    fs.writeFileSync(
      path.join(lockPath, 'owner.json'),
      JSON.stringify({ pid: deadPid(), token: 'old', startedAt: '2000-01-01T00:00:00.000Z' }),
    );
    assert.equal(lock.inspect(dir).stale, true);
    const r = lock.acquire(dir);
    assert.equal(r.acquired, true);
    assert.equal(lock.inspect(dir).pid, process.pid);
    r.release();
  }));

test('owner.json の無い lock（壊れた物）も古い lock として外す', () =>
  withTmp((dir) => {
    const lockPath = path.join(dir, lock.LOCK_NAME);
    fs.mkdirSync(lockPath);
    fs.writeFileSync(path.join(lockPath, 'junk'), 'x');
    const r = lock.acquire(dir);
    assert.equal(r.acquired, true);
    r.release();
  }));

test('同時に取りに行く 6 本の process のうち、取れるのは 1 本だけ', () =>
  withTmp(async (dir) => {
    const child = path.join(__dirname, 'helpers', 'lock-child.js');
    const procs = Array.from({ length: 6 }, () =>
      spawn(process.execPath, [child, dir], { stdio: ['pipe', 'pipe', 'inherit'] }),
    );
    // 取れなかった子はすぐ終わるので、終わりの event は起動の直後から受ける。
    const closed = procs.map((p) => new Promise((resolve) => p.once('close', resolve)));
    // 各 process の 1 行目（結果）を待つ（event だけで待つ）。
    const results = await Promise.all(
      procs.map(
        (p) =>
          new Promise((resolve, reject) => {
            const rl = readline.createInterface({ input: p.stdout });
            rl.once('line', (line) => {
              rl.close();
              resolve(JSON.parse(line));
            });
            p.once('error', reject);
          }),
      ),
    );
    const winners = results.filter((r) => r.acquired);
    assert.equal(winners.length, 1, JSON.stringify(results));
    assert.equal(lock.inspect(dir).pid, winners[0].pid);

    // stdin を閉じて終わらせる（取れた 1 本はここで外す）。
    for (const p of procs) p.stdin.end();
    await Promise.all(closed);
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
