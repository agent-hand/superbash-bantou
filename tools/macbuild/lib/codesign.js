'use strict';
// codesign の署名・確かめ・署名の種類の読み取り。identity は引数の 1 要素として渡す（shell を通さない）。

const fs = require('node:fs');

const { runSync, firstLine } = require('./proc');

const CODESIGN = 'codesign';

// codesign の失敗の理由（「replacing existing signature」などの知らせの行は除く）。
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

/** 署名の argv（codesign の後ろ）。ad-hoc は `-`、identity は hardened runtime と timestamp を付ける。 */
function signArgs(target, { identity, entitlements } = {}) {
  const id = identity || '-';
  const args = ['--force', '--sign', id];
  if (id !== '-') args.push('--options', 'runtime', '--timestamp');
  if (entitlements) args.push('--entitlements', entitlements);
  args.push(target);
  return args;
}

function sign(target, opts = {}) {
  const r = runSync(CODESIGN, signArgs(target, opts), { timeout: 10 * 60_000 });
  return { ok: r.ok, message: r.ok ? null : failure(r) };
}

function verifyArgs(target) {
  const args = ['--verify', '--strict', '--verbose=2'];
  if (isDir(target)) args.splice(1, 0, '--deep');
  args.push(target);
  return args;
}

function verify(target) {
  const r = runSync(CODESIGN, verifyArgs(target), { timeout: 10 * 60_000 });
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

function describe(target) {
  const r = runSync(CODESIGN, ['-dv', '--verbose=2', target], { timeout: 60_000 });
  // codesign -d は情報を stderr に出す。
  return parseDescribe(`${r.stderr}\n${r.stdout}`);
}

module.exports = { CODESIGN, signArgs, sign, verifyArgs, verify, parseDescribe, describe };
