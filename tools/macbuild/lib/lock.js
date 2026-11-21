'use strict';
// build の排他（同時 1 本）。lock の dir の下の lock の file に、kernel の排他 lock を取る
// （open(2) の O_EXLOCK。flock と同じ lock で、開いた fd に付く）。
//
// - 取れない時: 待たない（O_NONBLOCK で EAGAIN）。file に書かれた持ち主を返し、呼んだ側が終了 code 3 で終わる。
// - 持ち主の process が終わると、SIGKILL（superbash の時間切れ）でも kernel が lock を外す。
//   古い lock を見分けて外す処理が無いので、外す時の競合も、pid の使い回しで古い lock が生きて見える事も起きない。
// - lock の file は消さない（消すと、消された inode と新しい file に別々の process が lock を取れてしまう）。
//   外す時は中身を空にしてから閉じる。
// - file の中身（pid・開始時刻・project）は表示のためだけで、排他の判定には使わない。

const fs = require('node:fs');
const path = require('node:path');

const LOCK_NAME = 'macbuild-tauri.lock';

// macOS の <fcntl.h> の値（Node は定数を出していない）。
const O_SHLOCK = fs.constants.O_SHLOCK || 0x10;
const O_EXLOCK = fs.constants.O_EXLOCK || 0x20;

function openLocked(lockPath, lockFlag, create) {
  const c = fs.constants;
  return fs.openSync(lockPath, c.O_RDWR | c.O_NONBLOCK | lockFlag | (create ? c.O_CREAT : 0), 0o644);
}

function isBusy(e) {
  return e.code === 'EAGAIN' || e.code === 'EWOULDBLOCK';
}

function readOwner(lockPath) {
  try {
    const text = fs.readFileSync(lockPath, 'utf8').trim();
    const owner = text ? JSON.parse(text) : null;
    return owner && typeof owner === 'object' ? owner : null;
  } catch {
    return null;
  }
}

/** 出力に載せる持ち主。 */
function publicOwner(owner) {
  if (!owner) return null;
  return { pid: owner.pid ?? null, startedAt: owner.startedAt ?? null, project: owner.project ?? null };
}

/**
 * lock を取る（待たない）。
 * @returns {{ acquired: true, path, owner, release: () => void } | { acquired: false, path, owner }}
 */
function acquire(lockDir, meta = {}) {
  fs.mkdirSync(lockDir, { recursive: true });
  const lockPath = path.join(lockDir, LOCK_NAME);
  let fd;
  try {
    fd = openLocked(lockPath, O_EXLOCK, true);
  } catch (e) {
    if (isBusy(e)) return { acquired: false, path: lockPath, owner: readOwner(lockPath) };
    throw e;
  }
  const owner = { pid: process.pid, startedAt: new Date().toISOString(), ...meta };
  fs.ftruncateSync(fd, 0);
  fs.writeSync(fd, JSON.stringify(owner) + '\n', 0);
  let released = false;
  return {
    acquired: true,
    path: lockPath,
    owner,
    release() {
      if (released) return;
      released = true;
      try {
        fs.ftruncateSync(fd, 0);
      } finally {
        fs.closeSync(fd); // ここで kernel の lock が外れる
      }
    },
  };
}

/**
 * lock の今の状態（info 用）。中身が空なら持ち主は居ない。中身がある時だけ、共有の lock を試して確かめる
 * （SIGKILL で終わった持ち主は中身を残すが、lock は kernel が外している）。
 */
function inspect(lockDir) {
  const lockPath = path.join(lockDir, LOCK_NAME);
  const owner = readOwner(lockPath);
  if (!owner) return { path: lockPath, held: false };
  let fd;
  try {
    fd = openLocked(lockPath, O_SHLOCK, false);
  } catch (e) {
    if (isBusy(e)) return { path: lockPath, held: true, ...publicOwner(owner) };
    if (e.code === 'ENOENT') return { path: lockPath, held: false };
    throw e;
  }
  fs.closeSync(fd);
  return { path: lockPath, held: false };
}

module.exports = { LOCK_NAME, acquire, inspect, publicOwner, readOwner };
