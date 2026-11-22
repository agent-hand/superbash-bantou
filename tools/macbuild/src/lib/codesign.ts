// codesign の署名・確かめ・署名の種類の読み取り。identity は引数の 1 要素として渡す（shell を通さない）。
// env には、呼ぶ側が秘密の変数を外した環境（secrets.scrubEnv）を渡す。

import fs from 'node:fs';

import { runSync, firstLine } from './proc.ts';

const CODESIGN = 'codesign';
const TIMEOUT = 10 * 60_000;

// 署名し直す時に元の署名から引き継ぐ物（entitlements・hardened runtime などの flag・runtime の版）。
// requirements は引き継がない（identity が変わると designated requirement が合わなくなる）。
const PRESERVE = '--preserve-metadata=entitlements,flags,runtime';

// codesign の失敗の理由（「replacing existing signature」の知らせの行は除く）。伏せるのは呼ぶ側。
function failure(r) {
  const lines = String(r.stderr || '')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s !== '' && !/: replacing existing signature$/.test(s));
  if (lines.length) return lines.slice(-3).join('; ').slice(0, 600);
  return firstLine(r.error && r.error.message) || `終了 code ${r.status}`;
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * 署名の argv（codesign の後ろ）。ad-hoc は `-`。
 * identity の時は timestamp を付ける（noTimestamp なら `--timestamp=none`。offline の署名用）。
 * hardened runtime などの flag は元の署名から引き継ぐ（無条件には付けない）。
 */
function signArgs(target, { identity, entitlements, noTimestamp } = {}) {
  const id = identity || '-';
  const args = ['--force', '--sign', id, PRESERVE];
  if (id !== '-') args.push(noTimestamp ? '--timestamp=none' : '--timestamp');
  if (entitlements) args.push('--entitlements', entitlements);
  args.push(target);
  return args;
}

function sign(target, opts = {}) {
  const r = runSync(CODESIGN, signArgs(target, opts), { env: opts.env, timeout: TIMEOUT });
  return { ok: r.ok, message: r.ok ? null : failure(r) };
}

function verifyArgs(target) {
  const args = ['--verify', '--strict', '--verbose=2'];
  if (isDir(target)) args.splice(1, 0, '--deep');
  args.push(target);
  return args;
}

function verify(target, { env } = {}) {
  const r = runSync(CODESIGN, verifyArgs(target), { env, timeout: TIMEOUT });
  return { ok: r.ok, message: r.ok ? null : failure(r) };
}

/**
 * `codesign -dv --verbose=2` の出力から署名の種類を読む（Authority・TeamIdentifier は出さない）。
 * @returns {{ kind: 'adhoc'|'certificate'|'unsigned'|'unknown', identifier, format, runtime }}
 */
function parseDescribe(text) {
  const out = { kind: 'unknown', identifier: null, format: null, runtime: false };
  if (/code object is not signed at all/.test(text)) {
    out.kind = 'unsigned';
    return out;
  }
  const field = (name) => {
    const m = text.match(new RegExp(`^${name}=(.*)$`, 'm'));
    return m ? m[1].trim() : null;
  };
  out.identifier = field('Identifier');
  out.format = field('Format');
  const flags = (text.match(/^CodeDirectory .*flags=0x[0-9a-f]+\(([^)]*)\)/m) || [])[1] || '';
  out.runtime = flags.split(',').includes('runtime');
  if (field('Signature') === 'adhoc' || flags.split(',').includes('adhoc')) out.kind = 'adhoc';
  else if (/^Authority=/m.test(text)) out.kind = 'certificate';
  return out;
}

function describe(target, { env } = {}) {
  const r = runSync(CODESIGN, ['-dv', '--verbose=2', target], { env, timeout: 60_000 });
  // codesign -d は情報を stderr に出す。
  return parseDescribe(`${r.stderr}\n${r.stdout}`);
}

export { CODESIGN, PRESERVE, signArgs, sign, verifyArgs, verify, parseDescribe, describe };
