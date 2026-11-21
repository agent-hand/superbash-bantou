'use strict';
// build の排他（同時 1 本）。lock の dir の下に lock を 1 つ取る。
//
// - 取り方: 一時の dir に owner.json（pid・token・開始時刻・project）を書き、lock の名前へ rename する。
//   rename は不可分で、既に lock（中身のある dir）があれば ENOTEMPTY/EEXIST で失敗する。
//   owner.json の無い lock は生じない。
// - 取れない時: 待たない。持ち主を返し、呼んだ側が終了 code 3 で終わる。
// - 持ち主の process が居ない lock（SIGKILL・時間切れで止められた等）は古い lock とみなし、1 度だけ外して取り直す。

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const LOCK_NAME = 'macbuild-tauri.lock';
const OWNER_FILE = 'owner.json';

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function readOwner(lockPath) {
  try {
    const owner = JSON.parse(fs.readFileSync(path.join(lockPath, OWNER_FILE), 'utf8'));
    return owner && typeof owner === 'object' ? owner : null;
  } catch {
    return null;
  }
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM'; // 居るが別の user
  }
}

function exists(p) {
  try {
    fs.lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

/** lock の今の状態（info 用）。 */
function inspect(lockDir) {
  const lockPath = path.join(lockDir, LOCK_NAME);
  if (!exists(lockPath)) return { path: lockPath, held: false };
  const owner = readOwner(lockPath);
  const alive = owner ? pidAlive(owner.pid) : false;
  return {
    path: lockPath,
    held: true,
    pid: owner ? owner.pid : null,
    startedAt: owner ? owner.startedAt : null,
    project: owner ? owner.project : null,
    stale: !alive,
  };
}

function tempName(lockDir, tag) {
  return path.join(lockDir, `.${LOCK_NAME}.${tag}.${process.pid}.${crypto.randomBytes(6).toString('hex')}`);
}

// 古い lock を外す。見た時の持ち主（token）と違う lock を動かしてしまったら戻す。
function breakStale(lockPath, seen) {
  const moved = tempName(path.dirname(lockPath), 'stale');
  try {
    fs.renameSync(lockPath, moved);
  } catch (e) {
    if (e.code === 'ENOENT') return; // 先に誰かが外した
    throw e;
  }
  const now = readOwner(moved);
  if (seen && now && now.token !== seen.token) {
    try {
      fs.renameSync(moved, lockPath);
      return;
    } catch {
      // 戻せない（既に別の lock がある）。動かした物は消す。
    }
  }
  rmrf(moved);
}

/**
 * lock を取る。
 * @returns {{ acquired: true, path, owner, release: () => void } | { acquired: false, path, owner }}
 */
function acquire(lockDir, meta = {}) {
  fs.mkdirSync(lockDir, { recursive: true });
  const lockPath = path.join(lockDir, LOCK_NAME);
  const owner = {
    pid: process.pid,
    token: crypto.randomBytes(12).toString('hex'),
    startedAt: new Date().toISOString(),
    ...meta,
  };

  let brokeStale = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    const tmp = tempName(lockDir, 'new');
    fs.mkdirSync(tmp);
    fs.writeFileSync(path.join(tmp, OWNER_FILE), JSON.stringify(owner) + '\n');
    try {
      fs.renameSync(tmp, lockPath);
      let released = false;
      return {
        acquired: true,
        path: lockPath,
        owner,
        release() {
          if (released) return;
          released = true;
          release(lockPath, owner.token);
        },
      };
    } catch (e) {
      rmrf(tmp);
      if (e.code !== 'ENOTEMPTY' && e.code !== 'EEXIST') throw e;
    }

    const current = readOwner(lockPath);
    if (!current && !exists(lockPath)) continue; // 間で外された。取り直す
    const stale = !current || !pidAlive(current.pid);
    if (stale && !brokeStale) {
      brokeStale = true;
      breakStale(lockPath, current);
      continue;
    }
    return { acquired: false, path: lockPath, owner: current };
  }
  return { acquired: false, path: lockPath, owner: readOwner(lockPath) };
}

/** 自分の token の lock だけを外す。 */
function release(lockPath, token) {
  const owner = readOwner(lockPath);
  if (!owner || owner.token !== token) return false;
  const moved = tempName(path.dirname(lockPath), 'release');
  try {
    fs.renameSync(lockPath, moved);
  } catch {
    return false;
  }
  rmrf(moved);
  return true;
}

/** 出力に載せる持ち主（token は出さない）。 */
function publicOwner(owner) {
  if (!owner) return null;
  return { pid: owner.pid, startedAt: owner.startedAt, project: owner.project || null };
}

module.exports = { LOCK_NAME, acquire, release, inspect, pidAlive, publicOwner };
