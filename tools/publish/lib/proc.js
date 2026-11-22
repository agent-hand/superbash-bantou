'use strict';
// 子 process の起動。すべて引数の配列で、shell を通さない（shell の option は使わない）。

const { spawn } = require('node:child_process');
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
  for (const dir of (env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const p = path.join(dir, cmd);
    if (isExecutableFile(p)) return p;
  }
  return null;
}

const MAX_OUTPUT = 4 * 1024 * 1024;

/**
 * 起動して終わるまで待つ。stdin は input（無ければ閉じる）。出力は MAX_OUTPUT まで溜める。
 * 返り値: { status, signal, stdout, stderr, error, timedOut }
 */
function run(cmd, args, { cwd, env, input, timeout = 9 * 60_000 } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { cwd, env, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
    } catch (error) {
      resolve({ status: null, signal: null, stdout: '', stderr: '', error, timedOut: false });
      return;
    }
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const take = (cur, chunk) => (cur.length >= MAX_OUTPUT ? cur : (cur + chunk).slice(0, MAX_OUTPUT));
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (c) => (stdout = take(stdout, c)));
    child.stderr.on('data', (c) => (stderr = take(stderr, c)));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeout);
    if (input !== undefined) {
      child.stdin.on('error', () => {});
      child.stdin.end(input);
    }
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ status: null, signal: null, stdout, stderr, error, timedOut });
    });
    child.on('close', (status, signal) => {
      clearTimeout(timer);
      resolve({ status, signal, stdout, stderr, error: null, timedOut });
    });
  });
}

function firstLines(text, n = 5) {
  return String(text || '')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .slice(0, n)
    .join('\n')
    .slice(0, 1000);
}

module.exports = { which, run, firstLines };
