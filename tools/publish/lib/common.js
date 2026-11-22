'use strict';
// GitHub・Gitea の command に共通の引数の検査。

const fs = require('node:fs');
const path = require('node:path');

const { UsageError } = require('./errors');

const REPO_RE = /^([A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)\/([A-Za-z0-9._-]+)$/;
const TAG_RE = /^[A-Za-z0-9][A-Za-z0-9._\/+-]*$/;
const TARGET_RE = /^[A-Za-z0-9][A-Za-z0-9._\/+-]*$/;

function parseRepo(repo) {
  const m = repo.match(REPO_RE);
  if (!m || m[2] === '.' || m[2] === '..' || m[2].endsWith('.git')) throw new UsageError(`repo は owner/name の形: ${repo}`);
  return { owner: m[1], name: m[2], full: `${m[1]}/${m[2]}` };
}

function checkTag(tag) {
  if (!TAG_RE.test(tag)) throw new UsageError(`tag の形が不正: ${tag}`);
  return tag;
}

function checkTarget(target) {
  if (target !== undefined && !TARGET_RE.test(target)) throw new UsageError(`target（branch か commit）の形が不正: ${target}`);
  return target;
}

function checkVisibility(value, allowed) {
  const v = value === undefined ? 'private' : value;
  if (!allowed.includes(v)) throw new UsageError(`visibility は ${allowed.join(' か ')}: ${v}`);
  return v;
}

function checkDescription(value) {
  if (value !== undefined && /[\0]/.test(value)) throw new UsageError('description に NUL は使えない');
  return value;
}

/** notes の file を読む（本文）。無ければ UsageError。省略時は null。 */
function readNotes(notesFile, cwd) {
  if (notesFile === undefined) return null;
  const abs = path.resolve(cwd, notesFile);
  let st;
  try {
    st = fs.statSync(abs);
  } catch {
    throw new UsageError(`notes の file が無い: ${abs}`);
  }
  if (!st.isFile()) throw new UsageError(`notes は file でなければならない: ${abs}`);
  return { abs, text: fs.readFileSync(abs, 'utf8') };
}

/** assets（`,` 区切りの path）を絶対 path の配列にする。file でなければ UsageError。 */
function resolveAssets(assets, cwd) {
  if (assets === undefined || assets === '') return [];
  const out = [];
  for (const raw of assets.split(',')) {
    const p = raw.trim();
    if (p === '') continue;
    const abs = path.resolve(cwd, p);
    let st;
    try {
      st = fs.statSync(abs);
    } catch {
      throw new UsageError(`asset が無い: ${abs}`);
    }
    if (!st.isFile()) throw new UsageError(`asset は file でなければならない: ${abs}`);
    if (abs.includes('#')) throw new UsageError(`asset の path に # は使えない（gh の label の区切りと混ざる）: ${abs}`);
    out.push(abs);
  }
  return out;
}

module.exports = { parseRepo, checkTag, checkTarget, checkVisibility, checkDescription, readNotes, resolveAssets };
