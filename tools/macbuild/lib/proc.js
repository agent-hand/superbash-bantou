'use strict';
// 子 process の起動。すべて引数の配列で、shell を通さない（shell の option は使わない）。

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function isExecutableFile(p) {
  try {
    if (!fs.statSync(p).isFile()) return false;
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** PATH から実行 file を探す（無ければ null）。 */
function which(cmd, env = process.env) {
  if (cmd.includes('/')) return isExecutableFile(cmd) ? path.resolve(cmd) : null;
  for (const dir of (env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const p = path.join(dir, cmd);
    if (isExecutableFile(p)) return p;
  }
  return null;
}

/** 終わるまで待ち、出力を文字列で返す。 */
function runSync(cmd, args, { cwd, env, timeout = 60_000 } = {}) {
  const r = spawnSync(cmd, args, {
    cwd,
    env,
    timeout,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    ok: !r.error && r.status === 0,
    status: r.status,
    signal: r.signal,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    error: r.error || null,
  };
}

// 行の途中で切らずに伏せるため、改行まで溜める。改行の無い長い出力はこの長さで書き出す。
const MAX_PENDING = 256 * 1024;

/**
 * 起動し、stdout と stderr を行ごとに redact に通して fd（log の file）へ書く。
 * tap(raw, name) には伏せる前の同じ区切りの文字列と stream の名前（stdout|stderr）を渡す
 * （成果物の path を拾うため。file には書かない）。
 * onSpawn(child) で child を渡す（signal を渡すため）。
 */
function runToLog(cmd, args, { cwd, env, fd, redact = (s) => s, tap = () => {}, onSpawn } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => {
      if (!done) {
        done = true;
        resolve(r);
      }
    };
    const child = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    if (onSpawn) onSpawn(child);
    const drained = [
      ['stdout', child.stdout],
      ['stderr', child.stderr],
    ].map(
      ([name, stream]) =>
        new Promise((res) => {
          let pending = '';
          stream.setEncoding('utf8');
          stream.on('data', (chunk) => {
            pending += chunk;
            const cut = pending.length > MAX_PENDING ? pending.length : pending.lastIndexOf('\n') + 1;
            if (cut > 0) {
              const raw = pending.slice(0, cut);
              tap(raw, name);
              fs.writeSync(fd, redact(raw));
              pending = pending.slice(cut);
            }
          });
          stream.on('end', () => {
            if (pending) {
              tap(pending, name);
              fs.writeSync(fd, redact(pending));
            }
            res();
          });
          stream.on('error', res);
        }),
    );
    child.on('error', (error) => finish({ status: null, signal: null, error }));
    child.on('close', (status, signal) => {
      Promise.all(drained).then(() => finish({ status, signal, error: null }));
    });
  });
}

function firstLine(text) {
  const line = String(text || '')
    .split('\n')
    .map((s) => s.trim())
    .find((s) => s !== '');
  return line ? line.slice(0, 300) : null;
}

module.exports = { which, runSync, runToLog, firstLine, isExecutableFile };
